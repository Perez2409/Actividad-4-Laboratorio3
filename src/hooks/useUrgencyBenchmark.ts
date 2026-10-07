import { useCallback, useState } from 'react';
import type { BenchmarkPatient, WorkerLogEvent } from '@/workers/protocol';

export interface BenchmarkResult {
  numWorkers: number;
  elapsedMs: number;
}

export interface UrgencyBenchmarkOptions {
  patientCount: number;
  workerCounts: number[];
  urgencyIterations: number;
}

export interface UrgencyBenchmarkState {
  running: boolean;
  results: BenchmarkResult[];
}

export interface UrgencyBenchmarkControls {
  run: () => Promise<void>;
}

function createTriageWorker(): Worker {
  return new Worker(new URL('../workers/triage.worker.ts', import.meta.url), { type: 'module' });
}

function waitForMessageType(worker: Worker, type: WorkerLogEvent['type']): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<WorkerLogEvent>) => {
      if (event.data.type === type) {
        worker.removeEventListener('message', handler);
        resolve();
      }
    };
    worker.addEventListener('message', handler);
  });
}

function splitIntoChunks(patientCount: number, numWorkers: number): BenchmarkPatient[][] {
  const chunks: BenchmarkPatient[][] = Array.from({ length: numWorkers }, () => []);
  for (let id = 0; id < patientCount; id++) {
    chunks[id % numWorkers].push({ id });
  }
  return chunks;
}

/**
 * Corre el mismo lote fijo de pacientes con distinta cantidad de Workers,
 * midiendo el tiempo real con performance.now() en el hilo principal. El
 * cronómetro arranca recién cuando todos los workers de la corrida avisaron
 * "ready", para no penalizar a las corridas con más workers con el costo de
 * arrancar el módulo.
 */
async function runForWorkerCount(numWorkers: number, patientCount: number, urgencyIterations: number): Promise<number> {
  const workers = Array.from({ length: numWorkers }, createTriageWorker);
  try {
    await Promise.all(workers.map((worker) => waitForMessageType(worker, 'ready')));

    const chunks = splitIntoChunks(patientCount, numWorkers);
    const donePromises = workers.map((worker) => waitForMessageType(worker, 'benchmark-worker-done'));

    const startedAt = performance.now();
    workers.forEach((worker, stationId) => {
      worker.postMessage({ type: 'benchmark', stationId, patients: chunks[stationId], urgencyIterations });
    });
    await Promise.all(donePromises);
    return performance.now() - startedAt;
  } finally {
    for (const worker of workers) worker.terminate();
  }
}

export function useUrgencyBenchmark(options: UrgencyBenchmarkOptions): [UrgencyBenchmarkState, UrgencyBenchmarkControls] {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const { patientCount, workerCounts, urgencyIterations } = options;

  const run = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const collected: BenchmarkResult[] = [];
    for (const numWorkers of workerCounts) {
      const elapsedMs = await runForWorkerCount(numWorkers, patientCount, urgencyIterations);
      collected.push({ numWorkers, elapsedMs });
      setResults([...collected]);
    }
    setRunning(false);
  }, [workerCounts, patientCount, urgencyIterations]);

  return [{ running, results }, { run }];
}
