import { cn } from '@/lib/utils';
import { formatearEntero } from '@/components/etiquetas';
import { EstadoCocinero, EstadoMesero, type InstantaneaCocina } from '@/concurrency/sharedState';

interface LiveCountersProps {
  instantanea: InstantaneaCocina | null;
}

interface Contador {
  etiqueta: string;
  mecanismo: string;
  valor: string;
  falla: boolean;
}

/** Marcador en vivo: una cifra por mecanismo, en rojo apenas aparece su falla. */
export function LiveCounters({ instantanea }: LiveCountersProps) {
  const c = instantanea?.contadores;
  const totalMesas = instantanea?.mesas.length ?? 0;
  const hilosTrabajando = instantanea
    ? instantanea.cocineros.filter((x) => x.estado !== EstadoCocinero.TERMINADO).length +
      instantanea.meseros.filter((x) => x.estado !== EstadoMesero.TERMINADO).length
    : 0;
  const totalHilos = instantanea ? instantanea.cocineros.length + instantanea.meseros.length : 0;

  const contadores: Contador[] = [
    { etiqueta: 'Colisiones en el horno', mecanismo: 'Mutex', valor: String(c?.colisionesHorno ?? 0), falla: (c?.colisionesHorno ?? 0) > 0 },
    { etiqueta: 'Sobrecupos de fogón', mecanismo: 'Semáforo', valor: String(c?.sobrecuposFogon ?? 0), falla: (c?.sobrecuposFogon ?? 0) > 0 },
    { etiqueta: 'Mesas incompletas', mecanismo: 'Barrera', valor: String(c?.mesasIncompletas ?? 0), falla: (c?.mesasIncompletas ?? 0) > 0 },
    {
      etiqueta: 'Consultas en vano',
      mecanismo: 'Variable de condición',
      valor: formatearEntero(c?.consultasEnVano ?? 0),
      falla: (c?.consultasEnVano ?? 0) > 0,
    },
    {
      etiqueta: 'Mesas servidas',
      mecanismo: `${hilosTrabajando} de ${totalHilos} hilos trabajando`,
      valor: `${c?.mesasServidas ?? 0} / ${totalMesas}`,
      falla: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {contadores.map((contador) => (
        <div
          key={contador.etiqueta}
          className={cn(
            'rounded-xl bg-card p-3 ring-1 transition-colors',
            contador.falla ? 'bg-destructive/5 ring-2 ring-destructive' : 'ring-foreground/10',
          )}
        >
          <div className="text-xs text-muted-foreground">{contador.etiqueta}</div>
          <div className={cn('text-2xl font-semibold tabular-nums', contador.falla && 'text-destructive')}>{contador.valor}</div>
          <div className={cn('text-[11px]', contador.falla ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {contador.mecanismo}
          </div>
        </div>
      ))}
    </div>
  );
}
