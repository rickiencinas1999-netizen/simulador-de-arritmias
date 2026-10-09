# Simulador de Arritmias

Aplicación web para simular arritmias cardiacas en un monitor de signos vitales, para pláticas y prácticas con el equipo.

## Cómo usarlo

No necesita instalación ni conexión a internet: abre `index.html` en un navegador (Chrome, Edge, Firefox o Safari).

1. **Ritmo:** elige una arritmia y pulsa **Aplicar ahora** para que el monitor la muestre de inmediato (modo «una sola arritmia»). Con ese ritmo en pantalla, la FC y los signos vitales (SpO₂, PAS, PAD, FR, EtCO₂ y temperatura) cambian en el monitor en cuanto los modificas, sin reiniciar el ritmo.
2. **Escenario programado:** pulsa **Añadir al escenario** para encadenar varios ritmos. Cada paso tiene su duración en segundos; con duración **0** el paso espera hasta que el instructor pulse **Siguiente**. Puedes reordenar los pasos, repetir el escenario en bucle, guardarlo en el navegador o exportarlo a un archivo para compartirlo.
3. **Proyección:** **Monitor en otra ventana** abre solo el monitor (para el proyector o una segunda pantalla) mientras controlas todo desde la ventana principal. Con **Pantalla completa** (o doble clic en el monitor) lo amplías.

### Instalarla en el celular (app web)

1. Publica el sitio con GitHub Pages: en el repositorio, **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, la rama con la app y la carpeta **/(root)**, y guarda. En uno o dos minutos queda en `https://rickiencinas1999-netizen.github.io/simulador-de-arritmias/`.
2. Abre esa dirección en el celular.
   - **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o **Añadir a pantalla de inicio**).
   - **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.
3. Se abre como una app, con su icono y a pantalla completa. Después de la primera apertura también funciona sin conexión.

Al publicar cambios, sube el número de `VERSION` en `sw.js` para que los celulares descarguen la versión nueva.

### Intervenciones y opciones

- **RCP:** añade el artefacto de compresiones (110/min) al ECG y a la pletismografía y eleva el EtCO₂ en el paro.
- **Descarga:** muestra el artefacto de una desfibrilación. Después cambia el ritmo o avanza el escenario según quieras que responda el «paciente».
- **Congelar**, **silenciar alarmas**, **cuadrícula de papel ECG**, **ventana de barrido** (4–10 s) y **ganancia**.
- **Mostrar el nombre del ritmo:** para pláticas; desactívalo en las prácticas para que el equipo lo identifique.
- **Sonido:** pitido de cada latido (el tono baja con la SpO₂) y alarmas. Por las normas de los navegadores, hay que activarlo con un clic.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `N` | Siguiente paso del escenario |
| `C` | RCP sí/no |
| `D` | Descarga |
| `Espacio` | Congelar |
| `A` | Silenciar alarmas |
| `S` | Sonido |
| `F` | Pantalla completa |

## Ritmos incluidos

- **Sinusales:** ritmo sinusal normal, bradicardia sinusal, taquicardia sinusal y arritmia sinusal.
- **Supraventriculares:** fibrilación auricular, flutter 2:1 y 4:1, TSV y ritmo de la unión.
- **Extrasístoles:** extrasístoles ventriculares aisladas, bigeminismo y trigeminismo.
- **Bloqueos AV:** 1.er grado, Mobitz I, Mobitz II y bloqueo completo.
- **Ventriculares:** ritmo idioventricular, RIVA y TV con pulso.
- **Paro cardiaco:** TV sin pulso, torsades de pointes, FV gruesa y fina, asistolia y AESP.
- **Marcapasos:** ritmo de marcapasos y fallo de captura.

Cada ritmo trae una ficha con sus criterios electrocardiográficos clave y signos vitales por defecto, que se pueden modificar.

Escenarios de ejemplo: paro desfibrilable, paro no desfibrilable, bradiarritmias y bloqueos, taquiarritmias, extrasístoles y problemas de marcapasos.

## Estructura

```
index.html          Página principal (y vista de proyección con ?vista=monitor)
manifest.webmanifest, sw.js, iconos/   Instalación como app y uso sin conexión
css/estilos.css     Estilos
js/ritmos.js        Catálogo de ritmos y morfologías de onda
js/motor.js         Reloj de simulación y señales (ECG, pletismografía, capnografía)
js/monitor.js       Dibujo del monitor, valores numéricos, alarmas y sonido
js/escenarios.js    Escenarios de ejemplo, reproductor y almacenamiento
js/app.js           Interfaz del instructor
```

Para añadir un ritmo, agrega una entrada a `RITMOS` en `js/ritmos.js`.

## Aviso

Herramienta exclusivamente educativa. No es un dispositivo médico: las morfologías son aproximaciones y no sustituyen a las guías clínicas vigentes.
