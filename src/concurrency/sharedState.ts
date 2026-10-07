import { Barrera } from '@/concurrency/barrier';
import { VariableCondicion } from '@/concurrency/conditionVariable';
import { Mutex } from '@/concurrency/mutex';
import { Semaforo } from '@/concurrency/semaphore';
import { FOGONES, type Mecanismos } from '@/kitchen/config';

/**
 * Estado compartido de la cocina: UN solo SharedArrayBuffer visto como
 * Int32Array. Es lo único que se comparte entre hilos (viaja por postMessage
 * por referencia, no se copia). Cada dato vive en una celda (o rango de
 * celdas) fija, calculada por calcularIndices() a partir de las dimensiones
 * del turno, para que el hilo principal y todos los Workers usen el mismo mapa.
 *
 * Mapa de memoria (en orden):
 *   arranque               1   señal de salida (0 = esperar, 1 = cocinar)
 *   mec*                   4   interruptores mutex/semáforo/barrera/VC (1 = encendido)
 *   hornoMutex             1   Mutex del único horno
 *   hornoOcupacion         1   cocineros dentro del horno ahora (detecta colisiones)
 *   fogonesSemaforo        1   Semáforo de fogones (permisos libres, inicia en 3)
 *   fogonesOcupacion       1   cocineros cocinando en fogón ahora (detecta sobrecupo)
 *   fogones                3   quién usa cada fogón (id del cocinero + 1; 0 = libre)
 *   barrera                2   Barrera de la mesa (contador + generación)
 *   colaMutex              1   Mutex de la cola de mesas listas (siempre activo)
 *   colaCondicion          1   Variable de condición "hay una mesa lista"
 *   colaCabeza / colaFinal 1+1 próxima mesa a servir / próximo lugar libre
 *   cola                   mesas  números de mesa listas, en orden de llegada
 *   platosListos           mesas  platos terminados por mesa
 *   estadoMesa             mesas  EstadoMesa
 *   platosAlServir         mesas  platos que tenía la mesa cuando la llevaron
 *   meseroDeMesa           mesas  id del mesero que la llevó (-1 = ninguno)
 *   estadoCocinero         cocineros  EstadoCocinero
 *   mesaCocinero           cocineros  mesa en la que trabaja (-1 = ninguna)
 *   estadoMesero           meseros    EstadoMesero
 *   mesaMesero             meseros    mesa que lleva (-1 = ninguna)
 *   consultasEnVano        meseros    consultas de espera ocupada de cada mesero
 *   colisionesHorno, sobrecuposFogon, mesasServidas, mesasIncompletas,
 *   platosPreparados       1 c/u      contadores del resumen del turno
 */

export interface DimensionesCocina {
  cocineros: number;
  meseros: number;
  mesas: number;
}

export const EstadoCocinero = {
  INICIANDO: 0,
  ESPERANDO_FOGON: 1,
  COCINANDO: 2,
  ESPERANDO_HORNO: 3,
  HORNEANDO: 4,
  ESPERANDO_BARRERA: 5,
  TERMINADO: 6,
  /** Ya cocinó y soltó (o está por soltar) el fogón/horno; no ocupa ningún recurso. */
  EMPLATANDO: 7,
} as const;
export type EstadoCocinero = (typeof EstadoCocinero)[keyof typeof EstadoCocinero];

export const EstadoMesero = {
  INICIANDO: 0,
  DURMIENDO: 1,
  CONSULTANDO: 2,
  LLEVANDO: 3,
  TERMINADO: 4,
} as const;
export type EstadoMesero = (typeof EstadoMesero)[keyof typeof EstadoMesero];

export const EstadoMesa = {
  EN_COCINA: 0,
  LISTA: 1,
  EN_CAMINO: 2,
  SERVIDA: 3,
  SERVIDA_INCOMPLETA: 4,
} as const;
export type EstadoMesa = (typeof EstadoMesa)[keyof typeof EstadoMesa];

export type IndicesCocina = ReturnType<typeof calcularIndices>;

