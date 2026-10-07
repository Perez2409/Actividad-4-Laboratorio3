/**
 * COCINERO (un Web Worker por cocinero).
 * En cada mesa prepara un plato: fogón (semáforo) -> horno si el plato lo
 * necesita (mutex) -> espera a que el resto de los platos de la mesa estén
 * listos (barrera). El último en llegar a la barrera marca la mesa lista y
 * avisa a los meseros (variable de condición).
 *
 * Con un mecanismo apagado el cocinero simplemente no lo usa; los contadores
 * de ocupación (hornoOcupacion, fogonesOcupacion) se actualizan siempre y son
 * los que detectan y registran la falla.
 */
import {
  abrirEstadoCompartido,
  EstadoCocinero,
  EstadoMesa,
  esperarArranque,
  type CocinaCompartida,
} from '@/concurrency/sharedState';
import { FOGONES, type Plato } from '@/kitchen/config';
import type { EventoCocina, InicioCocinero, MensajeDeWorker } from '@/workers/protocol';

function enviar(mensaje: MensajeDeWorker): void {
  postMessage(mensaje);
}

/** El objeto literal se valida contra cada variante de EventoCocina. */
function registrar(evento: EventoCocina): void {
  enviar({ tipo: 'evento', evento });
}

let sumidero = 0; // evita que el motor descarte el cálculo por no usarse

/** Cocción: trabajo REAL de CPU durante `ms` (no es un sleep). */
function cocinar(ms: number): void {
  const fin = performance.now() + ms;
  let x = sumidero;
  while (performance.now() < fin) {
    for (let k = 0; k < 1000; k++) x = Math.sqrt(x + k);
  }
  sumidero = x;
}

function fijarEstado(cocina: CocinaCompartida, id: number, estado: EstadoCocinero): void {
  Atomics.store(cocina.memoria, cocina.indices.estadoCocinero + id, estado);
}

/**
 * Busca un fogón libre y lo marca como propio. Con el semáforo encendido
 * siempre hay uno (hay a lo sumo 3 cocineros con permiso). Sin semáforo puede
 * no haber: devuelve -1 y el cocinero cocina "en sobrecupo".
 */
function ocuparFogon(cocina: CocinaCompartida, id: number): number {
  const { memoria, indices } = cocina;
  for (let f = 0; f < FOGONES; f++) {
    if (Atomics.compareExchange(memoria, indices.fogones + f, 0, id + 1) === 0) return f;
  }
  return -1;
}

function usarFogon(cocina: CocinaCompartida, id: number, mesa: number, plato: Plato, tiempoMs: number): void {
  const { memoria, indices, mecanismos } = cocina;

  fijarEstado(cocina, id, EstadoCocinero.ESPERANDO_FOGON);
  // --- SEMÁFORO: tomar uno de los 3 permisos (duerme si no hay) ---
  if (mecanismos.semaforo) cocina.fogones.adquirir();

  const fogon = ocuparFogon(cocina, id);
  const ocupacion = Atomics.add(memoria, indices.fogonesOcupacion, 1) + 1;
  if (ocupacion > FOGONES) {
    Atomics.add(memoria, indices.sobrecuposFogon, 1);
    registrar({ tipo: 'fogon-sobrecupo', hora: Date.now(), cocinero: id, mesa, ocupacion });
  } else {
    registrar({ tipo: 'fogon-tomado', hora: Date.now(), cocinero: id, mesa, fogon });
  }

  fijarEstado(cocina, id, EstadoCocinero.COCINANDO);
  cocinar(tiempoMs * plato.factor);
  // El estado cambia ANTES de soltar el fogón: si cambiara después, la UI
  // podría ver por un instante a este cocinero "cocinando" sin fogón y
  // marcar un sobrecupo que no existe.
  fijarEstado(cocina, id, EstadoCocinero.EMPLATANDO);

  // Se desocupa en orden inverso: primero el fogón y el contador, y recién
  // después se devuelve el permiso, para que el próximo encuentre lugar.
  Atomics.sub(memoria, indices.fogonesOcupacion, 1);
  if (fogon !== -1) Atomics.store(memoria, indices.fogones + fogon, 0);
  if (mecanismos.semaforo) cocina.fogones.liberar();
  // --- fin del uso del semáforo ---
}

