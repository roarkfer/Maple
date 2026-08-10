// Diccionarios StarDict agregados por el usuario desde la biblioteca.
// Los archivos viven en IndexedDB; el índice se construye la primera vez que
// se necesita y queda en memoria.

import { getFile } from "@/lib/idb";
import { buildStarDict, lookupStarDict, type StarDict } from "@/lib/stardict";
import type { DictMeta } from "@/lib/library-types";

let metas: DictMeta[] = [];
const cache = new Map<string, Promise<StarDict | null>>();

export function setUserDicts(list: DictMeta[]) {
  metas = list;
  for (const key of [...cache.keys()]) {
    if (!list.some((d) => d.id === key)) cache.delete(key);
  }
}

function load(meta: DictMeta): Promise<StarDict | null> {
  const hit = cache.get(meta.id);
  if (hit) return hit;
  const p = (async () => {
    try {
      const [idx, dict] = await Promise.all([
        getFile(`dictidx:${meta.id}`),
        getFile(`dictdat:${meta.id}`),
      ]);
      if (!idx || !dict) return null;
      return buildStarDict(new Uint8Array(idx), new Uint8Array(dict), meta.gz);
    } catch {
      return null;
    }
  })();
  cache.set(meta.id, p);
  return p;
}

/** Busca la palabra en los diccionarios agregados por el usuario. */
export async function defineUser(word: string): Promise<string | null> {
  for (const meta of metas) {
    const sd = await load(meta);
    if (!sd) continue;
    const hit = lookupStarDict(sd, word);
    if (hit) return hit;
  }
  return null;
}
