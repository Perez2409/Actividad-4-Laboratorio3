import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstantaneaCocina } from '@/concurrency/sharedState';
import type { ConfiguracionTurno, Mecanismos } from '@/kitchen/config';
import { ControladorCocina, type EntradaLog, type ResultadoTurno, type ResumenTurno } from '@/kitchen/kitchenController';

const LIMITE_LOG = 500;

/**
 * Más reciente primero. Los mensajes de distintos Workers pueden llegar
 * intercalados por unos milisegundos; se ordena por la hora en que ocurrió
 * cada evento (y, a igual hora, por orden de llegada).
 */
const masRecientePrimero = (a: EntradaLog, b: EntradaLog) => b.evento.hora - a.evento.hora || b.id - a.id;

export type FaseCocina = 'inactiva' | 'en-curso' | 'comparando';

export interface EstadoCocina {
  fase: FaseCocina;
  /** Configuración y mecanismos del turno en curso o del último que corrió. */
  config: ConfiguracionTurno | null;
  mecanismos: Mecanismos | null;
  instantanea: InstantaneaCocina | null;
  /** Más reciente primero. */
  log: EntradaLog[];
  resumen: ResumenTurno | null;
  totalesReales: ResumenTurno | null;
  comparacion: { encendido: ResultadoTurno; apagado: ResultadoTurno } | null;
  error: string | null;
}

export interface AccionesCocina {
  iniciar: (config: ConfiguracionTurno, mecanismos: Mecanismos) => void;
  comparar: (config: ConfiguracionTurno) => void;
  detener: () => void;
}

const ESTADO_INICIAL: EstadoCocina = {
  fase: 'inactiva',
  config: null,
  mecanismos: null,
  instantanea: null,
  log: [],
  resumen: null,
  totalesReales: null,
  comparacion: null,
  error: null,
};

/**
 * Puente entre ControladorCocina y React: no contiene lógica de concurrencia.
 * Los eventos del log se acumulan y, junto con la foto del estado compartido,
 * se vuelcan a React una vez por cuadro de animación (requestAnimationFrame),
 * en vez de re-renderizar por cada mensaje de cada Worker.
 */
export function useKitchen(): [EstadoCocina, AccionesCocina] {
  const [estado, setEstado] = useState<EstadoCocina>(ESTADO_INICIAL);
  const controladorRef = useRef<ControladorCocina | null>(null);
  const pendientesRef = useRef<EntradaLog[]>([]);
  const cuadroRef = useRef<number | null>(null);

  const refrescar = useCallback(() => {
    const nuevas = pendientesRef.current;
    pendientesRef.current = [];
    const instantanea = controladorRef.current?.instantanea() ?? null;
    setEstado((prev) => ({
      ...prev,
      instantanea,
      log: nuevas.length > 0 ? nuevas.concat(prev.log).sort(masRecientePrimero).slice(0, LIMITE_LOG) : prev.log,
    }));
  }, []);

  const iniciarRefresco = useCallback(() => {
    if (cuadroRef.current !== null) return;
    const cuadro = () => {
      refrescar();
      cuadroRef.current = requestAnimationFrame(cuadro);
    };
    cuadroRef.current = requestAnimationFrame(cuadro);
  }, [refrescar]);

  const detenerRefresco = useCallback(() => {
    if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    cuadroRef.current = null;
    refrescar(); // último volcado, para que quede la foto final
  }, [refrescar]);

  const obtenerControlador = useCallback(() => {
    controladorRef.current ??= new ControladorCocina({
      alIniciarTurno: (config, mecanismos) => {
        pendientesRef.current = [];
        setEstado((prev) => ({ ...prev, config, mecanismos, log: [], resumen: null, totalesReales: null }));
        iniciarRefresco();
      },
      alRegistrar: (entrada) => {
        pendientesRef.current.push(entrada);
      },
      alResumen: (resumen) => setEstado((prev) => ({ ...prev, resumen })),
      alTerminarTurno: ({ totalesReales }) => setEstado((prev) => ({ ...prev, totalesReales })),
    });
    return controladorRef.current;
  }, [iniciarRefresco]);

  const ejecutar = useCallback(
    async (fase: FaseCocina, tarea: (controlador: ControladorCocina) => Promise<unknown>) => {
      setEstado((prev) => ({ ...prev, fase, comparacion: null, error: null }));
      const controlador = obtenerControlador();
      try {
        await tarea(controlador);
      } catch (error) {
        controlador.detener();
        setEstado((prev) => ({ ...prev, error: error instanceof Error ? error.message : String(error) }));
      } finally {
        detenerRefresco();
        setEstado((prev) => ({ ...prev, fase: 'inactiva' }));
      }
    },
    [obtenerControlador, detenerRefresco],
  );

  const iniciar = useCallback(
    (config: ConfiguracionTurno, mecanismos: Mecanismos) => {
      void ejecutar('en-curso', (controlador) => controlador.iniciar(config, mecanismos));
    },
    [ejecutar],
  );

  const comparar = useCallback(
    (config: ConfiguracionTurno) => {
      void ejecutar('comparando', async (controlador) => {
        const comparacion = await controlador.comparar(config);
        if (comparacion) setEstado((prev) => ({ ...prev, comparacion }));
      });
    },
    [ejecutar],
  );

  const detener = useCallback(() => controladorRef.current?.detener(), []);

  // Al desmontar: terminar los Workers y cortar el refresco.
  useEffect(
    () => () => {
      controladorRef.current?.detener();
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    },
    [],
  );

  return [estado, { iniciar, comparar, detener }];
}
