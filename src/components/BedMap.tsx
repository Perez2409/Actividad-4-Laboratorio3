import { cn } from '@/lib/utils';
import type { BedCell } from '@/hooks/useHospitalSimulation';

interface BedMapProps {
  beds: BedCell[];
}

export function BedMap({ beds }: BedMapProps) {
  if (beds.length === 0) {
    return <p className="text-sm text-muted-foreground">Iniciá la simulación para ver el mapa de camas.</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {beds.map((bed) => (
        <div
          key={bed.index}
          className={cn(
            'flex aspect-square flex-col items-center justify-center rounded-lg border text-xs',
            bed.patientId === null
              ? 'border-border bg-muted/40 text-muted-foreground'
              : 'border-primary/40 bg-primary/10 text-foreground',
          )}
        >
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Cama {bed.index}</span>
          <span className="font-medium">{bed.patientId === null ? 'Libre' : `#${bed.patientId}`}</span>
        </div>
      ))}
    </div>
  );
}
