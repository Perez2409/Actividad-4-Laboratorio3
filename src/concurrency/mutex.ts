const UNLOCKED = 0;
const LOCKED = 1;

// Atomics.wait solo puede bloquear con éxito dentro de un Worker real (el hilo
// principal del navegador lanza TypeError). El timeout es finito para que un
// worker nunca quede colgado para siempre si otro murió sin liberar el candado.
const WAIT_TIMEOUT_MS = 1000;

/**
 * Mutex (exclusión mutua) sobre una celda de un SharedArrayBuffer.
 * Implementa un spinlock con Atomics.compareExchange, durmiendo con
 * Atomics.wait/notify entre reintentos para no quemar CPU con contención.
 * Uso exclusivo de Workers: el hilo principal solo debe leer el estado
 * compartido con Atomics.load, nunca llamar lock()/unlock().
 */
export class Mutex {
  static readonly BYTE_LENGTH = Int32Array.BYTES_PER_ELEMENT;

  private readonly view: Int32Array;

  constructor(sab: SharedArrayBuffer, byteOffset = 0) {
    this.view = new Int32Array(sab, byteOffset, 1);
  }

  lock(): void {
    for (;;) {
      if (Atomics.compareExchange(this.view, 0, UNLOCKED, LOCKED) === UNLOCKED) {
        return;
      }
      Atomics.wait(this.view, 0, LOCKED, WAIT_TIMEOUT_MS);
    }
  }

  unlock(): void {
    Atomics.store(this.view, 0, UNLOCKED);
    Atomics.notify(this.view, 0, 1);
  }
}
