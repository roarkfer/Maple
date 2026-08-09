import type { DictMeta } from "@/lib/library-types";
import { lookupCustomDictionaries } from "@/lib/custom-dict";

const cache = new Map<string, string | null>();

/** Busca una definición solo en los diccionarios StarDict importados por el usuario. */
export async function define(rawWord: string, dicts: DictMeta[]): Promise<string | null> {
  const word = rawWord.trim().toLowerCase();
  if (!word) return null;

  const signature = `${dicts.map((d) => d.id).join(",")}:${word}`;
  if (cache.has(signature)) return cache.get(signature) ?? null;

  const hit = await lookupCustomDictionaries(dicts, word);
  cache.set(signature, hit);
  return hit;
}
