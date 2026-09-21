# Maple v9.2 Offline

Versión estática y offline de Maple v9.2 para GitHub Pages.

- Sin Lovable.
- Sin TanStack Router / Start.
- Sin servidor SSR.
- Los datos siguen usando `localStorage` con la clave `kompakt-lists-v1`.
- PWA offline mediante `sw.js`.
- La página de exportación de libretas se conserva como `export.html`.

## Novedades de v9.2

- Pestañas independientes dentro de Tareas.
- Botón `+` junto al título para crear `Lista 1`, `Lista 2`, etc.
- Renombrado y eliminación de listas desde `Editar`.
- Selector de listas en Hoy para consultar y completar su contenido.
- Migración automática de las tareas y recurrencias existentes.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
