import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { advertenciasConfiguracion, LIMITES, type ConfiguracionTurno, type Mecanismos } from '@/kitchen/config';
import type { FaseCocina } from '@/kitchen/useKitchen';

interface ControlPanelProps {
  config: ConfiguracionTurno;
  onConfigChange: (cambio: Partial<ConfiguracionTurno>) => void;
  onConfigBlur: () => void;
  mecanismos: Mecanismos;
  onMecanismosChange: (cambio: Partial<Mecanismos>) => void;
  fase: FaseCocina;
  onIniciar: () => void;
  onComparar: () => void;
  onDetener: () => void;
}

const CAMPOS: { campo: keyof ConfiguracionTurno; etiqueta: string; paso?: number }[] = [
  { campo: 'cocineros', etiqueta: 'Cocineros (Workers)' },
  { campo: 'meseros', etiqueta: 'Meseros (Workers)' },
  { campo: 'mesas', etiqueta: 'Mesas del turno' },
  { campo: 'porcentajeHorno', etiqueta: '% de platos con horno', paso: 5 },
  { campo: 'tiempoCoccionMs', etiqueta: 'Tiempo de cocción (ms)', paso: 10 },
];

const INTERRUPTORES: { clave: keyof Mecanismos; nombre: string; papel: string }[] = [
  { clave: 'mutex', nombre: 'Mutex', papel: 'Un solo cocinero a la vez en el horno.' },
  { clave: 'semaforo', nombre: 'Semáforo', papel: 'Como máximo 3 cocineros en los 3 fogones.' },
  { clave: 'barrera', nombre: 'Barrera', papel: 'La mesa sale solo con todos sus platos.' },
  { clave: 'variableCondicion', nombre: 'Variable de condición', papel: 'Los meseros duermen hasta que suena la campana.' },
  { clave: 'join', nombre: 'Join', papel: 'El jefe espera a todos antes del resumen.' },
];

export function ControlPanel({
  config,
  onConfigChange,
  onConfigBlur,
  mecanismos,
  onMecanismosChange,
  fase,
  onIniciar,
  onComparar,
  onDetener,
}: ControlPanelProps) {
  const enCurso = fase !== 'inactiva';
  const avisos = advertenciasConfiguracion(config);

  return (
    <FieldGroup className="gap-6">
      <FieldSet>
        <FieldLegend>Configuración del turno</FieldLegend>
        <div className="grid grid-cols-2 gap-3">
          {CAMPOS.map(({ campo, etiqueta, paso }) => (
            <Field key={campo} className={campo === 'tiempoCoccionMs' ? 'col-span-2' : undefined}>
              <FieldLabel htmlFor={campo} className="text-xs">
                {etiqueta}
              </FieldLabel>
              <Input
                id={campo}
                type="number"
                min={LIMITES[campo].min}
                max={LIMITES[campo].max}
                step={paso ?? 1}
                value={config[campo]}
                disabled={enCurso}
                onChange={(evento) => onConfigChange({ [campo]: evento.target.valueAsNumber })}
                onBlur={onConfigBlur}
                className="tabular-nums"
              />
            </Field>
          ))}
        </div>
        {avisos.length > 0 && (
          <ul className="space-y-1.5 rounded-lg bg-amber-50 p-2.5 text-xs leading-snug text-amber-900 ring-1 ring-amber-600/25">
            {avisos.map((aviso) => (
              <li key={aviso} className="flex gap-1.5">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                {aviso}
              </li>
            ))}
          </ul>
        )}
      </FieldSet>

      <FieldSet>
        <FieldLegend>Mecanismos de sincronización</FieldLegend>
        <FieldDescription className="-mt-2 text-xs">
          Apaga uno solo para aislar su falla. Quedan fijos mientras corre el turno.
        </FieldDescription>
        <div className="space-y-2">
          {INTERRUPTORES.map(({ clave, nombre, papel }) => (
            <Field
              key={clave}
              orientation="horizontal"
              data-disabled={enCurso}
              className={
                mecanismos[clave]
                  ? 'rounded-lg p-2 ring-1 ring-foreground/10'
                  : 'rounded-lg bg-destructive/5 p-2 ring-1 ring-destructive/30'
              }
            >
              <FieldContent>
                <FieldLabel htmlFor={`mec-${clave}`}>
                  {nombre}
                  {!mecanismos[clave] && <span className="text-xs font-semibold text-destructive">APAGADO</span>}
                </FieldLabel>
                <FieldDescription className="text-xs">{papel}</FieldDescription>
              </FieldContent>
              <Switch
                id={`mec-${clave}`}
                checked={mecanismos[clave]}
                disabled={enCurso}
                onCheckedChange={(encendido) => onMecanismosChange({ [clave]: encendido })}
              />
            </Field>
          ))}
        </div>
      </FieldSet>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={onIniciar} disabled={enCurso}>
            Iniciar turno
          </Button>
          <Button size="lg" variant="outline" onClick={onDetener} disabled={!enCurso}>
            Detener
          </Button>
        </div>
        <Button size="lg" variant="outline" className="w-full" onClick={onComparar} disabled={enCurso}>
          Comparar: todo encendido vs. todo apagado
        </Button>
        {fase === 'comparando' && (
          <p className="text-center text-xs text-muted-foreground">
            Comparando: primero con todo encendido, luego con todo apagado…
          </p>
        )}
      </div>
    </FieldGroup>
  );
}
