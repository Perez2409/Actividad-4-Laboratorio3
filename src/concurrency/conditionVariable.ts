import type { Mutex } from '@/concurrency/mutex';

/**
 * VARIABLE DE CONDICIÓN.
 * Analogía: el mesero que espera sentado a que suene la campana, en vez de
 * entrar a la cocina cada segundo a preguntar "¿ya está?".
 * Problema que evita: la espera ocupada (un hilo que consulta una condición
 * en bucle y desperdicia CPU mientras no se cumple).
 *
 * Implementación: una celda de un Int32Array compartido funciona como número
 * de secuencia. esperar() la lee CON EL MUTEX TOMADO, suelta el mutex y
 * duerme mientras la secuencia no cambie. notificarUno()/notificarTodos() la
 * incrementan y despiertan a uno o a todos los que duermen. Si el aviso llega
 * entre que se suelta el mutex y se llama a Atomics.wait, la secuencia ya no
 * coincide y el wait retorna de inmediato: no se pierde ningún aviso.
 *
 * Uso correcto (como con cualquier variable de condición):
 *   mutex.adquirir();
 *   while (!condicion()) cv.esperar(mutex);   // while, no if: puede haber despertares espurios
 *   ...usar el estado protegido...
 *   mutex.liberar();
 *
 * Solo para Workers (usa Atomics.wait).
 */

export class VariableCondicion {
  /** Celdas Int32 que ocupa en el estado compartido. */
  static readonly CELDAS = 1;

  private readonly memoria: Int32Array;
  private readonly indice: number;

  constructor(memoria: Int32Array, indice: number) {
    this.memoria = memoria;
    this.indice = indice;
  }

  /**
   * Suelta `mutex`, duerme hasta recibir un aviso y vuelve a tomar `mutex`
   * antes de retornar. Debe llamarse con `mutex` ya adquirido.
   */
  esperar(mutex: Mutex): void {
    const secuencia = Atomics.load(this.memoria, this.indice);
    mutex.liberar();
    Atomics.wait(this.memoria, this.indice, secuencia);
    mutex.adquirir();
  }

  /** Despierta a un hilo que esté esperando (si hay alguno). */
  notificarUno(): void {
    Atomics.add(this.memoria, this.indice, 1);
    Atomics.notify(this.memoria, this.indice, 1);
  }

  /** Despierta a todos los hilos que estén esperando. */
  notificarTodos(): void {
    Atomics.add(this.memoria, this.indice, 1);
    Atomics.notify(this.memoria, this.indice);
  }
}
