// Definición de palabras: primero el diccionario DRAE local (StarDict),
// y como respaldo el Wikcionario en español.

import { defineDrae } from "@/lib/drae";
import { defineUser } from "@/lib/userdict";

const cache = new Map<string, string>();

function strip(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type WiktEntry = { definitions?: { definition?: string }[] };

async function fromWiktionaryEs(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://es.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, WiktEntry[]>;
    const defs = Object.values(data)
      .flat()
      .flatMap((e) => e.definitions ?? [])
      .map((d) => strip(d.definition ?? ""))
      .filter(Boolean)
      .slice(0, 3);
    return defs.length ? defs.map((d, i) => `${i + 1}. ${d}`).join("\n") : null;
  } catch {
    return null;
  }
}

/** Busca la definición de una palabra, siempre en español. */
export async function define(rawWord: string): Promise<string | null> {
  const word = rawWord.trim().toLowerCase();
  if (!word) return null;
  const cached = cache.get(word);
  if (cached !== undefined) return cached;

  const mine = await defineUser(word);
  if (mine) {
    cache.set(word, mine);
    return mine;
  }

  const local = await defineDrae(word);
  if (local) {
    cache.set(word, local);
    return local;
  }

  const forms = [word];
  if (word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.endsWith("s")) forms.push(word.slice(0, -1));
  for (const form of forms) {
    const hit = await fromWiktionaryEs(form);
    if (hit) {
      cache.set(word, hit);
      return hit;
    }
  }
  return null;
}