function usarHorno(cocina: CocinaCompartida, id: number, mesa: number, plato: Plato, tiempoMs: number): void {
  const { memoria, indices, mecanismos } = cocina;

  fijarEstado(cocina, id, EstadoCocinero.ESPERANDO_HORNO);
  // --- SECCIÓN CRÍTICA DEL HORNO (mutex): solo un cocinero adentro ---
  if (mecanismos.mutex) cocina.horno.adquirir();

  const ocupacion = Atomics.add(memoria, indices.hornoOcupacion, 1) + 1;
  if (ocupacion > 1) {
    Atomics.add(memoria, indices.colisionesHorno, 1);
    registrar({ tipo: 'horno-colision', hora: Date.now(), cocinero: id, mesa, ocupacion });
  } else {
    registrar({ tipo: 'horno-tomado', hora: Date.now(), cocinero: id, mesa });
  }

  fijarEstado(cocina, id, EstadoCocinero.HORNEANDO);
  cocinar(tiempoMs * plato.factor);
  // Igual que en el fogón: sale de "horneando" antes de liberar el mutex, para
  // que la UI nunca lo cuente dentro del horno junto con el siguiente.
  fijarEstado(cocina, id, EstadoCocinero.EMPLATANDO);

  Atomics.sub(memoria, indices.hornoOcupacion, 1);
  if (mecanismos.mutex) cocina.horno.liberar();
  // --- fin de la sección crítica del horno ---
}

/**
 * Marca la mesa como lista y la pone en la cola de los meseros. El CAS sobre
 * estadoMesa garantiza que se haga una sola vez aunque, sin barrera, varios
 * cocineros terminen su plato de la misma mesa.
 */
function marcarMesaLista(cocina: CocinaCompartida, id: number, mesa: number): void {
  const { memoria, indices, mecanismos, dimensiones } = cocina;
  if (Atomics.compareExchange(memoria, indices.estadoMesa + mesa, EstadoMesa.EN_COCINA, EstadoMesa.LISTA) !== EstadoMesa.EN_COCINA) {
    return;
  }

  // --- SECCIÓN CRÍTICA DE LA COLA (mutex de la cola, siempre activo) ---
  cocina.colaMutex.adquirir();
  const final = Atomics.load(memoria, indices.colaFinal);
  Atomics.store(memoria, indices.cola + final, mesa);
  Atomics.store(memoria, indices.colaFinal, final + 1);
  cocina.colaMutex.liberar();
  // --- fin de la sección crítica de la cola ---

  // VARIABLE DE CONDICIÓN: "suena la campana" y despierta a un mesero.
  if (mecanismos.variableCondicion) cocina.mesaListaCondicion.notificarUno();

  const listos = Atomics.load(memoria, indices.platosListos + mesa);
  registrar({ tipo: 'mesa-lista', hora: Date.now(), cocinero: id, mesa, listos, total: dimensiones.cocineros });
}

function trabajarTurno(cocina: CocinaCompartida, mensaje: InicioCocinero): number {
  const { memoria, indices, mecanismos, dimensiones } = cocina;
  const { id, platos, tiempoCoccionMs } = mensaje;
  let preparados = 0;

  for (let mesa = 0; mesa < dimensiones.mesas; mesa++) {
    const plato = platos[mesa];
    Atomics.store(memoria, indices.mesaCocinero + id, mesa);

    usarFogon(cocina, id, mesa, plato, tiempoCoccionMs);
    // Orden fijo fogón -> horno, y el fogón se suelta ANTES de pedir el
    // horno: un cocinero nunca retiene un recurso mientras espera otro, así
    // que no puede formarse una espera circular (interbloqueo / deadlock)
    // entre quien tiene un fogón y espera el horno y quien tiene el horno y
    // espera un fogón.
    if (plato.horno) usarHorno(cocina, id, mesa, plato, tiempoCoccionMs);

    const listos = Atomics.add(memoria, indices.platosListos + mesa, 1) + 1;
    Atomics.add(memoria, indices.platosPreparados, 1);
    preparados++;
    registrar({ tipo: 'plato-listo', hora: Date.now(), cocinero: id, mesa, listos, total: dimensiones.cocineros });

    if (mecanismos.barrera) {
      // --- BARRERA: nadie sigue hasta que estén los platos de todos ---
      fijarEstado(cocina, id, EstadoCocinero.ESPERANDO_BARRERA);
      const esUltimo = cocina.barreraMesa.esperar();
      if (esUltimo) marcarMesaLista(cocina, id, mesa);
    } else {
      // Sin barrera: el primero que termina da la mesa por lista.
      marcarMesaLista(cocina, id, mesa);
    }
  }

  fijarEstado(cocina, id, EstadoCocinero.TERMINADO);
  Atomics.store(memoria, indices.mesaCocinero + id, -1);
  return preparados;
}

addEventListener('message', (evento: MessageEvent<InicioCocinero>) => {
  const mensaje = evento.data;
  if (mensaje.tipo !== 'inicio') return;

  const cocina = abrirEstadoCompartido(mensaje.buffer, mensaje.dimensiones);
  enviar({ tipo: 'listo', rol: 'cocinero', id: mensaje.id });
  esperarArranque(cocina);

  const platos = trabajarTurno(cocina, mensaje);
  // Mensaje final: es lo que espera el Join del jefe de cocina.
  enviar({ tipo: 'terminado', rol: 'cocinero', id: mensaje.id, platos });
  close();
});
