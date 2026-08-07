# Maple PWA — standalone/offline

Esta versión NO depende de Lovable, React, Tailwind, npm ni ningún CDN para ejecutarse. Es HTML + CSS + JavaScript puro y un Service Worker.

## Funciones conservadas
- Tareas.
- Marcado de tareas y limpieza automática de completadas después de las 2:00 a. m.
- Hábitos con marcado del día actual y vista anual.
- Carpetas de ejercicios.
- Ejercicios con sets, reps y kg ajustables.
- Edición y eliminación.
- Modo oscuro.
- Persistencia en `localStorage` usando `kompakt-lists-v1` y `maple-dark`.

## Probar en Mac
Desde esta carpeta:

```bash
python3 -m http.server 8080
```

Luego abre `http://localhost:8080`.

## Instalar en iPhone
Para que iOS permita instalación/offline normalmente debe publicarse mediante HTTPS. Puedes subir esta carpeta tal cual a cualquier hosting estático HTTPS. Después:

1. Abre la dirección en Safari.
2. Compartir → Añadir a pantalla de inicio.
3. Abre Maple una vez con internet.
4. El Service Worker guardará la app y las siguientes aperturas podrán funcionar sin conexión.

## Importante sobre los datos existentes
El almacenamiento local pertenece al dominio. Los datos guardados en la versión de `lovable.app` no aparecerán automáticamente al abrir Maple desde un dominio distinto. La estructura de datos se conserva para facilitar una futura función de exportar/importar.
