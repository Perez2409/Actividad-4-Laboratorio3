/**
 * SEMÁFORO CONTADOR (Dijkstra).
 * Analogía: la recepción con cupos: "hay 3 fogones; cuando se libera uno,
 * pasa el siguiente".
 * Problema que evita: que más hilos de los que el recurso admite lo usen a la
 * vez (en la cocina: más de 3 cocineros en 3 fogones).
 *
 * Implementación: una celda de un Int32Array compartido guarda los permisos
 * disponibles. adquirir() lo decrementa con compareExchange solo si es > 0;
 * si es 0, el hilo duerme con Atomics.wait hasta que liberar() lo incremente.
 *
 * adquirir()/liberar() son solo para Workers; valor() es una lectura no
 * bloqueante, apta para el hilo principal.
 */

export class Semaforo {
  /** Celdas Int32 que ocupa en el estado compartido. */
  static readonly CELDAS = 1;

  private readonly memoria: Int32Array;
  private readonly indice: number;

  constructor(memoria: Int32Array, indice: number) {
    this.memoria = memoria;
    this.indice = indice;
  }

  /** Fija los permisos iniciales. Se llama una vez, antes de lanzar los Workers. */
  static inicializar(memoria: Int32Array, indice: number, permisos: number): void {
    Atomics.store(memoria, indice, permisos);
  }

  /** Consume un permiso; si no hay ninguno, duerme hasta que se libere uno. */
  adquirir(): void {
    const { memoria, indice } = this;
    for (;;) {
      const disponibles = Atomics.load(memoria, indice);
      // Solo se descuenta si nadie cambió el valor entre la lectura y el CAS.
      if (disponibles > 0 && Atomics.compareExchange(memoria, indice, disponibles, disponibles - 1) === disponibles) {
        return;
      }
      // Si disponibles > 0 el CAS perdió contra otro hilo: wait retorna de
      // inmediato porque el valor ya cambió, y se reintenta.
      Atomics.wait(memoria, indice, disponibles);
    }
  }

  /** Devuelve un permiso y despierta a un hilo que estuviera esperando. */
  liberar(): void {
    Atomics.add(this.memoria, this.indice, 1);
    Atomics.notify(this.memoria, this.indice, 1);
  }

  /** Permisos disponibles en este instante (lectura no bloqueante). */
  valor(): number {
    return Atomics.load(this.memoria, this.indice);
  }
}
