# Simulador de Cocina de Restaurante

Simulador web de **mecanismos de sincronización entre hilos**, desarrollado para
la Actividad 4 de Sistemas Operativos. Cocineros y meseros son **Web Workers**
(hilos reales que el navegador crea en el sistema operativo) que trabajan en
paralelo sobre memoria compartida y se coordinan con **cinco mecanismos de
sincronización**. Cada mecanismo tiene un interruptor: al apagarlo, su falla
aparece en la interfaz y en el log, detectada en el momento, no supuesta.

## El escenario

Llegan **mesas** con pedidos. Cada mesa tiene tantos comensales como cocineros,
y cada cocinero prepara **un plato** de cada mesa. Para cocinar, los cocineros
compiten por recursos limitados: **3 fogones** (todo plato pasa por uno) y **un
solo horno** (solo algunos platos lo necesitan). Cuando todos los platos de una
mesa están listos, un **mesero** la lleva. Al terminar el turno, el **jefe de
cocina** lo cierra y arma el resumen.

| Actor | Implementación |
|---|---|
| Cocineros | N Web Workers (`cocinero.worker.ts`), configurable de 1 a 8 (4 por defecto) |
| Meseros | M Web Workers (`mesero.worker.ts`), configurable de 1 a 4 (2 por defecto) |
| Jefe de cocina | Hilo principal (`kitchenController.ts`): lanza los hilos, da la salida y cierra el turno |

## Los cinco mecanismos

| Elemento de la cocina | Mecanismo | Implementación | Si se apaga… |
|---|---|---|---|
| **Un solo horno** | **Mutex** ([`mutex.ts`](src/concurrency/mutex.ts)) | `Atomics.compareExchange` + `Atomics.wait/notify` (futex de 3 estados) | Dos cocineros hornean a la vez: *"Horno usado por 2 cocineros al mismo tiempo"* |
| **3 fogones** | **Semáforo contador** ([`semaphore.ts`](src/concurrency/semaphore.ts)) | Contador de permisos en memoria compartida con `Atomics` | Más de 3 cocineros cocinan a la vez: *"4 cocineros en 3 fogones"* |
| **Todos los platos de una mesa antes de servirla** | **Barrera** ([`barrier.ts`](src/concurrency/barrier.ts)) | Contador de llegadas + número de generación (reutilizable en cada mesa) | La mesa se da por lista con el primer plato: *"Mesa 3 servida incompleta (1 de 4 platos)"* |
| **Meseros esperando una mesa lista** | **Variable de condición** ([`conditionVariable.ts`](src/concurrency/conditionVariable.ts)) | Mutex + número de secuencia; `Atomics.wait` para dormir, `Atomics.notify` para despertar | Los meseros hacen **espera ocupada**: un contador de "consultas en vano" sube a millones |
| **Cierre del turno** | **Join** ([`join.ts`](src/concurrency/join.ts)) | Cada Worker avisa con un `postMessage` final; el jefe espera todos con `Promise.all` | El resumen se arma antes de tiempo: *"Resumen generado sin Join con 6 hilos todavía trabajando: 1 de 10 mesas"* |

Además, la cola de mesas listas que comparten cocineros y meseros siempre está
protegida por su propio mutex: no tiene interruptor, para que la única falla
visible al apagar algo sea la del mecanismo apagado.

### Cómo se detecta cada falla

Cada recurso lleva un **contador de ocupación real** en memoria compartida,
independiente del mecanismo. Al entrar al horno o a un fogón, el cocinero lo
incrementa con `Atomics.add`; si el valor resultante supera la capacidad (1 en
el horno, 3 en los fogones), registra una colisión o un sobrecupo. El mesero
cuenta los platos de la mesa en el momento de retirarla, y el jefe registra
cuántos hilos seguían vivos al armar el resumen. Así, con todo encendido los
contadores quedan en **cero**, y con un mecanismo apagado se ve **solo su**
falla.

### Paralelismo sin sacrificarlo

- Los candados protegen solo lo estrictamente necesario: tomar o soltar un
  fogón, entrar o salir del horno y actualizar la cola de mesas. La cocción es
  trabajo real de CPU (un cálculo en bucle durante el tiempo configurado, no
  una pausa) y ocurre en paralelo en cada Worker.
- Un cocinero **nunca retiene un recurso mientras espera otro**: usa el fogón,
  lo suelta y recién después pide el horno. Con ese orden fijo no puede
  formarse una espera circular, así que no hay interbloqueo (*deadlock*).
- Con la configuración por defecto, el menú del turno suma **9,06 s** de
  cocción (6,04 s de fogón y 3,02 s de horno), y el turno con todo encendido
  termina en unos **4,7 s**: los 3 fogones trabajan a la vez.

## Cómo usarlo

1. Ajusta la configuración: cocineros, meseros, mesas, porcentaje de platos con
   horno y tiempo de cocción.
2. Deja los cinco mecanismos encendidos y pulsa **Iniciar turno**: cero fallas
   y el resumen generado con Join.
3. Apaga **un solo** mecanismo e inicia otro turno: su falla aparece en rojo en
   el marcador, en la vista de la cocina, de las mesas o de los meseros, y en
   el log. El interruptor **Solo fallas** del log deja solo los errores.
