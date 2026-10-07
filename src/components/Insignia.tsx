import { cn } from '@/lib/utils';
import { TONOS, type Tono } from '@/components/etiquetas';

interface InsigniaProps {
  tono: Tono;
  className?: string;
  children: React.ReactNode;
}

/** Etiqueta pequeña de estado, con el color de su tono. */
export function Insignia({ tono, className, children }: InsigniaProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}
