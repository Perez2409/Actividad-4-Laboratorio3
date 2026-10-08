/**
 * Tipos y valores por defecto de la simulación de la cocina.
 * Sin lógica de concurrencia: la comparten el hilo principal y los Workers.
 */

/** Cantidad fija de fogones de la cocina (los permisos del semáforo). */
export const FOGONES = 3;

export interface ConfiguracionTurno {
  /** Cantidad de Workers cocineros; también es la cantidad de platos por mesa. */
  cocineros: number;
  /** Cantidad de Workers meseros. */
  meseros: number;
  /** Mesas que se atienden en el turno. */
  mesas: number;
  /** Porcentaje (0-100) de platos que además del fogón necesitan el horno. */
  porcentajeHorno: number;
  /** Tiempo aproximado de cada etapa de cocción (fogón u horno), en ms. */
  tiempoCoccionMs: number;
}

/** Interruptores de los cinco mecanismos: true = encendido. */
export interface Mecanismos {
  mutex: boolean;
  semaforo: boolean;
  barrera: boolean;
  variableCondicion: boolean;
  join: boolean;
}

export const CONFIGURACION_POR_DEFECTO: ConfiguracionTurno = {
  cocineros: 4,
  meseros: 2,
  mesas: 10,
  porcentajeHorno: 50,
  tiempoCoccionMs: 800,
};

export const LIMITES: Record<keyof ConfiguracionTurno, { min: number; max: number }> = {
  cocineros: { min: 1, max: 8 },
  meseros: { min: 1, max: 4 },
  mesas: { min: 1, max: 30 },
  porcentajeHorno: { min: 0, max: 100 },
  tiempoCoccionMs: { min: 20, max: 1000 },
};

export const MECANISMOS_ENCENDIDOS: Mecanismos = {
  mutex: true,
  semaforo: true,
  barrera: true,
  variableCondicion: true,
  join: true,
};

export const MECANISMOS_APAGADOS: Mecanismos = {
  mutex: false,
  semaforo: false,
  barrera: false,
  variableCondicion: false,
  join: false,
};

/** Lleva cada campo a un entero dentro de sus límites (los inputs pueden quedar vacíos o fuera de rango). */
export function normalizarConfiguracion(config: ConfiguracionTurno): ConfiguracionTurno {
  const ajustar = (campo: keyof ConfiguracionTurno) => {
    const { min, max } = LIMITES[campo];
    const valor = Math.round(config[campo]);
    return Number.isFinite(valor) ? Math.min(max, Math.max(min, valor)) : CONFIGURACION_POR_DEFECTO[campo];
  };
  return {
    cocineros: ajustar('cocineros'),
    meseros: ajustar('meseros'),
    mesas: ajustar('mesas'),
    porcentajeHorno: ajustar('porcentajeHorno'),
    tiempoCoccionMs: ajustar('tiempoCoccionMs'),
  };
}

/**
 * Avisos para la demostración: configuraciones en las que la falla de algún
 * mecanismo es imposible aunque se apague, porque nunca hay competencia.
 */
export function advertenciasConfiguracion(config: ConfiguracionTurno): string[] {
  const avisos: string[] = [];
  if (config.cocineros <= FOGONES) {
    avisos.push(
      `Con ${config.cocineros} cocinero(s) nunca hay más de ${FOGONES} en los fogones: la falla del semáforo no puede aparecer. Usa 4 o más.`,
    );
  }
  if (config.cocineros === 1) {
    avisos.push('Con 1 cocinero nadie compite por el horno ni hay platos que esperar: el mutex y la barrera no pueden fallar.');
  }
  if (config.porcentajeHorno === 0) {
    avisos.push('Con 0 % de platos de horno nadie usa el horno: la falla del mutex no puede aparecer.');
  }
  return avisos;
}

/** Un plato del menú: si pasa por el horno y cuánto varía su tiempo de cocción. */
export interface Plato {
  horno: boolean;
  /** Multiplicador del tiempo de cocción (0.7 a 1.3), para que no terminen todos a la vez. */
  factor: number;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
function crearAleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Menú del turno: menu[mesa][cocinero]. Es determinista para una misma
 * semilla, así la comparación "todo encendido" vs "todo apagado" cocina
 * exactamente los mismos platos.
 */
export function generarMenu(config: ConfiguracionTurno, semilla: number): Plato[][] {
  const aleatorio = crearAleatorio(semilla);
  return Array.from({ length: config.mesas }, () =>
    Array.from({ length: config.cocineros }, () => ({
      horno: aleatorio() * 100 < config.porcentajeHorno,
      factor: 0.7 + aleatorio() * 0.6,
    })),
  );
}

/** Tiempo que tarda un mesero en llevar una mesa. */
export function tiempoServicioMs(config: ConfiguracionTurno): number {
  return Math.round(config.tiempoCoccionMs / 2);
}

/**
 * Estimación ingenua de la duración del turno (mesas × tiempo de cocción).
 * Con el Join apagado, el jefe arma el resumen a la mitad de este tiempo sin
 * esperar a nadie.
 */
export function duracionEstimadaTurnoMs(config: ConfiguracionTurno): number {
  return config.mesas * config.tiempoCoccionMs;
}
