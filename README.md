# Maple Offline v4

Versión autónoma para GitHub Pages/PWA.

- No depende de Lovable.
- No usa React, TanStack, Tailwind, CDN ni APIs externas en tiempo de ejecución.
- Funciona offline después de abrirse una vez con internet.
- Conserva `kompakt-lists-v1` y `maple-dark`, por lo que una actualización sobre el mismo sitio conserva los datos locales.
- Rutas relativas compatibles con GitHub Pages.
- Cache nuevo: `maple-offline-v4`.

## Actualizar
Reemplaza en la raíz del repositorio los archivos:
`index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js` y `README.md`.
Luego haz commit y abre Maple una vez con internet para que el nuevo Service Worker se instale.