4. **Comparar** corre el mismo turno (mismo menú) con todo encendido y después
   con todo apagado, y muestra ambos resúmenes lado a lado.

Si la configuración hace imposible alguna falla (por ejemplo, con 3 cocineros o
menos nunca se llenan los 3 fogones), el panel muestra un aviso.

## Cómo correrlo

### Requisitos

- [Node.js](https://nodejs.org/) 20 o superior
- npm (incluido con Node.js)
- Un navegador moderno con soporte de `SharedArrayBuffer` (Chrome, Edge o
  Firefox recientes)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173/`.

```bash
npm run build    # tsc -b (tipado estricto de app, workers y config) + build de producción en dist/
npm run preview  # sirve localmente el build de producción
npm run lint     # ESLint sobre todo el proyecto
```

### `SharedArrayBuffer` y aislamiento de origen cruzado

`vite.config.ts` agrega los headers `Cross-Origin-Opener-Policy: same-origin` y
`Cross-Origin-Embedder-Policy: require-corp` en `server` y `preview`; son
obligatorios para que el navegador exponga `SharedArrayBuffer`. Para
verificarlo, en la consola del navegador `crossOriginIsolated` debe dar `true`.
Un hosting estático que no permita configurar estos headers no puede servir la
aplicación.

## Estructura del proyecto

```
src/
├── concurrency/              # Primitivas de sincronización (sin React)
│   ├── mutex.ts                # Mutex (futex de 3 estados con Atomics)
│   ├── semaphore.ts            # Semáforo contador
│   ├── barrier.ts              # Barrera reutilizable (contador + generación)
│   ├── conditionVariable.ts    # Variable de condición sobre un mutex
│   ├── join.ts                 # Esperar el mensaje final de todos los Workers
│   └── sharedState.ts          # El SharedArrayBuffer, su mapa de índices y la lectura en vivo
├── workers/                  # Lo que corre dentro de cada hilo
│   ├── cocinero.worker.ts      # Fogón (semáforo) → horno (mutex) → barrera → avisa al mesero
│   ├── mesero.worker.ts        # Espera mesa lista (variable de condición o espera ocupada) y la sirve
│   └── protocol.ts             # Tipos de los mensajes postMessage
├── kitchen/                  # Orquestación, sin interfaz
│   ├── config.ts               # Tipos, valores por defecto, límites y menú determinista
│   ├── kitchenController.ts    # Jefe de cocina: lanza los Workers, aplica el Join y arma el resumen
│   └── useKitchen.ts           # Puente con React (refresco por requestAnimationFrame)
├── components/               # Interfaz
│   ├── ControlPanel.tsx        # Configuración, 5 interruptores, avisos y botones
│   ├── LiveCounters.tsx        # Marcador en vivo: una cifra por mecanismo
│   ├── KitchenView.tsx         # Horno, fogones y estado de cada cocinero
│   ├── TablesView.tsx          # Mesas y sus platos listos
│   ├── WaitersView.tsx         # Meseros y contador de consultas en vano
│   ├── EventLog.tsx            # Log en tiempo real (hora, actor, acción; fallas en rojo)
│   ├── ShiftSummary.tsx        # Resumen del turno y comparación
│   └── ui/                     # Componentes base de shadcn/ui
├── App.tsx
└── main.tsx

evidencia-pdf/                # Capturas de cada mecanismo funcionando y fallando + resultados.md
```

## Detalles técnicos

- **Un solo `SharedArrayBuffer`.** Todo el estado compartido vive en un
  `Int32Array` con un mapa de índices fijo, documentado al inicio de
  [`sharedState.ts`](src/concurrency/sharedState.ts). Viaja a cada Worker por
  `postMessage` por referencia, sin copiarse.
- **Esperas bloqueantes solo en los Workers.** `Atomics.wait` está prohibido en
  el hilo principal del navegador, así que el jefe de cocina solo usa
  `postMessage`, promesas y lecturas con `Atomics.load` (la interfaz lee una
  foto del estado en cada cuadro de animación). `Atomics.notify` sí se usa en el
  hilo principal, para dar la señal de salida a todos los Workers a la vez.
- **Interruptores fijos durante el turno.** Se escriben en la memoria
  compartida antes de lanzar los Workers y no cambian hasta el siguiente turno,
  para que el estado nunca quede a medias (permisos sin devolver, barreras con
  cuentas viejas).
- **Join apagado.** El jefe arma el resumen con un temporizador, a la mitad del
  tiempo estimado del turno (mesas × tiempo de cocción ÷ 2). Los Workers siguen
  trabajando y el log marca lo que ocurre "tras el cierre". Cuando termina el
  último hilo se muestran los totales reales, para contrastarlos con el resumen.
- **Hilos con nombre.** Cada Worker se crea con `name` ("Cocinero 1",
  "Mesero 2"…), así aparecen identificados en las DevTools del navegador.
- **Menú determinista.** Qué platos usan horno y cuánto tarda cada uno sale de
  una semilla fija, así cada corrida (y las dos de "Comparar") cocinan los
  mismos platos.

## Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) en modo estricto
- [Vite](https://vite.dev/) + Web Workers de módulo (`new Worker(new URL(...), { type: 'module' })`)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Lucide](https://lucide.dev/) (iconos)

Todo se ejecuta en el navegador, sin backend.
