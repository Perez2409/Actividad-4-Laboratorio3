import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { WorkerLogEvent } from '@/workers/protocol';

interface EventLogProps {
  events: WorkerLogEvent[];
}

function describeEvent(event: WorkerLogEvent): string {
  switch (event.type) {
    case 'ready':
      return 'Worker listo';
    case 'patient-generated':
      return `Admisión generó al paciente #${event.patientId}`;
    case 'patient-dequeued':
      return `Estación ${event.stationId} tomó de la sala de espera al paciente #${event.patientId}`;
    case 'bed-assigned':
      return `Estación ${event.stationId} asignó la cama ${event.bedIndex} al paciente #${event.patientId} (urgencia ${event.urgencyScore})`;
    case 'bed-collision':
      return `Cama ${event.bedIndex} fue asignada dos veces: Paciente #${event.firstPatientId} y Paciente #${event.secondPatientId}`;
    case 'no-beds-available':
      return `Estación ${event.stationId} no encontró camas libres para el paciente #${event.patientId}`;
    case 'admission-stopped':
      return 'Hospital lleno: Admisión dejó de generar nuevos pacientes';
    case 'benchmark-worker-done':
      return `Worker de benchmark ${event.stationId} procesó ${event.processed} pacientes en ${event.elapsedMs.toFixed(1)} ms`;
  }
}

function formatTimestamp(at: number): string {
  const date = new Date(at);
  return `${date.toLocaleTimeString(undefined, { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay eventos.</p>;
  }

  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Hora</TableHead>
            <TableHead>Evento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event, index) => (
            <TableRow key={index} className={cn(event.type === 'bed-collision' && 'text-destructive')}>
              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                {'at' in event ? formatTimestamp(event.at) : ''}
              </TableCell>
              <TableCell style={{ whiteSpace: 'normal' }}>{describeEvent(event)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
