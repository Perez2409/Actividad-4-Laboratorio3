/**
 * Cálculo del puntaje de urgencia de un paciente: la "carga de trabajo
 * paralelizable" del enunciado. Es CPU-bound real (no un setTimeout ni un
 * valor al azar instantáneo) para que la ganancia de repartirlo entre varios
 * Workers sea medible de verdad. El número de iteraciones es calibrable:
 * a más iteraciones, más ms perceptibles por paciente.
 */

// Valor de partida razonable en hardware de escritorio moderno (~2-8ms por
// paciente) — usado en la prueba de rendimiento, donde procesar 200 pacientes
// tiene que terminar en pocos segundos. Ajustar según la máquina de la demo.
export const DEFAULT_URGENCY_ITERATIONS = 150_000;

// La simulación en vivo usa una ventana bastante más grande (~13x, decenas de
// ms por paciente) a propósito: la condición de carrera depende de que el
// sistema operativo alcance a intercalar dos estaciones durante ese cálculo.
// Con un cálculo demasiado corto, en máquinas con pocos núcleos o quantum de
// scheduling grueso cada estación puede terminar su ciclo completo (leer cama
// libre -> calcular -> escribir) sin que la otra llegue a correr, y el bug
// nunca se ve — no porque esté arreglado, sino porque nunca compitieron de
// verdad. Agrandar la ventana no "fuerza" el bug artificialmente: sigue siendo
// el mismo trabajo real, solo que más perceptible, tal como pide el enunciado.
export const LIVE_DEMO_URGENCY_ITERATIONS = 2_000_000;

export interface UrgencyInput {
  age: number;
  heartRate: number;
  /** Semilla de severidad normalizada 0..1, derivada del id del paciente. */
  severitySeed: number;
}

/** Hash entero de 32 bits (Murmur-like), determinista, sin dependencias. */
function hash32(seed: number): number {
  let x = seed | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

/**
 * La cola compartida solo transporta un id de paciente (un int32 por slot),
 * así que los signos vitales se derivan de ese id de forma determinista en
 * vez de necesitar una tabla de pacientes en memoria compartida.
 */
export function deriveVitalsFromPatientId(patientId: number): UrgencyInput {
  const h = hash32(patientId);
  return {
    age: 1 + (h % 99),
    heartRate: 40 + ((h >>> 8) % 140),
    severitySeed: ((h >>> 16) % 1000) / 1000,
  };
}

/** Trabajo CPU-bound real: trigonometría + raíz cuadrada encadenadas. */
export function computeUrgencyScore(input: UrgencyInput, iterations: number): number {
  let acc = input.severitySeed + 1;
  for (let i = 0; i < iterations; i++) {
    acc = Math.sqrt(Math.abs(Math.sin(acc * (input.heartRate + i)) * Math.cos(acc + input.age)));
    acc += 1e-9;
  }

  const workSignal = Math.abs(Math.sin(acc * 1000));
  const riskFactor =
    (input.heartRate > 120 || input.heartRate < 50 ? 0.3 : 0) +
    (input.age > 65 ? 0.2 : 0) +
    input.severitySeed * 0.5;

  const score = 1 + Math.round((workSignal * 0.5 + riskFactor) * 4);
  return Math.min(5, Math.max(1, score));
}
