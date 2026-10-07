import { CircleCheck, HandPlatter, Moon, RefreshCw, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Insignia } from '@/components/Insignia';
import { ESTADO_MESERO, formatearEntero, nombreMesa, nombreMesero, TONOS } from '@/components/etiquetas';
import { EstadoMesero, type InstantaneaCocina } from '@/concurrency/sharedState';

interface WaitersViewProps {
  instantanea: InstantaneaCocina | null;
}

const ICONO: Record<EstadoMesero, LucideIcon> = {
  [EstadoMesero.INICIANDO]: User,
  [EstadoMesero.DURMIENDO]: Moon,
  [EstadoMesero.CONSULTANDO]: RefreshCw,
  [EstadoMesero.LLEVANDO]: HandPlatter,
  [EstadoMesero.TERMINADO]: CircleCheck,
};

export function WaitersView({ instantanea }: WaitersViewProps) {
  if (!instantanea) {
    return <p className="text-sm text-muted-foreground">Los meseros aparecerán aquí.</p>;
  }

  return (
    <ul className="space-y-2">
      {instantanea.meseros.map((mesero, id) => {
        const estado = ESTADO_MESERO[mesero.estado];
        const desperdicia = mesero.consultasEnVano > 0;
        const Icono = ICONO[mesero.estado];
        return (
          <li key={id} className="flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-foreground/10">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-inset', TONOS[estado.tono])}>
              <Icono
                className={cn('size-5', mesero.estado === EstadoMesero.CONSULTANDO && 'animate-spin')}
                aria-hidden
              />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-medium">{nombreMesero(id)}</div>
              <Insignia tono={estado.tono} className="whitespace-normal">
                {estado.texto}
                {mesero.estado === EstadoMesero.LLEVANDO && mesero.mesa >= 0 ? ` ${nombreMesa(mesero.mesa)}` : ''}
              </Insignia>
            </div>
            <div className="text-right">
              <div className={cn('text-lg font-semibold tabular-nums', desperdicia ? 'text-destructive' : 'text-muted-foreground')}>
                {formatearEntero(mesero.consultasEnVano)}
              </div>
              <div className="text-[11px] text-muted-foreground">consultas en vano</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