/** Mapa de índices de cada dato dentro del Int32Array compartido. */
export function calcularIndices({ cocineros, meseros, mesas }: DimensionesCocina) {
  let siguiente = 0;
  const reservar = (celdas: number) => {
    const inicio = siguiente;
    siguiente += celdas;
    return inicio;
  };

  const indices = {
    arranque: reservar(1),
    mecMutex: reservar(1),
    mecSemaforo: reservar(1),
    mecBarrera: reservar(1),
    mecVariableCondicion: reservar(1),

    hornoMutex: reservar(Mutex.CELDAS),
    hornoOcupacion: reservar(1),
    fogonesSemaforo: reservar(Semaforo.CELDAS),
    fogonesOcupacion: reservar(1),
    fogones: reservar(FOGONES),
    barrera: reservar(Barrera.CELDAS),

    colaMutex: reservar(Mutex.CELDAS),
    colaCondicion: reservar(VariableCondicion.CELDAS),
    colaCabeza: reservar(1),
    colaFinal: reservar(1),
    cola: reservar(mesas),

    platosListos: reservar(mesas),
    estadoMesa: reservar(mesas),
    platosAlServir: reservar(mesas),
    meseroDeMesa: reservar(mesas),

    estadoCocinero: reservar(cocineros),
    mesaCocinero: reservar(cocineros),
    estadoMesero: reservar(meseros),
    mesaMesero: reservar(meseros),
    consultasEnVano: reservar(meseros),

    colisionesHorno: reservar(1),
    sobrecuposFogon: reservar(1),
    mesasServidas: reservar(1),
    mesasIncompletas: reservar(1),
    platosPreparados: reservar(1),
  };
  return { ...indices, totalCeldas: siguiente };
}

/**
 * Crea e inicializa el estado compartido. La llama el hilo principal antes
 * de lanzar los Workers; los interruptores quedan fijos durante el turno.
 */
export function crearEstadoCompartido(dimensiones: DimensionesCocina, mecanismos: Mecanismos): SharedArrayBuffer {
  const indices = calcularIndices(dimensiones);
  const buffer = new SharedArrayBuffer(indices.totalCeldas * Int32Array.BYTES_PER_ELEMENT);
  const memoria = new Int32Array(buffer); // todo arranca en 0

  memoria[indices.mecMutex] = mecanismos.mutex ? 1 : 0;
  memoria[indices.mecSemaforo] = mecanismos.semaforo ? 1 : 0;
  memoria[indices.mecBarrera] = mecanismos.barrera ? 1 : 0;
  memoria[indices.mecVariableCondicion] = mecanismos.variableCondicion ? 1 : 0;

  Semaforo.inicializar(memoria, indices.fogonesSemaforo, FOGONES);
  memoria.fill(-1, indices.meseroDeMesa, indices.meseroDeMesa + dimensiones.mesas);
  memoria.fill(-1, indices.mesaCocinero, indices.mesaCocinero + dimensiones.cocineros);
  memoria.fill(-1, indices.mesaMesero, indices.mesaMesero + dimensiones.meseros);
  return buffer;
}

/** Interruptores de los mecanismos que leen los Workers (el Join es del hilo principal). */
export interface MecanismosActivos {
  mutex: boolean;
  semaforo: boolean;
  barrera: boolean;
  variableCondicion: boolean;
}

/** Vista de un Worker sobre el estado compartido, con las primitivas ya armadas. */
export interface CocinaCompartida {
  memoria: Int32Array;
  indices: IndicesCocina;
  dimensiones: DimensionesCocina;
  mecanismos: MecanismosActivos;
  horno: Mutex;
  fogones: Semaforo;
  barreraMesa: Barrera;
  colaMutex: Mutex;
  mesaListaCondicion: VariableCondicion;
}

/** Solo para Workers: las primitivas devueltas pueden bloquear con Atomics.wait. */
export function abrirEstadoCompartido(buffer: SharedArrayBuffer, dimensiones: DimensionesCocina): CocinaCompartida {
  const memoria = new Int32Array(buffer);
  const indices = calcularIndices(dimensiones);
  return {
    memoria,
    indices,
    dimensiones,
    mecanismos: {
      mutex: Atomics.load(memoria, indices.mecMutex) === 1,
      semaforo: Atomics.load(memoria, indices.mecSemaforo) === 1,
      barrera: Atomics.load(memoria, indices.mecBarrera) === 1,
      variableCondicion: Atomics.load(memoria, indices.mecVariableCondicion) === 1,
    },
    horno: new Mutex(memoria, indices.hornoMutex),
    fogones: new Semaforo(memoria, indices.fogonesSemaforo),
    barreraMesa: new Barrera(memoria, indices.barrera, dimensiones.cocineros),
    colaMutex: new Mutex(memoria, indices.colaMutex),
    mesaListaCondicion: new VariableCondicion(memoria, indices.colaCondicion),
  };
}

/** Solo Workers: duerme hasta que el jefe dé la señal de salida. */
export function esperarArranque(cocina: CocinaCompartida): void {
  const { memoria, indices } = cocina;
  while (Atomics.load(memoria, indices.arranque) === 0) {
    Atomics.wait(memoria, indices.arranque, 0);
  }
}

