# Tempo · Metrónomo de estudio

PWA estática, sin cuentas ni servicios externos, diseñada para estudiar piano y repertorio clásico desde un iPhone. El proyecto no usa frameworks ni dependencias remotas.

## Funciones incluidas

- 30–300 BPM, edición manual, botones grandes de ±1 y repetición al mantener pulsado.
- Motor Web Audio con scheduling anticipado; sonidos Madera, Clásico y Digital.
- Iniciar/detener, Tap Tempo robusto, volumen persistente e indicador visual.
- Compases 2/4, 3/4, 4/4, 6/8, 9/8 y 12/8.
- Pulso principal, corcheas, tresillos y semicorcheas.
- Acento general y elección manual de tiempos acentuados.
- Cuenta previa de 0, 1 o 2 compases.
- Tempo progresivo configurable y entrenamiento alternado con sonido/silencio.
- Presets completos de obras, favoritos y seis tempos recientes.
- Persistencia local, instalación PWA, caché offline y Wake Lock cuando iOS lo permite.
- Bloqueo de cambios estructurales durante la reproducción y confirmación antes de borrar presets.

## Probarlo en una computadora

Los módulos y el service worker necesitan abrirse desde un servidor local; no conviene abrir `index.html` con doble clic.

Desde la carpeta del proyecto:

```bash
python3 -m http.server 8080 --directory dist
```

Después, abrir `http://localhost:8080` en el navegador. Para detener el servidor, presionar `Ctrl+C`.

Las pruebas automatizadas se ejecutan con:

```bash
node --test
```

## Instalarlo en iPhone

Para instalar una PWA y habilitar su caché offline, iOS necesita que el sitio esté servido mediante HTTPS. Una vez que la carpeta `dist` esté publicada en un alojamiento HTTPS:

1. Abrir el enlace en Safari.
2. Tocar el botón Compartir.
3. Elegir **Añadir a pantalla de inicio**.
4. Confirmar con **Añadir**.
5. Abrir Tempo una vez con conexión y esperar que indique **Offline listo**.

Desde entonces se abre mediante su icono y conserva configuraciones y obras en ese iPhone.

## Cómo está organizado

- `dist/index.html`: estructura y controles accesibles.
- `dist/styles.css`: diseño vertical, zonas táctiles y adaptación a áreas seguras de iPhone.
- `dist/js/audio-engine.js`: creación de los tres timbres con Web Audio API.
- `dist/js/scheduler.js`: planificación anticipada basada en el reloj de audio.
- `dist/js/sequencer.js`: compases, subdivisiones, cuenta previa y modos de práctica.
- `dist/js/tap-tempo.js`: cálculo robusto de Tap Tempo.
- `dist/js/storage.js`: validación y persistencia local.
- `dist/js/app.js`: interfaz, Wake Lock, presets e integración general.
- `dist/manifest.webmanifest`, `dist/sw.js` e `dist/icons/`: instalación y funcionamiento offline.
- `tests/`: pruebas de precisión, lógica y consistencia PWA.

## Decisiones musicales

- En `2/4`, `3/4` y `4/4`, el BPM representa la negra (`♩`).
- En `6/8`, `9/8` y `12/8`, el BPM representa la negra con puntillo (`♩.`), con 2, 3 y 4 pulsos principales por compás respectivamente.
- En compases simples, Corcheas, Tresillos y Semicorcheas dividen el pulso en 2, 3 y 4 partes.
- En compases compuestos, Corcheas y Tresillos lo dividen en 3 partes; Semicorcheas, en 6.

## Precisión y audio

El scheduler despierta cada 25 ms y deja programados aproximadamente 120 ms de audio por adelantado. Cada clic recibe una marca de tiempo del `AudioContext`; `setInterval` no determina el instante sonoro. Esto reduce jitter y evita que el pulso se base en el reloj de la interfaz.

El primer inicio debe surgir de una interacción del usuario porque Safari bloquea audio iniciado automáticamente. Cuando Safari ofrece `AudioSession`, Tempo solicita el modo `playback`; esto mejora el comportamiento con el interruptor de silencio del iPhone. El control de volumen se aplica con una curva suave y queda guardado.

## Funcionamiento offline

El service worker guarda la interfaz, los módulos, el manifiesto y los iconos. Después de una primera carga completa por HTTPS, esos elementos pueden abrirse sin internet. Los presets y ajustes se guardan únicamente en `localStorage` del dispositivo; borrar los datos de Safari elimina esa información.

## Limitaciones conocidas de iOS

- El funcionamiento fiable está garantizado mientras Tempo permanece visible y el iPhone está desbloqueado.
- iOS puede suspender Web Audio y los temporizadores al cambiar de aplicación, bloquear el teléfono o apagar la pantalla. Aunque Tempo solicita la sesión `playback` cuando está disponible, una PWA no puede garantizar audio continuo en segundo plano como una app nativa.
- Wake Lock se solicita mientras el metrónomo funciona, pero Safari puede rechazarlo o liberarlo por visibilidad, ahorro de energía o políticas del sistema.
- Al volver a Tempo, si iOS suspendió el audio aparece **REANUDAR AUDIO**. Si no alcanza, hay que detener e iniciar nuevamente.
- Auriculares Bluetooth pueden sumar latencia de salida. Los intervalos siguen programados por el reloj de audio, pero lo escuchado puede llegar más tarde.
- El destello visual usa el reloj de pantalla y puede diferir algunos milisegundos del sonido; el audio es la referencia principal.
- Wake Lock funciona en aplicaciones web añadidas a la pantalla de inicio desde iOS/iPadOS 18.4; en versiones anteriores puede no estar disponible dentro de la PWA instalada.

## Datos y privacidad

No hay login, base de datos, analítica, publicidad ni llamadas a APIs. Toda la información queda localmente en el navegador del dispositivo.

## Costos y publicación

El código fuente se conserva en [GitHub](https://github.com/matiastruchi1/tempo-maestro) y la versión de uso se prepara desde la rama `gh-pages` para la dirección:

`https://matiastruchi1.github.io/tempo-maestro/`

El proyecto utiliza GitHub Pages con un repositorio público, sin dominio personalizado ni servicios pagos. No se activó ninguna prueba, suscripción ni método de pago.
