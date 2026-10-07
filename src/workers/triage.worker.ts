import { attachHospitalViews, BED_FREE, type HospitalViews } from '@/concurrency/sharedState';
import { dequeuePatient } from '@/concurrency/boundedQueue';
import type { BenchmarkPatient, StationId, TriageWorkerIncoming, WorkerLogEvent } from '@/workers/protocol';
import { computeUrgencyScore, deriveVitalsFromPatientId } from '@/workers/urgencyScore';

function emit(event: WorkerLogEvent): void {
  postMessage(event);
}

interface LiveState {
  views: HospitalViews;
  stationId: StationId;
  urgencyIterations: number;
}

let liveState: LiveState | null = null;
let running = false;

/** Escaneo determinista desde el índice 0: todas las estaciones "apuntan" a
 * la misma cama libre cuando hay varias, para que la colisión en modo sin
 * sincronización sea reproducible y no dependa del azar. */
function findLowestFreeBed(beds: Int32Array): number {
  for (let i = 0; i < beds.length; i++) {
    if (Atomics.load(beds, i) === BED_FREE) return i;
  }
  return -1;
}

function assignPatientToBed(
  views: HospitalViews,
  stationId: StationId,
  patientId: number,
  urgencyIterations: number,
): void {
  for (;;) {
    // 1. CHECK: ve una cama libre.
    const candidate = findLowestFreeBed(views.beds);
    if (candidate === -1) {
      emit({ type: 'no-beds-available', stationId, patientId, at: Date.now() });
      return;
    }

    // 2. TRABAJO REAL (varios ms) entre el "ver libre" y el "confirmar": acá
    // es donde se abre la ventana de la condición de carrera, sin necesidad
    // de ningún retraso artificial.
    const vitals = deriveVitalsFromPatientId(patientId);
    const urgencyScore = computeUrgencyScore(vitals, urgencyIterations);

    // Se lee en vivo en cada intento: el switch de la UI cambia el
    // comportamiento de estaciones ya corriendo, sin reiniciar la simulación.
    const syncEnabled = Atomics.load(views.syncFlag, 0) === 1;

    if (!syncEnabled) {
      // 3. ACT sin candado: otra estación pudo haber tomado "candidate"
      // durante el paso 2 y este store la pisa sin darse cuenta.
      const previous = Atomics.load(views.beds, candidate);
      Atomics.store(views.beds, candidate, patientId);
      if (previous !== BED_FREE) {
        emit({
          type: 'bed-collision',
          stationId,
          bedIndex: candidate,
          firstPatientId: previous,
          secondPatientId: patientId,
          at: Date.now(),
        });
      } else {
        emit({ type: 'bed-assigned', stationId, bedIndex: candidate, patientId, urgencyScore, at: Date.now() });
      }
      return;
    }

    // Solución: el candado protege solo el re-chequeo + escritura (O(1)),
    // nunca el cálculo de urgencia, para no serializar el trabajo paralelo.
    views.bedLock.lock();
    try {
      if (Atomics.load(views.beds, candidate) !== BED_FREE) {
        continue; // otra estación ganó esa cama durante el paso 2: reintentar con la siguiente libre
      }
      Atomics.store(views.beds, candidate, patientId);
      emit({ type: 'bed-assigned', stationId, bedIndex: candidate, patientId, urgencyScore, at: Date.now() });
      return;
    } finally {
      views.bedLock.unlock();
    }
  }
}

/** Bucle del consumidor: nunca retorna hasta que el hilo principal hace terminate(). */
function runLiveLoop(state: LiveState): void {
  for (;;) {
    const patientId = dequeuePatient(state.views.queue); // bloquea si la cola está vacía
    emit({ type: 'patient-dequeued', stationId: state.stationId, patientId, at: Date.now() });
    assignPatientToBed(state.views, state.stationId, patientId, state.urgencyIterations);
  }
}

function runBenchmarkBatch(patients: BenchmarkPatient[], urgencyIterations: number, stationId: StationId): void {
  const startedAt = performance.now();
  for (const patient of patients) {
    const vitals = deriveVitalsFromPatientId(patient.id);
    computeUrgencyScore(vitals, urgencyIterations);
  }
  const elapsedMs = performance.now() - startedAt;
  emit({ type: 'benchmark-worker-done', stationId, elapsedMs, processed: patients.length });
}

addEventListener('message', (event: MessageEvent<TriageWorkerIncoming>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      liveState = {
        views: attachHospitalViews(message.sharedState),
        stationId: message.stationId,
        urgencyIterations: message.urgencyIterations,
      };
      break;
    case 'start':
      if (liveState && !running) {
        running = true;
        runLiveLoop(liveState);
      }
      break;
    case 'benchmark':
      runBenchmarkBatch(message.patients, message.urgencyIterations, message.stationId);
      break;
  }
});

emit({ type: 'ready' });
