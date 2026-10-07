/**
 * BARRERA (reutilizable).
 * Analogía: un grupo de amigos que no empieza a comer hasta que llegan todos
 * los platos.
 * Problema que evita: que un hilo avance a la siguiente fase mientras otros
 * siguen en la actual (en la cocina: servir una mesa con platos faltantes).
 *
 * Implementación: dos celdas de un Int32Array compartido.
 *   [contador]   cuántos hilos llegaron en la ronda actual.
 *   [generacion] número de ronda; cambia cuando llega el último.
 * Los que llegan antes duermen esperando que la generación cambie; el último
 * reinicia el contador, avanza la generación y despierta a todos. Gracias a la
 * generación la misma barrera se reutiliza en cada mesa sin reiniciarla desde
 * afuera, y un hilo rápido no puede "colarse" en la ronda anterior.
 *
 * Solo para Workers (usa Atomics.wait).
 */

const CONTADOR = 0;
const GENERACION = 1;

export class Barrera {
  /** Celdas Int32 que ocupa en el estado compartido. */
  static readonly CELDAS = 2;

  private readonly memoria: Int32Array;
  private readonly indice: number;
  private readonly participantes: number;

  constructor(memoria: Int32Array, indice: number, participantes: number) {
    this.memoria = memoria;
    this.indice = indice;
    this.participantes = participantes;
  }

  /**
   * Espera a que lleguen todos los participantes.
   * Devuelve true solo al último en llegar (el "líder" de la ronda), para que
   * exactamente un hilo ejecute la acción posterior (marcar la mesa lista).
   */
  esperar(): boolean {
    const { memoria } = this;
    const iContador = this.indice + CONTADOR;
    const iGeneracion = this.indice + GENERACION;

    // La generación se lee ANTES de anunciar la llegada: si se leyera
    // después, el último podría avanzarla en medio y este hilo esperaría una
    // ronda que ya terminó.
    const generacion = Atomics.load(memoria, iGeneracion);
    const llegados = Atomics.add(memoria, iContador, 1) + 1;

    if (llegados === this.participantes) {
      // Último en llegar: primero reinicia el contador y recién después
      // avanza la generación, así nadie puede llegar a la ronda siguiente
      // mientras el contador todavía tiene la cuenta vieja.
      Atomics.store(memoria, iContador, 0);
      Atomics.add(memoria, iGeneracion, 1);
      Atomics.notify(memoria, iGeneracion);
      return true;
    }

    // Duerme mientras siga siendo la misma ronda (el bucle cubre despertares espurios).
    while (Atomics.load(memoria, iGeneracion) === generacion) {
      Atomics.wait(memoria, iGeneracion, generacion);
    }
    return false;
  }
}
