import { gunzipSync } from "fflate";

export type StarDict = {
  index: Map<string, [number, number]>;
  dict: Uint8Array;
};

function readUint32BE(a: Uint8Array, i: number) {
  return ((a[i]! << 24) >>> 0) + (a[i + 1]! << 16) + (a[i + 2]! << 8) + a[i + 3]!;
}

/** Construye el índice StarDict a partir del .idx y el .dict(.dz). */
export function buildStarDict(idx: Uint8Array, dictRaw: Uint8Array, gz: boolean): StarDict {
  const dict = gz ? gunzipSync(dictRaw) : dictRaw;
  const index = new Map<string, [number, number]>();
  const decoder = new TextDecoder("utf-8");
  let i = 0;
  while (i < idx.length) {
    let end = i;
    while (end < idx.length && idx[end] !== 0) end++;
    if (end + 8 >= idx.length) break;
    const word = decoder.decode(idx.subarray(i, end));
    const off = readUint32BE(idx, end + 1);
    const size = readUint32BE(idx, end + 5);
    i = end + 9;
    if (!word) continue;
    const key = word.toLowerCase();
    if (!index.has(key)) index.set(key, [off, size]);
  }
  return { index, dict };
}

export function lookupStarDict(sd: StarDict, rawWord: string): string | null {
  const word = rawWord.trim().toLowerCase();
  if (!word) return null;
  const forms = [word, word.normalize("NFC")];
  if (word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.endsWith("s")) forms.push(word.slice(0, -1));
  if (word.endsWith("as") || word.endsWith("os")) forms.push(`${word.slice(0, -2)}o`);
  for (const form of forms) {
    const hit = sd.index.get(form);
    if (!hit) continue;
    const [off, size] = hit;
    const text = new TextDecoder("utf-8").decode(sd.dict.subarray(off, off + size));
    const clean = text
      .replace(/\u0000/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (clean) return clean;
  }
  return null;
}
