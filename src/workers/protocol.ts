import type { DimensionesCocina } from '@/concurrency/sharedState';
import type { Plato } from '@/kitchen/config';

// Todos los ids (cocinero, mesero, mesa) viajan desde 0; la UI los muestra desde 1.

// ---- Hilo principal -> Worker ----

export interface InicioCocinero {
  tipo: 'inicio';
  id: number;
  buffer: SharedArrayBuffer;
  dimensiones: DimensionesCocina;
  /** El plato que este cocinero prepara en cada mesa: platos[mesa]. */
  platos: Plato[];
  tiempoCoccionMs: number;
}

export interface InicioMesero {
  tipo: 'inicio';
  id: number;
  buffer: SharedArrayBuffer;
  dimensiones: DimensionesCocina;
  tiempoServicioMs: number;
}

// ---- Worker -> hilo principal ----

/** Lo que registra el log. `hora` es Date.now() en el momento del evento. */
export type EventoCocina = { hora: number } & (
  | { tipo: 'fogon-tomado'; cocinero: number; mesa: number; fogon: number }
  | { tipo: 'fogon-sobrecupo'; cocinero: number; mesa: number; ocupacion: number }
  | { tipo: 'horno-tomado'; cocinero: number; mesa: number }
  | { tipo: 'horno-colision'; cocinero: number; mesa: number; ocupacion: number }
  | { tipo: 'plato-listo'; cocinero: number; mesa: number; listos: number; total: number }
  | { tipo: 'mesa-lista'; cocinero: number; mesa: number; listos: number; total: number }
  | { tipo: 'mesa-servida'; mesero: number; mesa: number; total: number }
  | { tipo: 'mesa-incompleta'; mesero: number; mesa: number; listos: number; total: number }
  | { tipo: 'espera-ocupada'; mesero: number; mesa: number; consultas: number }
);

/** Último mensaje de cada Worker: es la señal que espera el Join. */
export type ReporteFinal =
  | { tipo: 'terminado'; rol: 'cocinero'; id: number; platos: number }
  | { tipo: 'terminado'; rol: 'mesero'; id: number; mesasServidas: number; consultasEnVano: number };

export type MensajeDeWorker =
  | { tipo: 'listo'; rol: 'cocinero' | 'mesero'; id: number }
  | { tipo: 'evento'; evento: EventoCocina }
  | ReporteFinal;

export function esReporteFinal(dato: unknown): dato is ReporteFinal {
  return typeof dato === 'object' && dato !== null && (dato as { tipo?: unknown }).tipo === 'terminado';
}
