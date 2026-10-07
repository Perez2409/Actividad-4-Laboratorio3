# Resultados y evidencia: Simulador de Cocina de Restaurante

Actividad 4 de Sistemas Operativos: mecanismos de sincronización entre hilos.

**Repositorio:** https://github.com/Perez2409/Actividad-4-Laboratorio3

## Qué es

Una aplicación web en la que cocineros y meseros son **Web Workers** (hilos
reales del sistema operativo creados por el navegador). Trabajan en paralelo
sobre memoria compartida (`SharedArrayBuffer` + `Atomics`) y se coordinan con
cinco mecanismos de sincronización. Cada mecanismo tiene un interruptor: al
apagarlo, su falla se **detecta y se muestra** en la interfaz y en el log.

| Elemento de la cocina | Mecanismo | Falla que aparece si se apaga |
|---|---|---|
| Un solo horno | Mutex | Dos cocineros usan el horno a la vez |
| 3 fogones | Semáforo contador | Más de 3 cocineros cocinan en los 3 fogones |
| Todos los platos de una mesa antes de servirla | Barrera | Las mesas salen con platos faltantes |
| Meseros esperando una mesa lista | Variable de condición | Espera ocupada: millones de consultas en vano |
| Cierre del turno | Join | El resumen se arma antes de que terminen los hilos |

## Configuración usada

Todas las corridas usan la configuración por defecto de la aplicación, sin
cambios:

| Parámetro | Valor |
|---|---|
| Cocineros (Web Workers) | 4 |
| Meseros (Web Workers) | 2 |
| Mesas del turno | 10 (4 platos por mesa, 40 platos en total) |
| Platos que necesitan horno | 50 % (21 de 40 con la semilla fija del menú) |
| Tiempo de cocción por etapa | 150 ms |
| Menú | Semilla fija: todas las corridas cocinan los mismos platos |

Entorno: Windows 11, Google Chrome 154, Node.js 24, servidor de desarrollo de
Vite (`npm run dev`), ventana de 1600 × 1500 px. Fecha: 6 de octubre de 2026.
Las capturas corresponden a la versión final del código.

## Capturas

| Archivo | Qué muestra | Momento |
|---|---|---|
| `01-interfaz-inicial.png` | La aplicación al abrirla: panel de configuración, los 5 interruptores encendidos, marcador en cero y vistas vacías. | Antes de iniciar |
| `02-todo-sincronizado.png` | Turno completo con los 5 mecanismos encendidos: 10 de 10 mesas servidas con sus 4 platos, cero fallas en el marcador y en el log, y el resumen "Generado con Join". | Fin del turno |
| `03-sin-mutex.png` | Mutex apagado. El recuadro del horno está en rojo con "¡2 cocineros en el horno a la vez! (Cocinero 1 y Cocinero 3)", ambos con estado "Horneando", y el log registra la colisión en rojo. | En pleno turno |
| `04-sin-semaforo.png` | Semáforo apagado. Los 3 fogones están ocupados y aparece en rojo "¡Sobrecupo! 4 cocineros en 3 fogones: Cocinero 4 sin fogón propio"; los 4 cocineros figuran "Cocinando en fogón". El log registra el sobrecupo. | En pleno turno (inicio de la Mesa 1) |
| `05-sin-barrera.png` | Barrera apagada. Las 10 mesas aparecen en rojo con "Servida con 1 de 4": la barra de cada mesa muestra en rojo los 3 platos que faltaban al servirla. | Fin del turno |
| `06-sin-variable-condicion.png` | Variable de condición apagada. Los 2 meseros están "Consultando sin parar (espera ocupada)" con el icono girando y sus contadores de consultas en vano en millones; el log registra cuántas veces preguntó cada uno. | En pleno turno (4 de 10 mesas servidas) |
| `07-sin-join.png` | Join apagado. El resumen dice "Generado SIN Join… con 6 hilos todavía trabajando" y muestra 1 de 10 mesas, pero el marcador (10 / 10) y los "Totales reales" prueban que se sirvieron las 10. El log marca con "tras el cierre" lo que ocurrió después del resumen. | Fin del turno |
| `08-comparacion.png` | Botón "Comparar": el mismo turno con todo encendido y con todo apagado, lado a lado. Las vistas de arriba muestran la corrida "todo apagado" (las 4 fallas en el marcador); los interruptores vuelven a la selección del usuario. | Fin de ambas corridas |

En las capturas 03, 04 y 06 el resumen todavía no existe porque se tomaron
en pleno turno, en el instante en que la falla está ocurriendo. Los números
de resumen de esos casos (más abajo) son del final de **esa misma corrida**.

## Resultados por caso

### Todo encendido (captura 02)

- Resumen: **Generado con Join**, el jefe esperó a que terminaran todos los hilos.
- Mesas servidas: **10 de 10** · Mesas incompletas: **0** · Colisiones en el
  horno: **0** · Sobrecupos de fogón: **0** · Consultas en vano: **0** ·
  Platos preparados: **40 de 40** · Tiempo total: **4,71 s**.
- Log: 123 eventos, **0 fallas de sincronización**.
- Paralelismo: los 40 platos suman 9,06 s de cocción (6,04 s de fogón y 3,02 s
  de horno) y el turno terminó en 4,71 s, porque los 3 fogones trabajan a la vez.

### Sin mutex (captura 03)

- Mensaje de error en el log (texto exacto):
  > Horno usado por 2 cocineros al mismo tiempo (Mesa 10)
- En la vista de la cocina, en el momento de la captura:
  > ¡2 cocineros en el horno a la vez! (Cocinero 1 y Cocinero 3)
