import { CircleCheck, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contar, formatearEntero, formatearSegundos } from '@/components/etiquetas';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ResultadoTurno, ResumenTurno } from '@/kitchen/kitchenController';
import type { FaseCocina } from '@/kitchen/useKitchen';

interface ShiftSummaryProps {
  fase: FaseCocina;
  resumen: ResumenTurno | null;
  totalesReales: ResumenTurno | null;
  comparacion: { encendido: ResultadoTurno; apagado: ResultadoTurno } | null;
}

interface Metrica {
  etiqueta: string;
  valor: (r: ResumenTurno) => string;
  /** true si el valor indica una falla de sincronización. */
  falla: (r: ResumenTurno) => boolean;
}

const METRICAS: Metrica[] = [
  {
    etiqueta: 'Mesas servidas',
    valor: (r) => `${r.mesasServidas} de ${r.mesasTotales}`,
    falla: (r) => r.mesasServidas < r.mesasTotales,
  },
  { etiqueta: 'Mesas servidas incompletas', valor: (r) => String(r.mesasIncompletas), falla: (r) => r.mesasIncompletas > 0 },
  { etiqueta: 'Colisiones en el horno', valor: (r) => String(r.colisionesHorno), falla: (r) => r.colisionesHorno > 0 },
  { etiqueta: 'Sobrecupos de fogón', valor: (r) => String(r.sobrecuposFogon), falla: (r) => r.sobrecuposFogon > 0 },
  { etiqueta: 'Consultas en vano (meseros)', valor: (r) => formatearEntero(r.consultasEnVano), falla: (r) => r.consultasEnVano > 0 },
  {
    etiqueta: 'Platos preparados',
    valor: (r) => `${r.platosPreparados} de ${r.platosTotales}`,
    falla: (r) => r.platosPreparados < r.platosTotales,
  },
  { etiqueta: 'Tiempo total del turno', valor: (r) => formatearSegundos(r.duracionMs), falla: () => false },
];

function EncabezadoResumen({ resumen }: { resumen: ResumenTurno }) {
  return resumen.generadoCon === 'join' ? (
    <div className="flex gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900 ring-1 ring-emerald-600/25">
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Generado con Join:</span> el jefe esperó a que terminaran todos los hilos.
      </p>
    </div>
  ) : (
    <div className="flex gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive ring-1 ring-destructive/30">
      <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Generado SIN Join:</span> el jefe cerró a la hora prevista con{' '}
        <span className="font-semibold">{contar(resumen.hilosActivos, 'hilo', 'hilos')} todavía trabajando</span>. Los totales están incompletos.
      </p>
    </div>
  );
}

function Comparacion({ encendido, apagado }: { encendido: ResultadoTurno; apagado: ResultadoTurno }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Comparación con el mismo menú</h3>
      <p className="text-xs text-muted-foreground">
        El marcador, la cocina, las mesas y el log muestran la última corrida (todo apagado); los interruptores
        vuelven a tu selección.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Todo encendido</TableHead>
              <TableHead className="text-right">Todo apagado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METRICAS.map((metrica) => (
              <TableRow key={metrica.etiqueta}>
                <TableCell className="text-xs">{metrica.etiqueta}</TableCell>
                <TableCell className={cn('text-right tabular-nums', metrica.falla(encendido.resumen) && 'font-semibold text-destructive')}>
                  {metrica.valor(encendido.resumen)}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums', metrica.falla(apagado.resumen) && 'font-semibold text-destructive')}>
                  {metrica.valor(apagado.resumen)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Sin Join el resumen de "todo apagado" se generó antes de tiempo. Lo que realmente pasó en esa corrida:{' '}
        {contar(apagado.totalesReales.mesasServidas, 'mesa servida', 'mesas servidas')}, {apagado.totalesReales.mesasIncompletas} incompletas,{' '}
        {apagado.totalesReales.colisionesHorno} colisiones de horno, {apagado.totalesReales.sobrecuposFogon} sobrecupos y{' '}
        {formatearEntero(apagado.totalesReales.consultasEnVano)} consultas en vano.
      </p>
    </div>
  );
}

export function ShiftSummary({ fase, resumen, totalesReales, comparacion }: ShiftSummaryProps) {
  if (comparacion) {
    return <Comparacion encendido={comparacion.encendido} apagado={comparacion.apagado} />;
  }

  if (!resumen) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {fase === 'inactiva'
          ? 'El resumen lo genera el jefe de cocina al cerrar el turno.'
          : 'Turno en curso… el jefe arma el resumen al cerrar.'}
      </p>
    );
  }

  const prematuro = resumen.generadoCon === 'temporizador';
  return (
    <div className="space-y-3">
      <EncabezadoResumen resumen={resumen} />
      <dl className="grid grid-cols-2 gap-2">
        {METRICAS.map((metrica) => {
          const falla = metrica.falla(resumen);
          return (
            <div
              key={metrica.etiqueta}
              className={cn('rounded-lg p-2.5 ring-1', falla ? 'bg-destructive/5 ring-destructive/30' : 'ring-foreground/10')}
            >
              <dt className="text-xs text-muted-foreground">{metrica.etiqueta}</dt>
              <dd className={cn('text-lg font-semibold tabular-nums', falla && 'text-destructive')}>{metrica.valor(resumen)}</dd>
            </div>
          );
        })}
      </dl>
      {prematuro && (
        <div className="rounded-lg border border-destructive/40 border-dashed p-2.5 text-sm">
          {totalesReales ? (
            <>
              <span className="font-semibold text-destructive">Totales reales</span> (cuando terminó el último hilo, a los{' '}
              {formatearSegundos(totalesReales.duracionMs)}): {totalesReales.mesasServidas} de {totalesReales.mesasTotales} mesas,{' '}
              {totalesReales.platosPreparados} de {totalesReales.platosTotales} platos. El resumen decía{' '}
              {contar(resumen.mesasServidas, 'mesa', 'mesas')}.
            </>
          ) : (
            <span className="text-muted-foreground">Los hilos siguen trabajando después del cierre; mira el log…</span>
          )}
        </div>
      )}
    </div>
  );
}
