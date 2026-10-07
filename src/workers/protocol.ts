import type { SharedHospitalState } from '@/concurrency/sharedState';

export type StationId = number;

// ---- Mensajes hilo principal -> Worker (comunicación por postMessage / IPC) ----

export interface TriageWorkerInit {
  type: 'init';
  stationId: StationId;
  sharedState: SharedHospitalState;
  urgencyIterations: number;
}

export interface TriageStartCommand {
  type: 'start';
}

export interface BenchmarkPatient {
  id: number;
}

export interface TriageBenchmarkCommand {
  type: 'benchmark';
  stationId: StationId;
  patients: BenchmarkPatient[];
  urgencyIterations: number;
}

export type TriageWorkerIncoming = TriageWorkerInit | TriageStartCommand | TriageBenchmarkCommand;

export interface AdmisionWorkerInit {
  type: 'init';
  sharedState: SharedHospitalState;
  arrivalRateMs: number;
  /** Pacientes encolados de inmediato al arrancar, antes del ritmo normal. */
  initialBurst: number;
}

export interface AdmisionStartCommand {
  type: 'start';
}

export type AdmisionWorkerIncoming = AdmisionWorkerInit | AdmisionStartCommand;

// ---- Mensajes Worker -> hilo principal (eventos para el EventLog) ----

export type WorkerLogEvent =
  | { type: 'ready' }
  | { type: 'patient-generated'; patientId: number; at: number }
  | { type: 'patient-dequeued'; stationId: StationId; patientId: number; at: number }
  | {
      type: 'bed-assigned';
      stationId: StationId;
      bedIndex: number;
      patientId: number;
      urgencyScore: number;
      at: number;
    }
  | {
      type: 'bed-collision';
      stationId: StationId;
      bedIndex: number;
      firstPatientId: number;
      secondPatientId: number;
      at: number;
    }
  | { type: 'no-beds-available'; stationId: StationId; patientId: number; at: number }
  | { type: 'admission-stopped'; at: number }
  | { type: 'benchmark-worker-done'; stationId: StationId; elapsedMs: number; processed: number };
