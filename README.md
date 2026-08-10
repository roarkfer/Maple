# Maple v6 Offline

Versión independiente de Lovable de Maple v6.

## Qué cambió
- Se eliminó TanStack Start y `@lovable.dev/vite-tanstack-config`.
- Se eliminó el reporte de errores de Lovable.
- La app ahora es React + Vite puro.
- Conserva la clave `kompakt-lists-v1`, por lo que mantiene compatibilidad con los datos locales de Maple anteriores cuando se usa en el mismo origen/navegador.
- La descarga de libretas crea el `.txt` directamente en el dispositivo, sin navegar a una ruta de servidor.
- El build genera un Service Worker que precarga todos los archivos estáticos de Maple.
- `manifest.webmanifest`, rutas e iconos usan rutas relativas para funcionar en GitHub Pages o en subcarpetas.

## Ejecutar localmente
```bash
npm install
npm run dev
```

## Compilar
```bash
npm run build
```

La versión final queda en `dist/`.

## Probar offline
1. Publica `dist/` en HTTPS (por ejemplo GitHub Pages).
2. Abre Maple una vez con internet.
3. Espera unos segundos y vuelve a abrirla.
4. Activa modo avión: Maple seguirá cargando.

## GitHub Pages
Este proyecto incluye `.github/workflows/deploy.yml`.

En GitHub configura **Settings → Pages → Source → GitHub Actions**. Después, cada push a `main` compilará y publicará Maple automáticamente.
