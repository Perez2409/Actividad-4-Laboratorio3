# Simulador de Triage Hospitalario

Simulador web interactivo de concurrencia y paralelismo, desarrollado para la
Actividad 3 de Sistemas Operativos. Varias "estaciones de triage" (Web Workers,
es decir hilos reales del sistema operativo) evalúan pacientes y les asignan
una cama de un mapa de camas compartido. El simulador permite mostrar en vivo
una condición de carrera real (dos estaciones asignando la misma cama) y su
solución con mutex y semáforos, además de medir la ganancia de velocidad al
repartir trabajo entre varios Workers.

Ver [`GUION-EXPOSICION.md`](./GUION-EXPOSICION.md) para una explicación paso a
paso pensada para audiencia no técnica, con analogías cotidianas.

## Qué demuestra

- **Hilos reales:** cada estación de triage es un Web Worker independiente,
  cantidad configurable desde la UI.
- **El bug, en vivo:** con el switch "Sincronización activada" apagado, dos
  estaciones pueden asignar la misma cama a dos pacientes distintos — se ve en
  el log de eventos ("Cama X fue asignada dos veces").
- **La solución, en vivo:** el mismo switch, sin reiniciar la simulación,
  activa un mutex (`Atomics.compareExchange` + `Atomics.wait`/`notify`) que
  elimina el choque.
- **Comunicación y sincronización real:** `SharedArrayBuffer` + `Atomics` para
  el mapa de camas y la sala de espera (cola circular acotada con semáforos
  contadores), `postMessage`/`onmessage` para los eventos del log.
- **Eficiencia paralela medible:** una prueba de rendimiento corre el mismo
  lote de 200 pacientes con 1, 2 y 4 estaciones y grafica el tiempo real
  (`performance.now()`) de cada corrida.

## Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (modo estricto)
- [Vite](https://vitejs.dev/) + Web Workers de módulo (`new Worker(new URL(...), { type: 'module' })`)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Recharts](https://recharts.org/) para la gráfica de rendimiento

Todo el cálculo se hace en el cliente, sin backend.

## Requisitos

- [Node.js](https://nodejs.org/) 20 o superior
- npm (incluido con Node.js)
- Un navegador moderno con soporte de `SharedArrayBuffer` (Chrome, Edge,
  Firefox recientes)

## Cómo inicializar el proyecto

```bash
npm install
npm run dev
```

Esto abre el proyecto en `http://localhost:5173/`.

### Otros comandos disponibles

```bash
npm run build    # tsc -b (valida tipado estricto de app, workers y config) + build de producción en dist/
npm run preview  # sirve localmente el build de producción
npm run lint     # corre ESLint sobre todo el proyecto
```

### `SharedArrayBuffer` y aislamiento de origen cruzado

`vite.config.ts` agrega los headers `Cross-Origin-Opener-Policy: same-origin`
y `Cross-Origin-Embedder-Policy: require-corp` en `server` y `preview` —son
obligatorios para que el navegador exponga `SharedArrayBuffer`. Para
verificarlo: abrir la consola del navegador y confirmar que
`crossOriginIsolated` da `true`. Estos headers solo los agrega el servidor de
desarrollo/preview de Vite (Node); si el proyecto se despliega a un hosting
estático que no permita configurar headers propios, `SharedArrayBuffer` deja
de estar disponible en producción.

## Estructura del proyecto

```
src/
├── concurrency/        # Primitivas de sincronización, sin nada de interfaz ni de Workers
│   ├── mutex.ts          # Mutex (Atomics.compareExchange + wait/notify)
│   ├── semaphore.ts      # Semáforo contador (Atomics)
│   ├── boundedQueue.ts   # Cola circular acotada (sala de espera), siempre protegida
│   └── sharedState.ts    # Creación de los SharedArrayBuffer y vistas típadas
├── workers/             # Lo que corre dentro de cada Web Worker
│   ├── admision.worker.ts  # Productor: genera pacientes y los encola
│   ├── triage.worker.ts    # Consumidor: calcula urgencia y asigna cama (con y sin candado)
│   ├── urgencyScore.ts     # Cálculo CPU-bound real de la urgencia (compartido con el benchmark)
│   └── protocol.ts         # Tipos de los mensajes postMessage/onmessage
├── hooks/               # Orquestación (sin JSX): ciclo de vida de Workers y estado en vivo
│   ├── useHospitalSimulation.ts
│   └── useUrgencyBenchmark.ts
├── components/          # Interfaz: panel de configuración, mapa de camas, log, gráfica
│   └── ui/                # Componentes base de shadcn/ui
├── App.tsx
└── main.tsx
```

Los Workers no dependen de React, y los componentes no conocen los detalles
de `Atomics`/`SharedArrayBuffer`: leen snapshots ya resueltos por los hooks.

## Tabla de mapeo de conceptos

| Elemento del hospital | Concepto de SO | Implementación |
|---|---|---|
| Módulo de Admisión | Productor | `admision.worker.ts` |
| Estaciones de Triage | Consumidores / hilos en paralelo | N × `triage.worker.ts` |
| Sala de espera | Buffer acotado compartido | `SharedArrayBuffer` con índices circulares |
| Espacios llenos/vacíos de la sala | Semáforos contadores | `CountingSemaphore` (`Atomics`) |
| Mapa de camas | Recurso compartido | `SharedArrayBuffer` (estado por cama) |
| Candado de asignación de cama | Mutex | `Mutex` (`Atomics.compareExchange`) |
| Mensajes entre hilos | IPC | `postMessage` / `onmessage` |
| Cálculo del puntaje de urgencia | Carga de trabajo paralelizable | `urgencyScore.ts` |