- Resumen: 10 de 10 mesas · 0 incompletas · **10 colisiones en el horno** ·
  0 sobrecupos · 0 consultas en vano · 40 de 40 platos · 3,76 s.

### Sin semáforo (captura 04)

- Mensaje de error en el log (texto exacto):
  > 4 cocineros en 3 fogones: cocina sin fogón propio (Mesa 10)
- En la vista de la cocina, en el momento de la captura:
  > ¡Sobrecupo! 4 cocineros en 3 fogones: Cocinero 4 sin fogón propio
- Resumen: 10 de 10 mesas · 0 incompletas · 0 colisiones · **10 sobrecupos de
  fogón** (uno por mesa) · 0 consultas en vano · 40 de 40 platos · 4,47 s.

### Sin barrera (captura 05)

- Mensajes de error en el log (texto exacto):
  > Mesa 10 marcada lista con solo 1 de 4 platos
  >
  > Mesa 10 servida incompleta (1 de 4 platos)
- En la vista de mesas: cada una de las 10 mesas muestra "Servida con 1 de 4".
- Resumen: 10 de 10 mesas · **10 mesas servidas incompletas** · 0 colisiones ·
  0 sobrecupos · 0 consultas en vano · 40 de 40 platos · 3,35 s.

### Sin variable de condición (captura 06)

- Mensaje de error en el log (texto exacto, del final de la corrida):
  > Preguntó 1.720.396 veces en vano antes de obtener la Mesa 10
- En la captura: "Preguntó 4.204.591 veces en vano antes de obtener la Mesa 4",
  y ambos meseros en "Consultando sin parar (espera ocupada)".
- Resumen: 10 de 10 mesas · 0 incompletas · 0 colisiones · 0 sobrecupos ·
  **43.807.958 consultas en vano** · 40 de 40 platos · 4,71 s.
- Con la variable de condición encendida, los meseros duermen hasta que suena
  la campana y las consultas en vano son 0.

### Sin Join (captura 07)

- Mensajes de error en el log (texto exacto):
  > Resumen generado sin Join con 6 hilos todavía trabajando: 1 de 10 mesas
  >
  > Sirve la Mesa 10 DESPUÉS de cerrado el turno
  >
  > Terminó el último hilo: en realidad se sirvieron 10 mesas (el resumen dice 1)
- En el panel de resumen:
  > Generado SIN Join: el jefe cerró a la hora prevista con 6 hilos todavía
  > trabajando. Los totales están incompletos.
  >
  > Totales reales (cuando terminó el último hilo, a los 4.70 s): 10 de 10
  > mesas, 40 de 40 platos. El resumen decía 1 mesa.
- Resumen (prematuro): **1 de 10 mesas** · 0 incompletas · 0 colisiones ·
  0 sobrecupos · 0 consultas en vano · **6 de 40 platos** · 0,76 s.
- Sin Join, el jefe arma el resumen con un temporizador a la mitad del tiempo
  estimado del turno (10 mesas × 150 ms ÷ 2 = 0,75 s), sin esperar a nadie.

### Comparación: todo encendido vs. todo apagado (captura 08)

| Métrica | Todo encendido | Todo apagado (resumen) |
|---|---|---|
| Mesas servidas | 10 de 10 | 3 de 10 |
| Mesas servidas incompletas | 0 | 3 |
| Colisiones en el horno | 0 | 6 |
| Sobrecupos de fogón | 0 | 4 |
| Consultas en vano (meseros) | 0 | 7.858.952 |
| Platos preparados | 40 de 40 | 11 de 40 |
| Tiempo total del turno | 4,69 s | 0,77 s |

Como en "todo apagado" también está apagado el Join, su resumen se generó
antes de tiempo. Lo que realmente pasó en esa corrida: 10 mesas servidas,
10 incompletas, 14 colisiones de horno, 9 sobrecupos y 22.493.651 consultas
en vano.

## Resumen de todos los casos

| Caso | Mesas servidas (resumen) | Incompletas | Colisiones horno | Sobrecupos fogón | Consultas en vano | Tiempo |
|---|---|---|---|---|---|---|
| Todo encendido | 10 de 10 | 0 | 0 | 0 | 0 | 4,71 s |
| Sin mutex | 10 de 10 | 0 | **10** | 0 | 0 | 3,76 s |
| Sin semáforo | 10 de 10 | 0 | 0 | **10** | 0 | 4,47 s |
| Sin barrera | 10 de 10 | **10** | 0 | 0 | 0 | 3,35 s |
| Sin variable de condición | 10 de 10 | 0 | 0 | 0 | **43.807.958** | 4,71 s |
| Sin Join | **1 de 10** | 0 | 0 | 0 | 0 | 0,76 s |

Cada falla aparece **solo** cuando su mecanismo está apagado; con todo
encendido no hay ninguna.

## Repetibilidad

Además de las capturas, cada caso se corrió varias veces de forma automática
desde la interfaz, verificando que apareciera solo la falla esperada (sin
ningún fallo). Como los hilos son reales, algunos números varían un poco entre
corridas:

| Caso | Rango observado |
|---|---|
| Sin mutex | 10 a 12 colisiones en el horno |
| Sin semáforo | 10 sobrecupos en todas las corridas |
| Sin barrera | 10 de 10 mesas incompletas en todas las corridas |
| Sin variable de condición | entre 35 y 48 millones de consultas en vano |
| Sin Join | resumen de 1 de 10 mesas, con 6 hilos activos, en todas las corridas |
| Todo apagado | Totales reales: 13 a 14 colisiones, 9 a 10 sobrecupos, 10 incompletas. Resumen prematuro: 3 de 10 mesas |
| Todo encendido | 0 fallas en todas las corridas |
