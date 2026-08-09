# Maple v5.2 Offline

Versión independiente de Lovable/TanStack Start de la Maple v5.2 definitiva.

## Conserva v5.2
- Tareas, hábitos y ejercicios.
- Biblioteca EPUB.
- Cambio de página por swipe horizontal.
- Modo página y modo scroll.
- Botones/teclas de volumen compatibles cuando el navegador/Android los expone como eventos.
- Diccionarios StarDict agregados por el usuario (`.idx` + `.dict` / `.dict.dz`).
- Libretas y escritura.
- Exportación de libretas a TXT local.
- Modo oscuro.
- Datos existentes en `kompakt-lists-v1`.

## Offline
No hay llamadas a Lovable, Wikcionario ni APIs externas durante el uso.
Los EPUB, portadas, fuentes y diccionarios siguen guardándose en IndexedDB.

Si una Maple anterior ya dejó un DRAE empaquetado en IndexedDB bajo `drae:idx` y `drae:dict`,
v5.2 lo reutiliza sin descargar nada. Si no existe, usa los diccionarios StarDict que agregues.

El Service Worker usa `maple-offline-v5-2`.

## GitHub Pages
1. Reemplaza el proyecto de tu repositorio Maple con estos archivos.
2. Deja **Settings → Pages → Source → GitHub Actions**.
3. El workflow **Build and deploy Maple v5.2** compila y publica el contenido de `dist`.
4. Abre Maple una vez con internet tras el deploy para instalar el nuevo Service Worker.
5. Después prueba en modo avión.

No borres los datos de Safari/PWA si quieres conservar tus datos locales.
