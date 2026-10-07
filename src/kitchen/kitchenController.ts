/**
 * JEFE DE COCINA (hilo principal).
 * Crea el estado compartido, lanza los Workers (cocineros y meseros), da la
 * señal de salida y cierra el turno armando el resumen.
 *
 * El cierre es donde actúa el JOIN:
 *  - Encendido: el jefe espera el mensaje final de TODOS los Workers
 *    (unirTodos) y recién entonces arma el resumen; los totales son exactos.
 *  - Apagado: el jefe arma el resumen con un temporizador, a la mitad del
 *    tiempo estimado del turno, sin esperar a nadie; los totales salen
 *    incompletos. Los Workers siguen trabajando y el log muestra lo que
 *    ocurre después del cierre. El seguimiento de la terminación real se hace
 *    igual, pero solo para mostrar los totales verdaderos y liberar los
 *    Workers, nunca para decidir cuándo se arma el resumen.
 *
 * No usa React ni bloquea nunca: el hilo principal solo usa postMessage y
 * promesas (Atomics.wait está prohibido aquí).
 */
import { unirTodos } from '@/concurrency/join';
import {
  crearEstadoCompartido,
  darArranque,
  leerInstantanea,
  type DimensionesCocina,
  type InstantaneaCocina,
} from '@/concurrency/sharedState';
import {
  duracionEstimadaTurnoMs,
  generarMenu,
  MECANISMOS_APAGADOS,
  MECANISMOS_ENCENDIDOS,
  tiempoServicioMs,
  type ConfiguracionTurno,
  type Mecanismos,
} from '@/kitchen/config';
import {
  esReporteFinal,
  type EventoCocina,
  type InicioCocinero,
  type InicioMesero,
  type MensajeDeWorker,
} from '@/workers/protocol';

/** Semilla fija del menú: todas las corridas cocinan los mismos platos. */
const SEMILLA_MENU = 2026;

/** Eventos que registra el propio jefe (hilo principal). */
export type EventoJefe = { hora: number } & (
  | { tipo: 'turno-iniciado'; cocineros: number; meseros: number; mesas: number }
  | { tipo: 'resumen-con-join'; mesasServidas: number; duracionMs: number }
  | { tipo: 'resumen-sin-join'; mesasServidas: number; mesas: number; hilosActivos: number; duracionMs: number }
  | { tipo: 'turno-real-terminado'; mesasServidas: number; mesasEnResumen: number; duracionMs: number }
  | { tipo: 'error-worker'; mensaje: string }
);

export interface EntradaLog {
  id: number;
  /** true si ocurrió después de que el jefe ya había cerrado el turno (solo pasa sin Join). */
  trasCierre: boolean;
  evento: EventoCocina | EventoJefe;
}

export interface ResumenTurno {
  generadoCon: 'join' | 'temporizador';
  mecanismos: Mecanismos;
  mesasTotales: number;
  platosTotales: number;
  mesasServidas: number;
  mesasIncompletas: number;
  colisionesHorno: number;
  sobrecuposFogon: number;
  consultasEnVano: number;
  platosPreparados: number;
  duracionMs: number;
  /** Workers que seguían trabajando cuando se armó el resumen. */
  hilosActivos: number;
}

export interface ResultadoTurno {
  /** El resumen oficial del jefe (con Join, exacto; sin Join, prematuro). */
  resumen: ResumenTurno;
  /** Lo que realmente pasó, medido cuando terminó el último Worker. */
  totalesReales: ResumenTurno;
}

export interface OyentesCocina {
  alIniciarTurno(config: ConfiguracionTurno, mecanismos: Mecanismos): void;
  alRegistrar(entrada: EntradaLog): void;
  alResumen(resumen: ResumenTurno): void;
  alTerminarTurno(resultado: ResultadoTurno): void;
}

const CANCELADO = Symbol('cancelado');

