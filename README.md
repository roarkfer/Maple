# Maple Offline v5

Versión independiente de Lovable de la nueva Maple.

Incluye tareas, hábitos, ejercicios, biblioteca EPUB, lector, fuentes personalizadas, libretas,
exportación TXT, modo oscuro y PWA offline.

Mantiene `kompakt-lists-v1`, por lo que al publicarla en el mismo origen de GitHub Pages conserva
los datos locales existentes. Los EPUB, portadas y fuentes se guardan en IndexedDB (`maple-files`).

No usa Lovable ni APIs externas para el funcionamiento normal. Después de una primera carga para
instalar el Service Worker, funciona offline.

Nota: el ZIP fuente recibido hace referencia a un DRAE empaquetado, pero no incluyó los binarios
del diccionario. Para garantizar cero dependencia de internet, el fallback a Wikcionario está
desactivado en esta build; el lector funciona, pero la definición integrada queda pendiente.

Para publicar:
1. Sube todo al repositorio Maple.
2. GitHub: Settings → Pages → Source → GitHub Actions.
3. Ejecuta el workflow `Build and deploy Maple` o haz push a `main`.
