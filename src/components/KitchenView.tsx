import { ChefHat, Flame, Microwave } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Insignia } from '@/components/Insignia';
import { ESTADO_COCINERO, nombreCocinero, nombreMesa } from '@/components/etiquetas';
import type { InstantaneaCocina } from '@/concurrency/sharedState';
import { FOGONES } from '@/kitchen/config';

interface KitchenViewProps {
  instantanea: InstantaneaCocina | null;
}

const listaCocineros = (ids: number[]) => ids.map((id) => nombreCocinero(id)).join(' y ');

// La alarma (colisión / sobrecupo) la decide el contador de ocupación real,
// leído de una sola vez; los nombres salen de los estados de los cocineros y
// solo acompañan. Así la UI nunca marca una falla que no ocurrió.

function Horno({ ocupacion, enHorno }: { ocupacion: number; enHorno: number[] }) {
  const colision = ocupacion > 1;
  return (
    <div
      className={cn(
        'flex min-h-24 flex-col justify-between rounded-xl p-3 ring-1',
        colision
          ? 'animate-pulse bg-destructive/10 ring-2 ring-destructive'
          : ocupacion === 1
            ? 'bg-orange-50 ring-orange-500/40'
            : 'bg-muted/40 ring-foreground/10',
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Microwave className="size-3.5" aria-hidden />
          Horno (único)
        </span>
        <span>Mutex</span>
      </div>
      {colision ? (
        <p className="text-sm font-semibold text-destructive">
          ¡{ocupacion} cocineros en el horno a la vez!{enHorno.length > 1 && ` (${listaCocineros(enHorno)})`}
        </p>
      ) : ocupacion === 1 ? (
        <p className="text-sm font-semibold text-orange-900">
          {enHorno.length === 1 ? `${nombreCocinero(enHorno[0])} horneando` : 'Ocupado'}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Libre</p>
      )}
    </div>
  );
}

function Fogones({
  ocupados,
  fogones,
  enSobrecupo,
}: {
  ocupados: number;
  fogones: (number | null)[];
  enSobrecupo: number[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Flame className="size-3.5" aria-hidden />
          Fogones: {ocupados} de {FOGONES} en uso
        </span>
        <span>Semáforo</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {fogones.map((ocupante, indice) => (
          <div
            key={indice}
            className={cn(
              'rounded-lg p-2 text-center ring-1',
              ocupante === null ? 'bg-muted/40 ring-foreground/10' : 'bg-sky-50 ring-sky-600/30',
            )}
          >
            <div className="text-[11px] text-muted-foreground">Fogón {indice + 1}</div>
            <div className={cn('text-sm font-medium', ocupante === null ? 'text-muted-foreground' : 'text-sky-900')}>
              {ocupante === null ? 'Libre' : nombreCocinero(ocupante)}
            </div>
          </div>
        ))}
      </div>
      {ocupados > FOGONES && (
        <div className="animate-pulse rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive ring-2 ring-destructive">
          ¡Sobrecupo! {ocupados} cocineros en {FOGONES} fogones
          {enSobrecupo.length > 0 && `: ${listaCocineros(enSobrecupo)} sin fogón propio`}
        </div>
      )}
    </div>
  );
}

export function KitchenView({ instantanea }: KitchenViewProps) {
  if (!instantanea) {
    return <p className="text-sm text-muted-foreground">Inicia un turno para ver la cocina en vivo.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
        <Horno ocupacion={instantanea.ocupacionHorno} enHorno={instantanea.enHorno} />
        <Fogones ocupados={instantanea.ocupacionFogones} fogones={instantanea.fogones} enSobrecupo={instantanea.enSobrecupo} />
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {instantanea.cocineros.map((cocinero, id) => {
          const estado = ESTADO_COCINERO[cocinero.estado];
          return (
            <li key={id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-foreground/10">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <ChefHat className="size-4 text-muted-foreground" aria-hidden />
                  {nombreCocinero(id)}
                </div>
                <div className="text-xs text-muted-foreground">{cocinero.mesa >= 0 ? nombreMesa(cocinero.mesa) : '—'}</div>
              </div>
              <Insignia tono={estado.tono}>{estado.texto}</Insignia>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
