// Diccionario DRAE (StarDict) empaquetado con la app.
// Se descarga una sola vez y queda guardado en IndexedDB para uso sin conexión.

import idxAsset from "@/assets/drae-idx.asset.json";
import dictAsset from "@/assets/drae-dict.asset.json";
import { getFile, putFile } from "@/lib/idb";
import { buildStarDict, lookupStarDict, type StarDict } from "@/lib/stardict";

const IDX_KEY = "drae:idx";
const DICT_KEY = "drae:dict";

let loading: Promise<StarDict | null> | null = null;
let sd: StarDict | null = null;

async function fetchAndCache(key: string, url: string): Promise<Uint8Array> {
  const cached = await getFile(key);
  if (cached) return new Uint8Array(cached);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el diccionario (${res.status})`);
  const buf = await res.arrayBuffer();
  await putFile(key, buf);
  return new Uint8Array(buf);
}

export function loadDrae(): Promise<StarDict | null> {
  if (sd) return Promise.resolve(sd);
  if (!loading) {
    loading = (async () => {
      try {
        const [idx, dict] = await Promise.all([
          fetchAndCache(IDX_KEY, idxAsset.url),
          fetchAndCache(DICT_KEY, dictAsset.url),
        ]);
        sd = buildStarDict(idx, dict, true);
        return sd;
      } catch {
        loading = null;
        return null;
      }
    })();
  }
  return loading;
}

export async function defineDrae(word: string): Promise<string | null> {
  const dict = await loadDrae();
  if (!dict) return null;
  return lookupStarDict(dict, word);
}
