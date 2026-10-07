/**
 * MESERO (un Web Worker por mesero).
 * Espera a que haya una mesa lista en la cola, la toma y la lleva.
 *  - Variable de condición encendida: duerme (Atomics.wait) hasta que un
 *    cocinero avise que hay una mesa lista. No gasta CPU mientras espera.
 *  - Apagada: espera ocupada; pregunta en un bucle sin pausa y cada consulta
 *    que encuentra la cola vacía suma al contador de "consultas en vano".
 * Al servir revisa cuántos platos tenía la mesa: si faltaba alguno (pasa con
 * la barrera apagada) registra "mesa servida incompleta".
 */
import {
  abrirEstadoCompartido,
  EstadoMesa,
  EstadoMesero,
  esperarArranque,
  type CocinaCompartida,
} from '@/concurrency/sharedState';
import type { EventoCocina, InicioMesero, MensajeDeWorker } from '@/workers/protocol';

function enviar(mensaje: MensajeDeWorker): void {
  postMessage(mensaje);
}

function registrar(evento: EventoCocina): void {
  enviar({ tipo: 'evento', evento });
}

const celdaParaDormir = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

/** Llevar la mesa: pausa real del hilo, sin gastar CPU. */
function dormir(ms: number): void {
  Atomics.wait(celdaParaDormir, 0, 0, ms);
}

function fijarEstado(cocina: CocinaCompartida, id: number, estado: EstadoMesero): void {
  Atomics.store(cocina.memoria, cocina.indices.estadoMesero + id, estado);
}

/**
 * Toma la próxima mesa lista de la cola, esperando si no hay ninguna.
 * Devuelve -1 cuando ya se repartieron todas las mesas del turno.
 */
function tomarMesaLista(cocina: CocinaCompartida, id: number): { mesa: number; consultas: number } {
  const { memoria, indices, mecanismos, dimensiones } = cocina;
  const colaVacia = () =>
    Atomics.load(memoria, indices.colaCabeza) === Atomics.load(memoria, indices.colaFinal) &&
    Atomics.load(memoria, indices.colaCabeza) < dimensiones.mesas;
  let consultas = 0;

  // --- SECCIÓN CRÍTICA DE LA COLA (mutex de la cola, siempre activo) ---
  cocina.colaMutex.adquirir();
  if (mecanismos.variableCondicion) {
    // VARIABLE DE CONDICIÓN: esperar() suelta el mutex, duerme y lo retoma
    // al despertar. Es un while (no un if) por los despertares espurios.
    while (colaVacia()) {
      fijarEstado(cocina, id, EstadoMesero.DURMIENDO);
      cocina.mesaListaCondicion.esperar(cocina.colaMutex);
    }
  } else {
    // ESPERA OCUPADA: suelta el mutex, lo vuelve a tomar y pregunta otra vez,
    // sin dormir. Cada vuelta es CPU desperdiciada.
    fijarEstado(cocina, id, EstadoMesero.CONSULTANDO);
    while (colaVacia()) {
      consultas++;
      Atomics.add(memoria, indices.consultasEnVano + id, 1);
      cocina.colaMutex.liberar();
      cocina.colaMutex.adquirir();
    }
  }

  const cabeza = Atomics.load(memoria, indices.colaCabeza);
  if (cabeza >= dimensiones.mesas) {
    cocina.colaMutex.liberar();
    return { mesa: -1, consultas };
  }
  const mesa = Atomics.load(memoria, indices.cola + cabeza);
  Atomics.store(memoria, indices.colaCabeza, cabeza + 1);
  cocina.colaMutex.liberar();
  // --- fin de la sección crítica de la cola ---

  // Si este mesero tomó la última mesa, despierta a los que siguen dormidos
  // para que vean que el turno terminó y salgan.
  if (cabeza + 1 === dimensiones.mesas && mecanismos.variableCondicion) {
    cocina.mesaListaCondicion.notificarTodos();
  }
  return { mesa, consultas };
}

function servirMesa(cocina: CocinaCompartida, id: number, mesa: number, tiempoServicioMs: number): void {
  const { memoria, indices, dimensiones } = cocina;
  const total = dimensiones.cocineros;

  // Se cuentan los platos al retirar la mesa: es lo que realmente llega al cliente.
  const listos = Atomics.load(memoria, indices.platosListos + mesa);
  Atomics.store(memoria, indices.platosAlServir + mesa, listos);
  Atomics.store(memoria, indices.meseroDeMesa + mesa, id);
  Atomics.store(memoria, indices.estadoMesa + mesa, EstadoMesa.EN_CAMINO);
  Atomics.store(memoria, indices.mesaMesero + id, mesa);
  fijarEstado(cocina, id, EstadoMesero.LLEVANDO);

  dormir(tiempoServicioMs);

  const completa = listos === total;
  Atomics.store(memoria, indices.estadoMesa + mesa, completa ? EstadoMesa.SERVIDA : EstadoMesa.SERVIDA_INCOMPLETA);
  Atomics.add(memoria, indices.mesasServidas, 1);
  if (completa) {
    registrar({ tipo: 'mesa-servida', hora: Date.now(), mesero: id, mesa, total });
  } else {
    Atomics.add(memoria, indices.mesasIncompletas, 1);
    registrar({ tipo: 'mesa-incompleta', hora: Date.now(), mesero: id, mesa, listos, total });
  }
  Atomics.store(memoria, indices.mesaMesero + id, -1);
}

function trabajarTurno(cocina: CocinaCompartida, mensaje: InicioMesero): number {
  const { id, tiempoServicioMs } = mensaje;
  let servidas = 0;

  for (;;) {
    const { mesa, consultas } = tomarMesaLista(cocina, id);
    if (mesa === -1) break;
    if (consultas > 0) {
      registrar({ tipo: 'espera-ocupada', hora: Date.now(), mesero: id, mesa, consultas });
    }
    servirMesa(cocina, id, mesa, tiempoServicioMs);
    servidas++;
  }

  fijarEstado(cocina, id, EstadoMesero.TERMINADO);
  return servidas;
}

addEventListener('message', (evento: MessageEvent<InicioMesero>) => {
  const mensaje = evento.data;
  if (mensaje.tipo !== 'inicio') return;

  const cocina = abrirEstadoCompartido(mensaje.buffer, mensaje.dimensiones);
  enviar({ tipo: 'listo', rol: 'mesero', id: mensaje.id });
  esperarArranque(cocina);

  const mesasServidas = trabajarTurno(cocina, mensaje);
  const consultasEnVano = Atomics.load(cocina.memoria, cocina.indices.consultasEnVano + mensaje.id);
  // Mensaje final: es lo que espera el Join del jefe de cocina.
  enviar({ tipo: 'terminado', rol: 'mesero', id: mensaje.id, mesasServidas, consultasEnVano });
  close();
});
