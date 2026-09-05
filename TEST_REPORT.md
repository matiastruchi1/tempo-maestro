# Informe de pruebas · Tempo

Fecha: 5 de septiembre de 2026

## Resultado

Se ejecutaron 24 pruebas automatizadas: **24 aprobadas, 0 fallidas**.

## Precisión temporal

Se simuló el mismo avance acumulativo usado por el secuenciador durante 30 minutos en cada tempo solicitado:

| BPM | Duración simulada | Drift matemático admitido | Resultado |
| ---: | ---: | ---: | --- |
| 60 | 30 min | < 0,00000001 s | Aprobado |
| 80 | 30 min | < 0,00000001 s | Aprobado |
| 100 | 30 min | < 0,00000001 s | Aprobado |
| 120 | 30 min | < 0,00000001 s | Aprobado |
| 160 | 30 min | < 0,00000001 s | Aprobado |
| 200 | 30 min | < 0,00000001 s | Aprobado |

Esto comprueba que la generación de marcas de tiempo no acumula un error numérico musicalmente relevante. En uso real, el audio se agenda sobre `AudioContext.currentTime`; el navegador y el hardware todavía pueden sumar latencia de salida, pero no modifican deliberadamente la separación programada entre pulsos.

## Funciones verificadas

- Límites y redondeo de BPM.
- Inicio, planificación futura sobre el reloj de audio y detención del scheduler.
- Pulso principal y subdivisiones.
- Agrupación de compases simples y compuestos.
- Cuenta previa de dos compases.
- Acentos personalizados.
- Progresión ascendente y descendente, con ajuste exacto a la meta.
- Ciclo de 4 compases con sonido y 2 en silencio.
- Tap Tempo estable y rechazo de un intervalo accidental.
- Reinicio de Tap Tempo después de una pausa.
- Historial sin duplicados.
- Guardado, recuperación y saneamiento de preferencias locales.
- Manifiesto, iconos, referencias locales y archivos de caché offline.
- Ausencia de dependencias remotas en la aplicación.
- Presencia de todos los controles requeridos por la interfaz.
- Sintaxis válida de todos los archivos JavaScript.

## Comprobación pendiente en dispositivo real

Este entorno no dispone de Safari para iPhone ni de salida de audio física. Por eso no se afirma una medición de latencia acústica ni una prueba real de bloqueo/segundo plano. La validación final en iPhone debe hacerse después de un despliegue HTTPS autorizado, comprobando sonido, volumen, modo silencio del teléfono, Wake Lock, cambio de aplicación y pantalla bloqueada.
