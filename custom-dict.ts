import { getFile, putFile, delFile } from "@/lib/idb";
import { buildStarDict, lookupStarDict, type StarDict } from "@/lib/stardict";
import type { DictMeta } from "@/lib/library-types";

const cache = new Map<string, StarDict>();

export async function saveDictionary(
  id: string,
  idx: Uint8Array,
  dict: Uint8Array,
) {
  await putFile(`dict:${id}:idx`, idx.buffer.slice(idx.byteOffset, idx.byteOffset + idx.byteLength));
  await putFile(`dict:${id}:data`, dict.buffer.slice(dict.byteOffset, dict.byteOffset + dict.byteLength));
  cache.delete(id);
}

export async function removeDictionary(id: string) {
  await delFile(`dict:${id}:idx`);
  await delFile(`dict:${id}:data`);
  cache.delete(id);
}

async function loadDictionary(meta: DictMeta): Promise<StarDict | null> {
  const existing = cache.get(meta.id);
  if (existing) return existing;
  const [idxBuf, dictBuf] = await Promise.all([
    getFile(`dict:${meta.id}:idx`),
    getFile(`dict:${meta.id}:data`),
  ]);
  if (!idxBuf || !dictBuf) return null;
  try {
    const sd = buildStarDict(new Uint8Array(idxBuf), new Uint8Array(dictBuf), meta.gz);
    cache.set(meta.id, sd);
    return sd;
  } catch {
    return null;
  }
}

export async function lookupCustomDictionaries(
  dicts: DictMeta[],
  word: string,
): Promise<string | null> {
  for (const meta of dicts) {
    const sd = await loadDictionary(meta);
    if (!sd) continue;
    const hit = lookupStarDict(sd, word);
    if (hit) return hit;
  }
  return null;
}
