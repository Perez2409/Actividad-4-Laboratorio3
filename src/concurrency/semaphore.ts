const WAIT_TIMEOUT_MS = 1000;

/**
 * Semáforo contador clásico (Dijkstra) sobre una celda de un SharedArrayBuffer.
 * acquire() consume un permiso, bloqueando si no hay ninguno disponible;
 * release() devuelve uno. Uso exclusivo de Workers para acquire()/release();
 * value() es de solo lectura y no bloqueante, apta para el hilo principal.
 */
export class CountingSemaphore {
  static readonly BYTE_LENGTH = Int32Array.BYTES_PER_ELEMENT;

  private readonly view: Int32Array;

  constructor(sab: SharedArrayBuffer, byteOffset = 0) {
    this.view = new Int32Array(sab, byteOffset, 1);
  }

  acquire(): void {
    for (;;) {
      const current = Atomics.load(this.view, 0);
      if (current > 0 && Atomics.compareExchange(this.view, 0, current, current - 1) === current) {
        return;
      }
      Atomics.wait(this.view, 0, current, WAIT_TIMEOUT_MS);
    }
  }

  release(): void {
    Atomics.add(this.view, 0, 1);
    Atomics.notify(this.view, 0, 1);
  }

  /** Lectura no bloqueante, segura desde el hilo principal. */
  value(): number {
    return Atomics.load(this.view, 0);
  }
}
