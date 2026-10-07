import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import type { BenchmarkResult } from '@/hooks/useUrgencyBenchmark';

interface PerformanceChartProps {
  results: BenchmarkResult[];
  running: boolean;
  onRunBenchmark: () => void;
}

export function PerformanceChart({ results, running, onRunBenchmark }: PerformanceChartProps) {
  const data = results.map((result) => ({ workers: `${result.numWorkers}`, ms: Math.round(result.elapsedMs) }));
  const first = results.at(0);
  const last = results.at(-1);
  const speedup = first && last && results.length > 1 ? first.elapsedMs / last.elapsedMs : null;

  return (
    <div className="space-y-4">
      <Button onClick={onRunBenchmark} disabled={running}>
        {running ? 'Ejecutando…' : 'Ejecutar prueba de rendimiento'}
      </Button>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Corre el mismo lote de 200 pacientes con 1, 2 y 4 estaciones para comparar el tiempo total.
        </p>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="workers"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                  label={{
                    value: 'Estaciones de triage (Workers)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--color-muted-foreground)',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                  label={{
                    value: 'Tiempo total (ms)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--color-muted-foreground)',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-muted)' }}
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    color: 'var(--color-popover-foreground)',
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${value} ms`, 'Tiempo total']}
                  labelFormatter={(label) => `${label} estación(es)`}
                />
                <Bar
                  dataKey="ms"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                  // Valor directo en la punta de la barra. Un label-render
                  // inline (en vez de <LabelList> con formatter) es la forma
                  // que recharts renderiza de manera confiable acá.
                  label={(props) => {
                    if (props.value === undefined || props.value === null) return undefined;
                    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
                    const y = Number(props.y ?? 0) - 6;
                    return (
                      <text x={x} y={y} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={12}>
                        {props.value} ms
                      </text>
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {speedup !== null && first && last && (
            <p className="text-sm text-muted-foreground">
              Con {last.numWorkers} estaciones el tiempo bajó de {Math.round(first.elapsedMs)} ms a{' '}
              {Math.round(last.elapsedMs)} ms — mejora de {speedup.toFixed(2)}x frente a 1 estación.
            </p>
          )}
        </>
      )}
    </div>
  );
}
