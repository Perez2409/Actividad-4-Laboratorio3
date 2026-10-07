import { useState } from 'react';
import { CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Insignia } from '@/components/Insignia';
import { contar, formatearSegundos, nombreCocinero, nombreMesa, nombreMesero } from '@/components/etiquetas';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { EntradaLog } from '@/kitchen/kitchenController';

interface EventLogProps {
  log: EntradaLog[];
}

interface Linea {
  actor: string;
  accion: string;
  /** Errores de sincronización: se pintan en rojo. */
  error: boolean;
}

const JEFE = 'Jefe de cocina';

function describirEntrada({ evento, trasCierre }: EntradaLog): Linea {
  switch (evento.tipo) {
    case 'fogon-tomado':
      return { actor: nombreCocinero(evento.cocinero), accion: `Toma el fogón ${evento.fogon + 1} (${nombreMesa(evento.mesa)})`, error: false };
    case 'fogon-sobrecupo':
      return {
        actor: nombreCocinero(evento.cocinero),
        accion: `${evento.ocupacion} cocineros en 3 fogones: cocina sin fogón propio (${nombreMesa(evento.mesa)})`,
        error: true,
      };
    case 'horno-tomado':
      return { actor: nombreCocinero(evento.cocinero), accion: `Entra al horno (${nombreMesa(evento.mesa)})`, error: false };
    case 'horno-colision':
      return {
        actor: nombreCocinero(evento.cocinero),
        accion: `Horno usado por ${evento.ocupacion} cocineros al mismo tiempo (${nombreMesa(evento.mesa)})`,
        error: true,
      };
    case 'plato-listo':
      return {
        actor: nombreCocinero(evento.cocinero),
        accion: `Plato listo para la ${nombreMesa(evento.mesa)} (${evento.listos} de ${evento.total})`,
        error: false,
      };
    case 'mesa-lista': {
      const completa = evento.listos === evento.total;
      return {
        actor: nombreCocinero(evento.cocinero),
        accion: completa
          ? `${nombreMesa(evento.mesa)} lista con sus ${evento.total} platos: suena la campana`
          : `${nombreMesa(evento.mesa)} marcada lista con solo ${evento.listos} de ${evento.total} platos`,
        error: !completa,
      };
    }
    case 'mesa-servida':
      return trasCierre
        ? { actor: nombreMesero(evento.mesero), accion: `Sirve la ${nombreMesa(evento.mesa)} DESPUÉS de cerrado el turno`, error: true }
        : { actor: nombreMesero(evento.mesero), accion: `Sirve la ${nombreMesa(evento.mesa)} (${evento.total} de ${evento.total} platos)`, error: false };
    case 'mesa-incompleta':
      return {
        actor: nombreMesero(evento.mesero),
        accion: `${nombreMesa(evento.mesa)} servida incompleta (${evento.listos} de ${evento.total} platos)`,
        error: true,
      };
    case 'espera-ocupada':
      return {
        actor: nombreMesero(evento.mesero),
        accion: `Preguntó ${contar(evento.consultas, 'vez', 'veces')} en vano antes de obtener la ${nombreMesa(evento.mesa)}`,
        error: true,
      };
    case 'turno-iniciado':
      return {
        actor: JEFE,
        accion: `Inicia el turno: ${contar(evento.cocineros, 'cocinero', 'cocineros')}, ${contar(evento.meseros, 'mesero', 'meseros')}, ${contar(evento.mesas, 'mesa', 'mesas')}`,
        error: false,
      };
    case 'resumen-con-join':
      return {
        actor: JEFE,
        accion: `Join: todos los hilos terminaron. Resumen: ${contar(evento.mesasServidas, 'mesa', 'mesas')} en ${formatearSegundos(evento.duracionMs)}`,
        error: false,
      };
    case 'resumen-sin-join':
      return {
        actor: JEFE,
        accion: `Resumen generado sin Join con ${contar(evento.hilosActivos, 'hilo', 'hilos')} todavía trabajando: ${evento.mesasServidas} de ${evento.mesas} mesas`,
        error: true,
      };
    case 'turno-real-terminado':
      return {
        actor: JEFE,
        accion: `Terminó el último hilo: en realidad se sirvieron ${contar(evento.mesasServidas, 'mesa', 'mesas')} (el resumen dice ${evento.mesasEnResumen})`,
        error: evento.mesasServidas !== evento.mesasEnResumen,
      };
    case 'error-worker':
      return { actor: JEFE, accion: `Error en un Worker: ${evento.mensaje}`, error: true };
  }
}

function formatearHora(hora: number): string {
  const fecha = new Date(hora);
  return `${fecha.toLocaleTimeString('es-ES', { hour12: false })}.${String(fecha.getMilliseconds()).padStart(3, '0')}`;
}

export function EventLog({ log }: EventLogProps) {
  const [soloFallas, setSoloFallas] = useState(false);
  const lineas = log.map((entrada) => ({ entrada, ...describirEntrada(entrada) }));
  const totalFallas = lineas.filter((linea) => linea.error).length;
  const visibles = soloFallas ? lineas.filter((linea) => linea.error) : lineas;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {contar(log.length, 'evento', 'eventos')} ·{' '}
          <span className={cn(totalFallas > 0 && 'font-semibold text-destructive')}>{contar(totalFallas, 'falla', 'fallas')} de sincronización</span>
        </p>
        <div className="flex items-center gap-2">
          <Switch id="solo-fallas" size="sm" checked={soloFallas} onCheckedChange={setSoloFallas} />
          <Label htmlFor="solo-fallas" className="text-xs">
            Solo fallas
          </Label>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {log.length === 0 ? 'Todavía no hay eventos.' : 'Ninguna falla registrada.'}
        </p>
      ) : (
        <div className="max-h-120 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-28">Hora</TableHead>
                <TableHead className="w-32">Actor</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map(({ entrada, actor, accion, error }) => (
                <TableRow key={entrada.id} className={cn(error && 'bg-destructive/5 text-destructive hover:bg-destructive/10')}>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{formatearHora(entrada.evento.hora)}</TableCell>
                  <TableCell className="text-xs font-medium">{actor}</TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {error && <CircleX className="mr-1.5 inline size-3.5 align-[-2px]" aria-label="Falla" />}
                    {accion}
                    {entrada.trasCierre && (
                      <Insignia tono="falla" className="ml-2">
                        tras el cierre
                      </Insignia>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
