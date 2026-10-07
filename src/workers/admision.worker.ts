import { attachHospitalViews, BED_FREE, type HospitalViews } from '@/concurrency/sharedState';
import { enqueuePatient } from '@/concurrency/boundedQueue';
import type { AdmisionWorkerIncoming, WorkerLogEvent } from '@/workers/protocol';

function emit(event: WorkerLogEvent): void {
  postMessage(event);
}

let views: HospitalViews | null = null;
let arrivalRateMs = 500;
let initialBurst = 0;
let running = false;
let nextPatientId = 1;

function generatePatientId(): number {
  return nextPatientId++;
}

function admitOnePatient(currentViews: HospitalViews): void {
  const patientId = generatePatientId();
  enqueuePatient(currentViews.queue, patientId); // bloquea si la sala de espera está llena
  emit({ type: 'patient-generated', patientId, at: Date.now() });
}

/** No hay alta de pacientes en este simulador: una vez ocupada, una cama
 * queda ocupada para siempre. Por eso, cuando ya no hay ninguna libre, seguir
 * generando pacientes solo produce rechazos infinitos en el log — un hospital
 * real dejaría de admitir. Frenar acá es lo que le da al simulador un final
 * limpio en vez de un log que crece para siempre. */
function isHospitalFull(currentViews: HospitalViews): boolean {
  for (let i = 0; i < currentViews.beds.length; i++) {
    if (Atomics.load(currentViews.beds, i) === BED_FREE) return false;
  }
  return true;
}

function scheduleNextArrival(currentViews: HospitalViews): void {
  setTimeout(() => {
    if (isHospitalFull(currentViews)) {
      emit({ type: 'admission-stopped', at: Date.now() });
      return;
    }
    admitOnePatient(currentViews);
    scheduleNextArrival(currentViews);
  }, arrivalRateMs);
}

/** Ráfaga inicial (>= número de estaciones) para que la primera colisión de
 * camas en modo sin sincronización sea prácticamente garantizada: todas las
 * estaciones arrancan casi al mismo tiempo con camas todas libres. Luego pasa
 * al ritmo normal de llegada configurado en el panel. */
function runAdmissionLoop(currentViews: HospitalViews): void {
  for (let i = 0; i < initialBurst; i++) {
    admitOnePatient(currentViews);
  }
  scheduleNextArrival(currentViews);
}

addEventListener('message', (event: MessageEvent<AdmisionWorkerIncoming>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      views = attachHospitalViews(message.sharedState);
      arrivalRateMs = message.arrivalRateMs;
      initialBurst = message.initialBurst;
      break;
    case 'start':
      if (views && !running) {
        running = true;
        runAdmissionLoop(views);
      }
      break;
  }
});

emit({ type: 'ready' });
