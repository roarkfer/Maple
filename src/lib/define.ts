import { defineDrae } from "@/lib/drae";
import { defineUser } from "@/lib/userdict";

const cache = new Map<string, string | null>();

/** Busca definiciones únicamente en diccionarios locales/offline. */
export async function define(rawWord: string): Promise<string | null> {
  const word = rawWord.trim().toLowerCase();
  if (!word) return null;

  if (cache.has(word)) return cache.get(word) ?? null;

  const mine = await defineUser(word);
  if (mine) {
    cache.set(word, mine);
    return mine;
  }

  const drae = await defineDrae(word);
  cache.set(word, drae);
  return drae;
}
