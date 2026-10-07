import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { ControlPanel } from '@/components/ControlPanel';
import { EventLog } from '@/components/EventLog';
import { KitchenView } from '@/components/KitchenView';
import { LiveCounters } from '@/components/LiveCounters';
import { ShiftSummary } from '@/components/ShiftSummary';
import { TablesView } from '@/components/TablesView';
import { WaitersView } from '@/components/WaitersView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CONFIGURACION_POR_DEFECTO,
  MECANISMOS_ENCENDIDOS,
  normalizarConfiguracion,
  type ConfiguracionTurno,
  type Mecanismos,
} from '@/kitchen/config';
import { useKitchen } from '@/kitchen/useKitchen';

const TEXTO_FASE = {
  inactiva: 'Cocina cerrada',
  'en-curso': 'Turno en curso',
  comparando: 'Comparando',
} as const;

function App() {
  const [config, setConfig] = useState<ConfiguracionTurno>(CONFIGURACION_POR_DEFECTO);
  const [mecanismos, setMecanismos] = useState<Mecanismos>(MECANISMOS_ENCENDIDOS);
  const [estado, acciones] = useKitchen();
  const enCurso = estado.fase !== 'inactiva';

  // Mientras corre un turno, los interruptores muestran los mecanismos de ESE
  // turno (en "Comparar" pasan solos de todo encendido a todo apagado).
  const mecanismosVisibles = enCurso && estado.mecanismos ? estado.mecanismos : mecanismos;

  const iniciar = () => {
    const normalizada = normalizarConfiguracion(config);
    setConfig(normalizada);
    acciones.iniciar(normalizada, mecanismos);
  };

  const comparar = () => {
    const normalizada = normalizarConfiguracion(config);
    setConfig(normalizada);
    acciones.comparar(normalizada);
  };

  return (
    <div className="mx-auto max-w-384 space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ChefHat className="size-7" aria-hidden />
            Simulador de Cocina de Restaurante
          </h1>
          <p className="text-sm text-muted-foreground">
            Cocineros y meseros son Web Workers reales que se coordinan con cinco mecanismos de sincronización. Apaga uno y
            mira qué falla.
          </p>
        </div>
        <span
          className={
            enCurso
              ? 'inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-600/25'
              : 'inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground ring-1 ring-foreground/10'
          }
        >
          <span className={enCurso ? 'size-2 animate-pulse rounded-full bg-sky-500' : 'size-2 rounded-full bg-muted-foreground/50'} />
          {TEXTO_FASE[estado.fase]}
        </span>
      </header>

      {estado.error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive ring-1 ring-destructive/30">{estado.error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card className="lg:sticky lg:top-4">
          <CardContent>
            <ControlPanel
              config={config}
              onConfigChange={(cambio) => setConfig((previa) => ({ ...previa, ...cambio }))}
              onConfigBlur={() => setConfig((previa) => normalizarConfiguracion(previa))}
              mecanismos={mecanismosVisibles}
              onMecanismosChange={(cambio) => setMecanismos((previos) => ({ ...previos, ...cambio }))}
              fase={estado.fase}
              onIniciar={iniciar}
              onComparar={comparar}
              onDetener={acciones.detener}
            />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <LiveCounters instantanea={estado.instantanea} />

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Cocina</CardTitle>
                <CardDescription>Horno (mutex), fogones (semáforo) y cocineros (barrera).</CardDescription>
              </CardHeader>
              <CardContent>
                <KitchenView instantanea={estado.instantanea} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Meseros</CardTitle>
                <CardDescription>Esperan mesas listas (variable de condición).</CardDescription>
              </CardHeader>
              <CardContent>
                <WaitersView instantanea={estado.instantanea} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Mesas</CardTitle>
              <CardDescription>Platos listos de cada mesa; solo debe salir con todos (barrera).</CardDescription>
            </CardHeader>
            <CardContent>
              <TablesView instantanea={estado.instantanea} />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:items-start">
            <Card>
              <CardHeader>
                <CardTitle>Log de eventos</CardTitle>
                <CardDescription>Lo más reciente arriba. Las fallas de sincronización en rojo.</CardDescription>
              </CardHeader>
              <CardContent>
                <EventLog log={estado.log} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumen del turno</CardTitle>
                <CardDescription>Lo arma el jefe de cocina al cerrar (Join).</CardDescription>
              </CardHeader>
              <CardContent>
                <ShiftSummary
                  fase={estado.fase}
                  resumen={estado.resumen}
                  totalesReales={estado.totalesReales}
                  comparacion={estado.comparacion}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