/** Resuelve con el primer mensaje de `hilo` que cumpla `condicion`. */
function esperarMensaje(hilo: Worker, condicion: (dato: MensajeDeWorker) => boolean): Promise<void> {
  return new Promise((resolver) => {
    const oyente = (evento: MessageEvent<MensajeDeWorker>) => {
      if (!condicion(evento.data)) return;
      hilo.removeEventListener('message', oyente);
      resolver();
    };
    hilo.addEventListener('message', oyente);
  });
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export class ControladorCocina {
  private readonly oyentes: OyentesCocina;
  private hilos: Worker[] = [];
  private buffer: SharedArrayBuffer | null = null;
  private dimensiones: DimensionesCocina | null = null;
  private siguienteIdLog = 0;
  private cancelar: (() => void) | null = null;

  constructor(oyentes: OyentesCocina) {
    this.oyentes = oyentes;
  }

  /** Foto del turno actual (o del último que corrió); null si nunca se inició uno. */
  instantanea(): InstantaneaCocina | null {
    return this.buffer && this.dimensiones ? leerInstantanea(this.buffer, this.dimensiones) : null;
  }

  /** Corta el turno en curso: termina todos los Workers sin esperar. */
  detener(): void {
    this.cancelar?.();
    this.cancelar = null;
    for (const hilo of this.hilos) hilo.terminate();
    this.hilos = [];
  }

  /**
   * Corre un turno completo. Resuelve cuando terminó el último Worker (con o
   * sin Join), o con null si se detuvo antes.
   */
  async iniciar(config: ConfiguracionTurno, mecanismos: Mecanismos): Promise<ResultadoTurno | null> {
    this.detener();

    let alCancelar = () => {};
    const cancelado = new Promise<typeof CANCELADO>((resolver) => (alCancelar = () => resolver(CANCELADO)));
    this.cancelar = alCancelar;
    const salvoCancelacion = <T>(promesa: Promise<T>) => Promise.race([promesa, cancelado]);

    const dimensiones: DimensionesCocina = { cocineros: config.cocineros, meseros: config.meseros, mesas: config.mesas };
    const buffer = crearEstadoCompartido(dimensiones, mecanismos);
    this.buffer = buffer;
    this.dimensiones = dimensiones;
    this.oyentes.alIniciarTurno(config, mecanismos);

    let cerrado = false;
    let terminados = 0;
    const registrar = (evento: EventoCocina | EventoJefe) =>
      this.oyentes.alRegistrar({ id: this.siguienteIdLog++, trasCierre: cerrado, evento });

    const hilos = this.lanzarHilos(config, buffer, dimensiones);
    this.hilos = hilos;
    for (const hilo of hilos) {
      hilo.addEventListener('message', (evento: MessageEvent<MensajeDeWorker>) => {
        const mensaje = evento.data;
        if (mensaje.tipo === 'evento') registrar(mensaje.evento);
        else if (mensaje.tipo === 'terminado') terminados++;
      });
      hilo.addEventListener('error', (evento: ErrorEvent) => {
        registrar({ tipo: 'error-worker', hora: Date.now(), mensaje: evento.message });
      });
    }

    // Todos los Workers quedan dormidos en la señal de salida; se da cuando
    // están listos, para que arranquen a la vez y el reloj sea preciso.
    const listos = await salvoCancelacion(Promise.all(hilos.map((h) => esperarMensaje(h, (m) => m.tipo === 'listo'))));
    if (listos === CANCELADO) return null;

    const inicio = performance.now();
    darArranque(buffer, dimensiones);
    registrar({ tipo: 'turno-iniciado', hora: Date.now(), ...dimensiones });

    const leerResumen = (generadoCon: ResumenTurno['generadoCon']): ResumenTurno => {
      const { contadores } = leerInstantanea(buffer, dimensiones);
      return {
        generadoCon,
        mecanismos,
        mesasTotales: config.mesas,
        platosTotales: config.mesas * config.cocineros,
        ...contadores,
        duracionMs: performance.now() - inicio,
        hilosActivos: hilos.length - terminados,
      };
    };

    // Terminación real de todos los Workers (se espera SIEMPRE, ver arriba).
    const finDeTodos = unirTodos(hilos, esReporteFinal);
    // Sin Join se espera más tarde: esto evita que un Worker que falle antes
    // deje un rechazo "sin atender" (el await de abajo igual lo recibe).
    finDeTodos.catch(() => {});

    let resumen: ResumenTurno;
    if (mecanismos.join) {
      // --- JOIN: el jefe no apaga las luces hasta que sale el último ---
      const fin = await salvoCancelacion(finDeTodos);
      if (fin === CANCELADO) return null;
      resumen = leerResumen('join');
      registrar({ tipo: 'resumen-con-join', hora: Date.now(), mesasServidas: resumen.mesasServidas, duracionMs: resumen.duracionMs });
    } else {
      // --- SIN JOIN: el jefe cierra "a la hora prevista" sin verificar ---
      const espera = await salvoCancelacion(dormir(duracionEstimadaTurnoMs(config) / 2));
      if (espera === CANCELADO) return null;
      resumen = leerResumen('temporizador');
      registrar({
        tipo: 'resumen-sin-join',
        hora: Date.now(),
        mesasServidas: resumen.mesasServidas,
        mesas: config.mesas,
        hilosActivos: resumen.hilosActivos,
        duracionMs: resumen.duracionMs,
      });
    }
    cerrado = true;
    this.oyentes.alResumen(resumen);

    const fin = await salvoCancelacion(finDeTodos);
    if (fin === CANCELADO) return null;
    const totalesReales = leerResumen('join');
    if (!mecanismos.join) {
      registrar({
        tipo: 'turno-real-terminado',
        hora: Date.now(),
        mesasServidas: totalesReales.mesasServidas,
        mesasEnResumen: resumen.mesasServidas,
        duracionMs: totalesReales.duracionMs,
      });
    }

    this.cancelar = null;
    this.hilos = [];
    const resultado = { resumen, totalesReales };
    this.oyentes.alTerminarTurno(resultado);
    return resultado;
  }

  /**
   * Botón "Comparar": el mismo turno (mismo menú) con todo encendido y luego
   * con todo apagado. Cada corrida termina por completo antes de la otra,
   * para que no compitan por la CPU.
   */
  async comparar(config: ConfiguracionTurno): Promise<{ encendido: ResultadoTurno; apagado: ResultadoTurno } | null> {
    const encendido = await this.iniciar(config, MECANISMOS_ENCENDIDOS);
    if (!encendido) return null;
    const apagado = await this.iniciar(config, MECANISMOS_APAGADOS);
    if (!apagado) return null;
    return { encendido, apagado };
  }

  private lanzarHilos(config: ConfiguracionTurno, buffer: SharedArrayBuffer, dimensiones: DimensionesCocina): Worker[] {
    const menu = generarMenu(config, SEMILLA_MENU);

    const cocineros = Array.from({ length: config.cocineros }, (_, id) => {
      const hilo = new Worker(new URL('../workers/cocinero.worker.ts', import.meta.url), {
        type: 'module',
        name: `Cocinero ${id + 1}`,
      });
      const inicio: InicioCocinero = {
        tipo: 'inicio',
        id,
        buffer,
        dimensiones,
        platos: menu.map((platosDeMesa) => platosDeMesa[id]),
        tiempoCoccionMs: config.tiempoCoccionMs,
      };
      hilo.postMessage(inicio);
      return hilo;
    });

    const meseros = Array.from({ length: config.meseros }, (_, id) => {
      const hilo = new Worker(new URL('../workers/mesero.worker.ts', import.meta.url), {
        type: 'module',
        name: `Mesero ${id + 1}`,
      });
      const inicio: InicioMesero = {
        tipo: 'inicio',
        id,
        buffer,
        dimensiones,
        tiempoServicioMs: tiempoServicioMs(config),
      };
      hilo.postMessage(inicio);
      return hilo;
    });

    return [...cocineros, ...meseros];
  }
}
