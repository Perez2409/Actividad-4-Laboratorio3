import { useState } from 'react';
import { BedMap } from '@/components/BedMap';
import { ControlPanel } from '@/components/ControlPanel';
import { EventLog } from '@/components/EventLog';
import { PerformanceChart } from '@/components/PerformanceChart';
import { WaitingRoom } from '@/components/WaitingRoom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHospitalSimulation, type HospitalSimulationConfig } from '@/hooks/useHospitalSimulation';
import { useUrgencyBenchmark } from '@/hooks/useUrgencyBenchmark';
import { DEFAULT_URGENCY_ITERATIONS, LIVE_DEMO_URGENCY_ITERATIONS } from '@/workers/urgencyScore';

const DEFAULT_CONFIG: HospitalSimulationConfig = {
  numStations: 3,
  numBeds: 8,
  queueCapacity: 8,
  arrivalRateMs: 600,
  urgencyIterations: LIVE_DEMO_URGENCY_ITERATIONS,
  syncEnabled: true,
};

const BENCHMARK_PATIENT_COUNT = 200;
const BENCHMARK_WORKER_COUNTS = [1, 2, 4];

function App() {
  const [config, setConfig] = useState<HospitalSimulationConfig>(DEFAULT_CONFIG);
  const [simState, simControls] = useHospitalSimulation();
  const [benchState, benchControls] = useUrgencyBenchmark({
    patientCount: BENCHMARK_PATIENT_COUNT,
    workerCounts: BENCHMARK_WORKER_COUNTS,
    urgencyIterations: DEFAULT_URGENCY_ITERATIONS,
  });

  const handleConfigChange = (patch: Partial<HospitalSimulationConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }));

  // El switch debe quedar guardado en `config` (para el próximo `start()`) y,
  // si ya hay una simulación corriendo, también aplicarse en vivo sobre el
  // estado compartido — si solo actualizara una de las dos, alternar el
  // switch antes de arrancar no tendría efecto en la corrida real.
  const handleSyncEnabledChange = (enabled: boolean) => {
    handleConfigChange({ syncEnabled: enabled });
    simControls.setSyncEnabled(enabled);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Simulador de Triage Hospitalario</h1>
        <p className="text-sm text-muted-foreground">
          Varias estaciones de triage (Web Workers) compiten por camas compartidas. Activá o desactivá la
          sincronización para ver la condición de carrera y su solución en tiempo real.
        </p>
      </header>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Simulación en vivo</TabsTrigger>
          <TabsTrigger value="benchmark">Prueba de rendimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.6fr] lg:items-start">
            <Card>
              <CardHeader>
                <CardTitle>Configuración</CardTitle>
              </CardHeader>
              <CardContent>
                <ControlPanel
                  config={config}
                  onConfigChange={handleConfigChange}
                  running={simState.running}
                  syncEnabled={simState.syncEnabled}
                  onSyncEnabledChange={handleSyncEnabledChange}
                  onStart={() => simControls.start(config)}
                  onStop={simControls.stop}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mapa de camas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <BedMap beds={simState.beds} />
                <WaitingRoom count={simState.waiting.count} capacity={simState.waiting.capacity} />
                {simState.collisionCount > 0 && (
                  <p className="text-sm font-medium text-destructive">
                    {simState.collisionCount} colisión(es) de cama detectada(s)
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Log de eventos</CardTitle>
              </CardHeader>
              <CardContent>
                <EventLog events={simState.events} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benchmark">
          <Card>
            <CardHeader>
              <CardTitle>Prueba de rendimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <PerformanceChart
                results={benchState.results}
                running={benchState.running}
                onRunBenchmark={benchControls.run}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App;
