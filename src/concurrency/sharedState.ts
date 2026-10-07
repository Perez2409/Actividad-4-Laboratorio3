import { Mutex } from '@/concurrency/mutex';
import { CountingSemaphore } from '@/concurrency/semaphore';
import type { BoundedQueueViews } from '@/concurrency/boundedQueue';

/** Valor de una celda del mapa de camas cuando no hay paciente asignado. */
export const BED_FREE = 0;

/**
 * Todo el estado compartido del hospital, como SharedArrayBuffers puros.
 * Es lo único que viaja por postMessage a cada Worker (se pasa por
 * referencia, no se clona el contenido) y lo que retiene el hilo principal
 * para leer en vivo con Atomics.load.
 */
export interface SharedHospitalState {
  numBeds: number;
  queueCapacity: number;
  /** 1 celda: 0 = sin sincronización, 1 = con sincronización. Togglable en vivo. */
  syncFlag: SharedArrayBuffer;
  beds: {
    data: SharedArrayBuffer; // Int32Array[numBeds]: BED_FREE o patientId
    lock: SharedArrayBuffer; // 1 celda para el Mutex de asignación de camas
  };
  queue: {
    data: SharedArrayBuffer; // Int32Array[queueCapacity]: patientId por slot
    headTail: SharedArrayBuffer; // Int32Array[2]: [head, tail]
    lock: SharedArrayBuffer;
    emptySlots: SharedArrayBuffer; // semáforo: espacios libres, inicial = queueCapacity
    filledSlots: SharedArrayBuffer; // semáforo: pacientes esperando, inicial = 0
  };
}

export function createSharedHospitalState(
  numBeds: number,
  queueCapacity: number,
  syncEnabled: boolean,
): SharedHospitalState {
  const syncFlag = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  new Int32Array(syncFlag)[0] = syncEnabled ? 1 : 0;

  const bedsData = new SharedArrayBuffer(numBeds * Int32Array.BYTES_PER_ELEMENT);
  const bedsLock = new SharedArrayBuffer(Mutex.BYTE_LENGTH);

  const queueData = new SharedArrayBuffer(queueCapacity * Int32Array.BYTES_PER_ELEMENT);
  const queueHeadTail = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT);
  const queueLock = new SharedArrayBuffer(Mutex.BYTE_LENGTH);
  const queueEmptySlots = new SharedArrayBuffer(CountingSemaphore.BYTE_LENGTH);
  const queueFilledSlots = new SharedArrayBuffer(CountingSemaphore.BYTE_LENGTH);
  new Int32Array(queueEmptySlots)[0] = queueCapacity;
  new Int32Array(queueFilledSlots)[0] = 0;

  return {
    numBeds,
    queueCapacity,
    syncFlag,
    beds: { data: bedsData, lock: bedsLock },
    queue: {
      data: queueData,
      headTail: queueHeadTail,
      lock: queueLock,
      emptySlots: queueEmptySlots,
      filledSlots: queueFilledSlots,
    },
  };
}

/** Vistas con primitivas de sincronización reales (pueden bloquear). Solo para Workers. */
export interface HospitalViews {
  beds: Int32Array;
  bedLock: Mutex;
  syncFlag: Int32Array;
  queue: BoundedQueueViews;
}

export function attachHospitalViews(state: SharedHospitalState): HospitalViews {
  return {
    beds: new Int32Array(state.beds.data),
    bedLock: new Mutex(state.beds.lock),
    syncFlag: new Int32Array(state.syncFlag),
    queue: {
      data: new Int32Array(state.queue.data),
      headTail: new Int32Array(state.queue.headTail),
      lock: new Mutex(state.queue.lock),
      emptySlots: new CountingSemaphore(state.queue.emptySlots),
      filledSlots: new CountingSemaphore(state.queue.filledSlots),
      capacity: state.queueCapacity,
    },
  };
}

/** Snapshot de solo lectura, no bloqueante. Para el hilo principal (React). */
export interface HospitalSnapshot {
  beds: Int32Array;
  numBeds: number;
  waitingCount: number;
  waitingCapacity: number;
}

export function readHospitalSnapshot(state: SharedHospitalState): HospitalSnapshot {
  return {
    beds: new Int32Array(state.beds.data),
    numBeds: state.numBeds,
    waitingCount: Atomics.load(new Int32Array(state.queue.filledSlots), 0),
    waitingCapacity: state.queueCapacity,
  };
}

/** Lee el switch de sincronización en vivo (no bloqueante). Para el hilo principal. */
export function readSyncEnabled(state: SharedHospitalState): boolean {
  return Atomics.load(new Int32Array(state.syncFlag), 0) === 1;
}

/** Cambia el switch de sincronización en vivo, sin reiniciar la simulación. */
export function writeSyncEnabled(state: SharedHospitalState, enabled: boolean): void {
  Atomics.store(new Int32Array(state.syncFlag), 0, enabled ? 1 : 0);
}
