import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BED_FREE,
  createSharedHospitalState,
  readHospitalSnapshot,
  writeSyncEnabled,
  type SharedHospitalState,
} from '@/concurrency/sharedState';
import type { WorkerLogEvent } from '@/workers/protocol';

const EVENTS_LIMIT = 200;

export interface HospitalSimulationConfig {
  numStations: number;
  numBeds: number;
  queueCapacity: number;
  arrivalRateMs: number;
  urgencyIterations: number;
  syncEnabled: boolean;
}

export interface BedCell {
  index: number;
  patientId: number | null;
}

export interface HospitalSimulationState {
  running: boolean;
  syncEnabled: boolean;
  beds: BedCell[];
  waiting: { count: number; capacity: number };
  events: WorkerLogEvent[];
  collisionCount: number;
}

export interface HospitalSimulationControls {
  start: (config: HospitalSimulationConfig) => void;
  stop: () => void;
  setSyncEnabled: (enabled: boolean) => void;
}

const INITIAL_STATE: HospitalSimulationState = {
  running: false,
  syncEnabled: true,
  beds: [],
  waiting: { count: 0, capacity: 0 },
  events: [],
  collisionCount: 0,
};

/**
 * Orquesta toda la simulación en vivo: crea el estado compartido y los
 * Workers, y expone un snapshot listo para pintar. Vive en un hook (no en
 * App.tsx ni en un componente) para no mezclar lógica de negocio con la UI.
 */
export function useHospitalSimulation(): [HospitalSimulationState, HospitalSimulationControls] {
  const [state, setState] = useState<HospitalSimulationState>(INITIAL_STATE);

  const sharedStateRef = useRef<SharedHospitalState | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<WorkerLogEvent[]>([]);
  const collisionCountRef = useRef(0);

  const stop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    for (const worker of workersRef.current) {
      worker.terminate();
    }
    workersRef.current = [];
    sharedStateRef.current = null;
    setState((prev) => ({ ...prev, running: false, beds: [], waiting: { count: 0, capacity: 0 } }));
  }, []);

  const start = useCallback(
    (config: HospitalSimulationConfig) => {
      stop();

      const sharedState = createSharedHospitalState(config.numBeds, config.queueCapacity, config.syncEnabled);
      sharedStateRef.current = sharedState;
      pendingEventsRef.current = [];
      collisionCountRef.current = 0;

      const handleMessage = (event: MessageEvent<WorkerLogEvent>) => {
        if (event.data.type === 'ready') return;
        pendingEventsRef.current.push(event.data);
        if (event.data.type === 'bed-collision') collisionCountRef.current += 1;
      };

      const admisionWorker = new Worker(new URL('../workers/admision.worker.ts', import.meta.url), {
        type: 'module',
      });
      admisionWorker.onmessage = handleMessage;
      admisionWorker.postMessage({
        type: 'init',
        sharedState,
        arrivalRateMs: config.arrivalRateMs,
        initialBurst: config.numStations,
      });
      admisionWorker.postMessage({ type: 'start' });

      const triageWorkers: Worker[] = [];
      for (let stationId = 0; stationId < config.numStations; stationId++) {
        const worker = new Worker(new URL('../workers/triage.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = handleMessage;
        worker.postMessage({
          type: 'init',
          stationId,
          sharedState,
          urgencyIterations: config.urgencyIterations,
        });
        worker.postMessage({ type: 'start' });
        triageWorkers.push(worker);
      }

      workersRef.current = [admisionWorker, ...triageWorkers];

      setState({
        running: true,
        syncEnabled: config.syncEnabled,
        beds: Array.from({ length: config.numBeds }, (_, index) => ({ index, patientId: null })),
        waiting: { count: 0, capacity: config.queueCapacity },
        events: [],
        collisionCount: 0,
      });

      const tick = () => {
        const current = sharedStateRef.current;
        if (!current) return;

        const snapshot = readHospitalSnapshot(current);
        const beds: BedCell[] = Array.from({ length: snapshot.numBeds }, (_, index) => {
          const patientId = Atomics.load(snapshot.beds, index);
          return { index, patientId: patientId === BED_FREE ? null : patientId };
        });
        const waiting = { count: snapshot.waitingCount, capacity: snapshot.waitingCapacity };

        const newEvents = pendingEventsRef.current;
        pendingEventsRef.current = [];

        setState((prev) => ({
          ...prev,
          beds,
          waiting,
          collisionCount: collisionCountRef.current,
          events: newEvents.length > 0 ? [...newEvents].reverse().concat(prev.events).slice(0, EVENTS_LIMIT) : prev.events,
        }));

        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  const setSyncEnabled = useCallback((enabled: boolean) => {
    if (sharedStateRef.current) {
      writeSyncEnabled(sharedStateRef.current, enabled);
    }
    setState((prev) => ({ ...prev, syncEnabled: enabled }));
  }, []);

  useEffect(() => stop, [stop]);

  return [state, { start, stop, setSyncEnabled }];
}
