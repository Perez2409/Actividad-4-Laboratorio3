/**
 * JOIN (esperar la terminación de hilos).
 * Analogía: el jefe que no apaga las luces hasta que el último cocinero salga.
 * Problema que evita: usar resultados de hilos que todavía no terminaron (en
 * la cocina: armar el resumen del turno con totales incompletos).
 *
 * Implementación: el hilo principal del navegador no puede bloquearse con
 * Atomics.wait, así que el join es asíncrono. Cada Worker avisa que terminó
 * con un postMessage final; esperarFin() lo convierte en una promesa y
 * unirTodos() espera todas con Promise.all. Si un Worker falla, la promesa se
 * rechaza en vez de quedar colgada.
 *
 * Solo para el hilo principal (los Workers no se esperan entre sí con esto).
 */

/** Lo mínimo que se necesita de un Worker para esperarlo. */
export interface HiloEsperable {
  addEventListener(tipo: 'message', oyente: (evento: MessageEvent) => void): void;
  addEventListener(tipo: 'error', oyente: (evento: Event) => void): void;
  removeEventListener(tipo: 'message', oyente: (evento: MessageEvent) => void): void;
  removeEventListener(tipo: 'error', oyente: (evento: Event) => void): void;
}

/**
 * Resuelve con el mensaje final del hilo (su reporte) cuando este envía un
 * mensaje que cumple `esMensajeFin`.
 */
export function esperarFin<T>(hilo: HiloEsperable, esMensajeFin: (dato: unknown) => dato is T): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const alMensaje = (evento: MessageEvent) => {
      if (!esMensajeFin(evento.data)) return;
      limpiar();
      resolver(evento.data);
    };
    const alError = (evento: Event) => {
      limpiar();
      rechazar(evento instanceof ErrorEvent ? evento.error ?? new Error(evento.message) : new Error('Error en el Worker'));
    };
    const limpiar = () => {
      hilo.removeEventListener('message', alMensaje);
      hilo.removeEventListener('error', alError);
    };
    hilo.addEventListener('message', alMensaje);
    hilo.addEventListener('error', alError);
  });
}

/** Join de todos los hilos: resuelve con los reportes, en el mismo orden que `hilos`. */
export function unirTodos<T>(hilos: readonly HiloEsperable[], esMensajeFin: (dato: unknown) => dato is T): Promise<T[]> {
  return Promise.all(hilos.map((hilo) => esperarFin(hilo, esMensajeFin)));
}
