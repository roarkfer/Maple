import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const dist = new URL("../dist/", import.meta.url);
const distPath = dist.pathname;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name !== "sw.js") files.push(full);
  }
  return files;
}

const files = await walk(distPath);
const urls = files.map((file) => `./${relative(distPath, file).replaceAll("\\\\", "/")}`);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const cacheName = `maple-offline-${pkg.version}`;

const sw = `const CACHE = ${JSON.stringify(cacheName)};\nconst APP_SHELL = ${JSON.stringify(urls, null, 2)};\n\nself.addEventListener("install", (event) => {\n  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));\n});\n\nself.addEventListener("activate", (event) => {\n  event.waitUntil(\n    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("maple-offline-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),\n  );\n});\n\nself.addEventListener("fetch", (event) => {\n  if (event.request.method !== "GET") return;\n  event.respondWith(\n    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {\n      if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {\n        const copy = response.clone();\n        caches.open(CACHE).then((cache) => cache.put(event.request, copy));\n      }\n      return response;\n    }).catch(() => caches.match("./index.html"))),\n  );\n});\n`;

await writeFile(new URL("../dist/sw.js", import.meta.url), sw);
console.log(`Service Worker generado con ${urls.length} archivos (${cacheName}).`);
