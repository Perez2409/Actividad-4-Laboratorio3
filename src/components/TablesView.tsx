import { Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Insignia } from '@/components/Insignia';
import { ESTADO_MESA, nombreMesa, nombreMesero } from '@/components/etiquetas';
import { EstadoMesa, type InstantaneaCocina } from '@/concurrency/sharedState';

interface TablesViewProps {
  instantanea: InstantaneaCocina | null;
}

/** Un segmento por plato: así "2 de 4" se ve sin leer números. */
function BarraPlatos({ listos, total, alServir, incompleta }: { listos: number; total: number; alServir: number; incompleta: boolean }) {
  return (
    <div className="flex gap-0.5" aria-label={`${listos} de ${total} platos listos`}>
      {Array.from({ length: total }, (_, plato) => {
        // Si la mesa salió incompleta, los platos que faltaban al servir se marcan en rojo.
        const faltabaAlServir = incompleta && plato >= alServir;
        return (
          <div
            key={plato}
            className={cn(
              'h-2 flex-1 rounded-full',
              faltabaAlServir ? 'bg-destructive' : plato < listos ? 'bg-emerald-500' : 'bg-muted',
            )}
          />
        );
      })}
    </div>
  );
}

export function TablesView({ instantanea }: TablesViewProps) {
  if (!instantanea) {
    return <p className="text-sm text-muted-foreground">Las mesas del turno aparecerán aquí.</p>;
  }
  const total = instantanea.cocineros.length;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {instantanea.mesas.map((mesa, indice) => {
        const estado = ESTADO_MESA[mesa.estado];
        const incompleta = mesa.estado === EstadoMesa.SERVIDA_INCOMPLETA;
        const yaSalio = mesa.estado >= EstadoMesa.EN_CAMINO;
        return (
          <li
            key={indice}
            className={cn(
              'space-y-1.5 rounded-lg p-2 ring-1',
              incompleta ? 'bg-destructive/5 ring-2 ring-destructive' : 'ring-foreground/10',
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Utensils className="size-3.5 text-muted-foreground" aria-hidden />
                {nombreMesa(indice)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {mesa.platosListos}/{total}
              </span>
            </div>
            <BarraPlatos listos={mesa.platosListos} total={total} alServir={mesa.platosAlServir} incompleta={incompleta} />
            <Insignia tono={estado.tono} className="w-full justify-center whitespace-normal">
              {incompleta ? `Servida con ${mesa.platosAlServir} de ${total}` : estado.texto}
            </Insignia>
            {yaSalio && mesa.mesero >= 0 && (
              <div className="text-center text-[11px] text-muted-foreground">por {nombreMesero(mesa.mesero)}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
