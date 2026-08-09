import { getFile } from "@/lib/idb";
import { buildStarDict, lookupStarDict, type StarDict } from "@/lib/stardict";

const IDX_KEY = "drae:idx";
const DICT_KEY = "drae:dict";

let loading: Promise<StarDict | null> | null = null;
let sd: StarDict | null = null;

/**
 * Maple Offline never downloads the DRAE.
 * If a previous Maple version already cached it in IndexedDB, it is reused.
 */
export function loadDrae(): Promise<StarDict | null> {
  if (sd) return Promise.resolve(sd);
  if (!loading) {
    loading = (async () => {
      try {
        const [idx, dict] = await Promise.all([getFile(IDX_KEY), getFile(DICT_KEY)]);
        if (!idx || !dict) return null;
        sd = buildStarDict(new Uint8Array(idx), new Uint8Array(dict), true);
        return sd;
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

export async function defineDrae(word: string): Promise<string | null> {
  const dict = await loadDrae();
  return dict ? lookupStarDict(dict, word) : null;
}
