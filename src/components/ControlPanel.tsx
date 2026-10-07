import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { HospitalSimulationConfig } from '@/hooks/useHospitalSimulation';

interface ControlPanelProps {
  config: HospitalSimulationConfig;
  onConfigChange: (patch: Partial<HospitalSimulationConfig>) => void;
  running: boolean;
  syncEnabled: boolean;
  onSyncEnabledChange: (enabled: boolean) => void;
  onStart: () => void;
  onStop: () => void;
}

export function ControlPanel({
  config,
  onConfigChange,
  running,
  syncEnabled,
  onSyncEnabledChange,
  onStart,
  onStop,
}: ControlPanelProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="numStations">Estaciones de triage (Workers)</FieldLabel>
        <Input
          id="numStations"
          type="number"
          min={1}
          max={8}
          value={config.numStations}
          disabled={running}
          onChange={(event) => onConfigChange({ numStations: Number(event.target.value) })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="numBeds">Camas totales</FieldLabel>
        <Input
          id="numBeds"
          type="number"
          min={1}
          max={40}
          value={config.numBeds}
          disabled={running}
          onChange={(event) => onConfigChange({ numBeds: Number(event.target.value) })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="queueCapacity">Tamaño de la sala de espera</FieldLabel>
        <Input
          id="queueCapacity"
          type="number"
          min={1}
          max={40}
          value={config.queueCapacity}
          disabled={running}
          onChange={(event) => onConfigChange({ queueCapacity: Number(event.target.value) })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="arrivalRateMs">Tasa de llegada (ms entre pacientes)</FieldLabel>
        <Input
          id="arrivalRateMs"
          type="number"
          min={50}
          max={5000}
          step={50}
          value={config.arrivalRateMs}
          disabled={running}
          onChange={(event) => onConfigChange({ arrivalRateMs: Number(event.target.value) })}
        />
      </Field>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="syncEnabled">Sincronización activada</FieldLabel>
        </FieldContent>
        <Switch id="syncEnabled" checked={syncEnabled} onCheckedChange={onSyncEnabledChange} />
      </Field>

      <div className="flex gap-2">
        <Button onClick={onStart} disabled={running}>
          Iniciar simulación
        </Button>
        <Button variant="outline" onClick={onStop} disabled={!running}>
          Detener
        </Button>
      </div>
    </FieldGroup>
  );
}