/** Contadores que alimentan el resumen del turno. */
export interface ContadoresCocina {
  colisionesHorno: number;
  sobrecuposFogon: number;
  mesasServidas: number;
  mesasIncompletas: number;
  platosPreparados: number;
  consultasEnVano: number;
}

/** Foto del estado de la cocina en un instante, lista para pintar. */
export interface InstantaneaCocina {
  /**
   * Cocineros dentro del horno según el contador de ocupación real (una sola
   * lectura atómica). Es lo que decide si hay colisión: más de 1.
   */
  ocupacionHorno: number;
  /** Cocineros en los fogones según su contador real (más de 3 = sobrecupo). */
  ocupacionFogones: number;
  /**
   * Quiénes están horneando, según su estado. Solo sirve para mostrar nombres:
   * la foto se arma con varias lecturas sucesivas, no en un único instante,
   * así que un cocinero que sale justo entre dos lecturas puede figurar de más.
   */
  enHorno: number[];
  /** Quién usa cada fogón (id del cocinero) o null si está libre. */
  fogones: (number | null)[];
  /** Cocineros cocinando sin fogón propio, según su estado (mismo matiz que enHorno). */
  enSobrecupo: number[];
  cocineros: { estado: EstadoCocinero; mesa: number }[];
  meseros: { estado: EstadoMesero; mesa: number; consultasEnVano: number }[];
  mesas: { estado: EstadoMesa; platosListos: number; platosAlServir: number; mesero: number }[];
  contadores: ContadoresCocina;
}

/**
 * Solo lecturas atómicas, nunca bloquea: apta para el hilo principal, que la
 * llama en cada cuadro de animación.
 */
export function leerInstantanea(buffer: SharedArrayBuffer, dimensiones: DimensionesCocina): InstantaneaCocina {
  const memoria = new Int32Array(buffer);
  const ix = calcularIndices(dimensiones);
  const leer = (indice: number) => Atomics.load(memoria, indice);

  const cocineros = Array.from({ length: dimensiones.cocineros }, (_, id) => ({
    estado: leer(ix.estadoCocinero + id) as EstadoCocinero,
    mesa: leer(ix.mesaCocinero + id),
  }));
  const fogones = Array.from({ length: FOGONES }, (_, f) => {
    const ocupante = leer(ix.fogones + f);
    return ocupante === 0 ? null : ocupante - 1;
  });
  const enHorno = cocineros.flatMap((c, id) => (c.estado === EstadoCocinero.HORNEANDO ? [id] : []));
  const enSobrecupo = cocineros.flatMap((c, id) =>
    c.estado === EstadoCocinero.COCINANDO && !fogones.includes(id) ? [id] : [],
  );
  const meseros = Array.from({ length: dimensiones.meseros }, (_, id) => ({
    estado: leer(ix.estadoMesero + id) as EstadoMesero,
    mesa: leer(ix.mesaMesero + id),
    consultasEnVano: leer(ix.consultasEnVano + id),
  }));
  const mesas = Array.from({ length: dimensiones.mesas }, (_, m) => ({
    estado: leer(ix.estadoMesa + m) as EstadoMesa,
    platosListos: leer(ix.platosListos + m),
    platosAlServir: leer(ix.platosAlServir + m),
    mesero: leer(ix.meseroDeMesa + m),
  }));

  return {
    ocupacionHorno: leer(ix.hornoOcupacion),
    ocupacionFogones: leer(ix.fogonesOcupacion),
    enHorno,
    fogones,
    enSobrecupo,
    cocineros,
    meseros,
    mesas,
    contadores: {
      colisionesHorno: leer(ix.colisionesHorno),
      sobrecuposFogon: leer(ix.sobrecuposFogon),
      mesasServidas: leer(ix.mesasServidas),
      mesasIncompletas: leer(ix.mesasIncompletas),
      platosPreparados: leer(ix.platosPreparados),
      consultasEnVano: meseros.reduce((suma, m) => suma + m.consultasEnVano, 0),
    },
  };
}

/**
 * Hilo principal: da la señal de salida y despierta a todos los Workers a la
 * vez. Atomics.notify sí está permitido en el hilo principal (solo wait no).
 */
export function darArranque(buffer: SharedArrayBuffer, dimensiones: DimensionesCocina): void {
  const memoria = new Int32Array(buffer);
  const { arranque } = calcularIndices(dimensiones);
  Atomics.store(memoria, arranque, 1);
  Atomics.notify(memoria, arranque);
}
