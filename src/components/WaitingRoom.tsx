interface WaitingRoomProps {
  count: number;
  capacity: number;
}

export function WaitingRoom({ count, capacity }: WaitingRoomProps) {
  const occupancyPct = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>Sala de espera</span>
        <span className="text-muted-foreground">
          {count} / {capacity}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${occupancyPct}%` }} />
      </div>
    </div>
  );
}
