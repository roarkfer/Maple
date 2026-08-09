import { useEffect, useRef, useState } from "react";
import { Book, BookOpen, Plus, Trash2 } from "lucide-react";
import { putFile, getFile, delFile } from "@/lib/idb";
import { parseEpub } from "@/lib/epub";
import type { BookMeta, DictMeta, FontMeta } from "@/lib/library-types";

function nextId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function registerFont(family: string, id: string) {
  const buf = await getFile(`font:${id}`);
  if (!buf) return;
  try {
    const face = new FontFace(family, buf);
    await face.load();
    (document.fonts as FontFaceSet).add(face);
  } catch {
    /* fuente inválida */
  }
}

type Props = {
  books: BookMeta[];
  dicts: DictMeta[];
  fonts: FontMeta[];
  editing: boolean;
  onBooks: (b: BookMeta[]) => void;
  onDicts: (d: DictMeta[]) => void;
  onFonts: (f: FontMeta[]) => void;
  onOpen: (id: string) => void;
};

export default function Library({
  books,
  dicts,
  fonts,
  editing,
  onBooks,
  onDicts,
  onFonts,
  onOpen,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const epubRef = useRef<HTMLInputElement>(null);
  const dictRef = useRef<HTMLInputElement>(null);

  const coverUrls = useRef<Record<string, string>>({});
  const bookIds = books.map((b) => b.id).join(",");

  // Las portadas se cargan una sola vez por libro y se conservan mientras la
  // biblioteca esté abierta, para que siempre estén visibles.
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const b of books) {
        if (!b.hasCover || coverUrls.current[b.id]) continue;
        const buf = await getFile(`cover:${b.id}`);
        if (!buf || !alive) continue;
        const url = URL.createObjectURL(new Blob([buf], { type: b.coverMime || "image/jpeg" }));
        coverUrls.current[b.id] = url;
        setCovers({ ...coverUrls.current });
      }
      // limpia portadas de libros eliminados
      for (const id of Object.keys(coverUrls.current)) {
        if (books.some((b) => b.id === id)) continue;
        URL.revokeObjectURL(coverUrls.current[id]!);
        delete coverUrls.current[id];
      }
      if (alive) setCovers({ ...coverUrls.current });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookIds]);

  useEffect(() => {
    const urls = coverUrls.current;
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);


  const addEpub = async (file: File) => {
    setBusy("Procesando libro…");
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseEpub(buf);
      parsed.objectUrls.forEach((u) => URL.revokeObjectURL(u));
      const id = nextId();
      await putFile(`book:${id}`, buf);
      if (parsed.coverBlob) await putFile(`cover:${id}`, parsed.coverBlob);
      onBooks([
        ...books,
        {
          id,
          title: parsed.title || file.name.replace(/\.epub$/i, ""),
          author: parsed.author,
          progress: 0,
          hasCover: !!parsed.coverBlob,
          coverMime: parsed.coverMime,
        },
      ]);
    } catch (e) {
      setBusy(e instanceof Error ? e.message : "No se pudo leer el epub");
      setTimeout(() => setBusy(null), 2500);
      return;
    }
    setBusy(null);
  };

  // Un diccionario StarDict son dos archivos: .idx y .dict (o .dict.dz).
  const addDict = async (files: File[]) => {
    const idxFile = files.find((f) => /\.idx$/i.test(f.name));
    const datFile = files.find((f) => /\.dict(\.dz)?$/i.test(f.name));
    if (!idxFile || !datFile) {
      setBusy("Selecciona los dos archivos: .idx y .dict (o .dict.dz)");
      setTimeout(() => setBusy(null), 3500);
      return;
    }
    setBusy("Guardando diccionario…");
    try {
      const id = nextId();
      await putFile(`dictidx:${id}`, await idxFile.arrayBuffer());
      await putFile(`dictdat:${id}`, await datFile.arrayBuffer());
      onDicts([
        ...dicts,
        {
          id,
          name: idxFile.name.replace(/\.idx$/i, ""),
          gz: /\.dz$/i.test(datFile.name),
        },
      ]);
      setBusy(null);
    } catch {
      setBusy("No se pudo guardar el diccionario");
      setTimeout(() => setBusy(null), 2500);
    }
  };


  return (
    <div className="mt-2 flex-1">
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-label="Agregar"
          className="flex size-9 items-center justify-center rounded-md border border-foreground active:scale-95"
        >
          <Plus size={18} strokeWidth={1.9} />
        </button>
        {busy && <span className="text-[13px] text-muted-foreground">{busy}</span>}

        {menu && (
          <div className="absolute left-0 top-11 z-20 w-60 space-y-1 rounded-md border border-border bg-background p-2 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                epubRef.current?.click();
              }}
              className="flex w-full items-center gap-2 px-1 py-2 text-left text-[15px]"
            >
              <Book size={16} strokeWidth={1.8} /> Agregar libro (.epub)
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                dictRef.current?.click();
              }}
              className="flex w-full items-center gap-2 px-1 py-2 text-left text-[15px]"
            >
              <BookOpen size={16} strokeWidth={1.8} /> Agregar diccionario (.idx + .dict)
            </button>
          </div>
        )}
      </div>

      <input
        ref={epubRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addEpub(f);
          e.target.value = "";
        }}
      />
      <input
        ref={dictRef}
        type="file"
        multiple
        accept=".idx,.dict,.dz,.ifo"
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void addDict(fs);
          e.target.value = "";
        }}
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        {books.map((b) => (
          <div key={b.id} className="space-y-1">
            <button
              type="button"
              onClick={() => onOpen(b.id)}
              className="block w-full overflow-hidden rounded-md border border-border active:scale-95"
            >
              {covers[b.id] ? (
                <img
                  src={covers[b.id]}
                  alt={`Portada de ${b.title}`}
                  className="aspect-[2/3] w-full object-cover"
                />
              ) : (
                <span className="flex aspect-[2/3] w-full items-center justify-center p-2 text-center text-[12px] leading-tight text-muted-foreground">
                  {b.title}
                </span>
              )}
            </button>
            <p className="truncate text-[12px] leading-tight">{b.title}</p>
            <p className="text-[12px] tabular-nums text-muted-foreground">
              {Math.round(b.progress * 100)}%
            </p>
            {editing && (
              <button
                type="button"
                onClick={async () => {
                  await delFile(`book:${b.id}`);
                  await delFile(`cover:${b.id}`);
                  onBooks(books.filter((x) => x.id !== b.id));
                }}
                aria-label={`Eliminar ${b.title}`}
                className="flex items-center gap-1 text-[12px] text-muted-foreground"
              >
                <Trash2 size={13} strokeWidth={1.8} /> Eliminar
              </button>
            )}
          </div>
        ))}
      </div>

      {books.length === 0 && (
        <p className="py-6 text-[16px] text-muted-foreground">
          Sin libros. Usa el botón + para agregar un .epub.
        </p>
      )}

      {editing && dicts.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
              Diccionarios
            </p>
            {dicts.map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1 text-[15px]">
                <span className="flex-1 truncate">{d.name}</span>
                <button
                  type="button"
                  aria-label={`Eliminar ${d.name}`}
                  onClick={async () => {
                    await delFile(`dictidx:${d.id}`);
                    await delFile(`dictdat:${d.id}`);
                    onDicts(dicts.filter((x) => x.id !== d.id));
                  }}
                  className="text-muted-foreground"
                >
                  <Trash2 size={15} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
