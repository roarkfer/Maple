# Maple v7 Offline

Versión autónoma de Maple v7 preparada para GitHub Pages/PWA.

## Incluye
- Hábitos
- Tareas
- Ejercicios
- Proyectos
- Escribir / libretas
- Modo oscuro
- PWA offline

## Independencia
- Sin Lovable.
- Sin `@lovable.dev/vite-tanstack-config`.
- Sin TanStack Start, Router o React Query.
- Sin APIs externas necesarias para funcionar.
- La exportación de libretas se hace como TXT local/compartible.
- Conserva `kompakt-lists-v1`, por lo que al publicarla en el mismo origen mantiene los datos existentes.

## Offline
El Service Worker usa el caché `maple-offline-v7`.
Después de abrir la nueva versión una vez con internet, puede iniciar sin conexión.

## GitHub Pages
1. Reemplaza los archivos del proyecto por los de este ZIP.
2. Deja **Settings → Pages → Source → GitHub Actions**.
3. El workflow `Build and deploy Maple v7` compila y publica `dist`.
4. Abre Maple una vez con internet después del deploy.
5. Prueba en modo avión.

No borres los datos del navegador/PWA si quieres conservar tus datos locales.
