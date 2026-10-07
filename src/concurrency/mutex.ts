/**
 * MUTEX (exclusión mutua).
 * Analogía: la llave del único baño del restaurante; quien la tiene entra, los
 * demás esperan a que la devuelva.
 * Problema que evita: que dos hilos usen a la vez un recurso que solo admite
 * uno (en la cocina: el horno), lo que corrompería su estado.
 *
 * Implementación: "futex" de tres estados (Ulrich Drepper, "Futexes Are
 * Tricky") sobre una celda de un Int32Array compartido:
 *   0 = libre, 1 = tomado sin esperas, 2 = tomado y hay hilos durmiendo.
 * Distinguir 1 de 2 permite que liberar() solo llame a Atomics.notify cuando
 * de verdad hay alguien esperando. Mientras espera, el hilo duerme con
 * Atomics.wait (no consume CPU).
 *
 * Solo para Workers: Atomics.wait lanza TypeError en el hilo principal.
 */

const LIBRE = 0;
const TOMADO = 1;
const TOMADO_CON_ESPERAS = 2;

export class Mutex {
  /** Celdas Int32 que ocupa en el estado compartido. */
  static readonly CELDAS = 1;

  private readonly memoria: Int32Array;
  private readonly indice: number;

  constructor(memoria: Int32Array, indice: number) {
    this.memoria = memoria;
    this.indice = indice;
  }

  /** Bloquea al hilo (durmiendo) hasta obtener el candado. */
  adquirir(): void {
    const { memoria, indice } = this;

    // Camino rápido: el candado estaba libre y lo tomamos de una sola vez.
    let estado = Atomics.compareExchange(memoria, indice, LIBRE, TOMADO);
    if (estado === LIBRE) return;

    // Camino lento: marcamos que hay esperas y dormimos hasta que cambie.
    do {
      if (
        estado === TOMADO_CON_ESPERAS ||
        Atomics.compareExchange(memoria, indice, TOMADO, TOMADO_CON_ESPERAS) !== LIBRE
      ) {
        // Duerme solo si la celda sigue en 2; si ya cambió, vuelve de inmediato.
        Atomics.wait(memoria, indice, TOMADO_CON_ESPERAS);
      }
      // Al despertar lo tomamos como "con esperas": no sabemos si quedó
      // alguien más durmiendo, así que el próximo liberar() deberá avisar.
      estado = Atomics.compareExchange(memoria, indice, LIBRE, TOMADO_CON_ESPERAS);
    } while (estado !== LIBRE);
  }

  /** Libera el candado y, si hay hilos durmiendo, despierta a uno. */
  liberar(): void {
    const { memoria, indice } = this;
    // Si el valor previo era 1, nadie esperaba: queda en 0 sin notify.
    if (Atomics.sub(memoria, indice, 1) !== TOMADO) {
      Atomics.store(memoria, indice, LIBRE);
      Atomics.notify(memoria, indice, 1);
    }
  }
}
