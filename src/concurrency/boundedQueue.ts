import type { Mutex } from '@/concurrency/mutex';
import type { CountingSemaphore } from '@/concurrency/semaphore';

/**
 * Vistas típadas sobre la sala de espera: un buffer circular de tamaño fijo
 * (la cola acotada), protegido con el patrón productor/consumidor clásico:
 * un mutex para el acceso a head/tail, y dos semáforos contadores para los
 * espacios llenos (pacientes esperando) y vacíos (lugar disponible).
 * Siempre protegida — a diferencia de la asignación de camas, la cola no
 * tiene un modo "sin sincronización" (ver README-plan / plan de diseño).
 */
export interface BoundedQueueViews {
  data: Int32Array;
  headTail: Int32Array; // [0] = head (próximo a leer), [1] = tail (próximo a escribir)
  lock: Mutex;
  emptySlots: CountingSemaphore;
  filledSlots: CountingSemaphore;
  capacity: number;
}

/** Solo Workers (productor / admision.worker.ts). Bloquea si la cola está llena. */
export function enqueuePatient(queue: BoundedQueueViews, patientId: number): void {
  queue.emptySlots.acquire();
  queue.lock.lock();
  try {
    const tail = Atomics.load(queue.headTail, 1);
    Atomics.store(queue.data, tail, patientId);
    Atomics.store(queue.headTail, 1, (tail + 1) % queue.capacity);
  } finally {
    queue.lock.unlock();
  }
  queue.filledSlots.release();
}

/** Solo Workers (consumidores / triage.worker.ts). Bloquea si la cola está vacía. */
export function dequeuePatient(queue: BoundedQueueViews): number {
  queue.filledSlots.acquire();
  queue.lock.lock();
  let patientId: number;
  try {
    const head = Atomics.load(queue.headTail, 0);
    patientId = Atomics.load(queue.data, head);
    Atomics.store(queue.headTail, 0, (head + 1) % queue.capacity);
  } finally {
    queue.lock.unlock();
  }
  queue.emptySlots.release();
  return patientId;
}

/** Lectura no bloqueante — para WaitingRoom.tsx desde el hilo principal. */
export function waitingRoomOccupancy(
  queue: Pick<BoundedQueueViews, 'filledSlots' | 'capacity'>,
): { count: number; capacity: number } {
  return { count: queue.filledSlots.value(), capacity: queue.capacity };
}
