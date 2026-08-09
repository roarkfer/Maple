import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Minus, Plus, Search, Type, X } from "lucide-react";
import { getFile } from "@/lib/idb";
import { parseEpub, type EpubChapter } from "@/lib/epub";
import { define } from "@/lib/define";
import type { BookMeta, DictMeta, FontMeta, ReaderSettings } from "@/lib/library-types";

type Props = {
  book: BookMeta;
  fonts: FontMeta[];
  dicts: DictMeta[];
  settings: ReaderSettings;
  onSettings: (s: ReaderSettings) => void;
  onProgress: (progress: number) => void;
  onBack: () => void;
};

export default function Reader({
  book,
  fonts,
  dicts,
  settings,
  onSettings,
  onProgress,
  onBack,
}: Props) {

  const [chapters, setChapters] = useState<EpubChapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<"none" | "search" | "font">("none");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<number>(0);
  const [popup, setPopup] = useState<{ x: number; y: number; word: string; def: string } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let urls: string[] = [];
    let alive = true;
    (async () => {
      try {
        const buf = await getFile(`book:${book.id}`);
        if (!buf) throw new Error("Archivo no encontrado");
        const parsed = parseEpub(buf);
        urls = parsed.objectUrls;
        if (alive) setChapters(parsed.chapters);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo abrir el libro");
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [book.id]);

  // Ancho de página (paginación horizontal por columnas)
  const [pageW, setPageW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setPageW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restaurar la última posición de lectura
  useEffect(() => {
    if (!chapters || restored.current || !pageW) return;
    const el = scrollRef.current;
    if (!el) return;
    restored.current = true;
    requestAnimationFrame(() => {
      const max = el.scrollWidth - el.clientWidth;
      const target = Math.max(0, max * book.progress);
      el.scrollLeft = Math.round(target / el.clientWidth) * el.clientWidth;
    });
  }, [chapters, book.progress, pageW]);

  const saveProgress = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !restored.current) return;
    const max = el.scrollWidth - el.clientWidth;
    onProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0);
  }, [onProgress]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(saveProgress, 400);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      el.removeEventListener("scroll", onScroll);
      saveProgress();
    };
  }, [saveProgress, chapters]);


  const wordAt = (x: number, y: number): string | null => {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let node: Node | null = null;
    let offset = 0;
    if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    } else if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(x, y);
      if (p) {
        node = p.offsetNode;
        offset = p.offset;
      }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent ?? "";
    const isWord = (c: string) => /[\p{L}\p{M}'-]/u.test(c);
    let s = offset;
    let e = offset;
    while (s > 0 && isWord(text[s - 1]!)) s--;
    while (e < text.length && isWord(text[e]!)) e++;
    const w = text.slice(s, e).trim();
    return w || null;
  };

  const onLongPress = async (x: number, y: number) => {
    const word = wordAt(x, y);
    if (!word) return;
    setPopup({ x, y, word, def: "Buscando…" });
    const def = await define(word, dicts);
    setPopup({ x, y, word, def: def ?? "Sin definición." });
  };


  const handlePointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    swipeStart.current = { x: e.clientX, y: e.clientY };
    const { clientX, clientY } = e;
    pressTimer.current = setTimeout(() => {
      if (!moved.current) void onLongPress(clientX, clientY);
    }, 450);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) {
      moved.current = true;
      cancelPress();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    cancelPress();
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Swipe horizontal: izquierda = página siguiente; derecha = anterior.
    if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      turnPage(dx < 0 ? 1 : -1);
      moved.current = true;
    }
  };

  const turnPage = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = el.clientWidth;
    const next = Math.round(el.scrollLeft / step) * step + dir * step;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: Math.min(max, Math.max(0, next)), behavior: "smooth" });
  }, []);

  // Botones de volumen para pasar página mientras el libro está abierto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const c = e.keyCode;
      if (k === "AudioVolumeUp" || k === "VolumeUp" || c === 175) {
        e.preventDefault();
        turnPage(-1);
      } else if (k === "AudioVolumeDown" || k === "VolumeDown" || c === 174) {
        e.preventDefault();
        turnPage(1);
      } else if (k === "ArrowRight" || k === "PageDown") {
        turnPage(1);
      } else if (k === "ArrowLeft" || k === "PageUp") {
        turnPage(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turnPage]);


  const handleTap = (e: React.MouseEvent) => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (popup) {
      setPopup(null);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    // Izquierda: página anterior · Centro: menú · Derecha: página siguiente
    if (relX < 0.33) {
      turnPage(-1);
    } else if (relX > 0.67) {
      turnPage(1);
    } else {
      setMenu((m) => !m);
      setPanel("none");
    }
  };

  const runSearch = (dir: 1 | -1 = 1) => {
    const container = contentRef.current;
    const scroller = scrollRef.current;
    if (!container || !scroller || !query.trim()) return;
    container.querySelectorAll("mark[data-find]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
      parent.normalize();
    });

    const q = query.trim().toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const marks: HTMLElement[] = [];
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const text = node.textContent ?? "";
      let from = 0;
      let idx = text.toLowerCase().indexOf(q, from);
      if (idx === -1) continue;
      const frag = document.createDocumentFragment();
      while (idx !== -1) {
        frag.appendChild(document.createTextNode(text.slice(from, idx)));
        const mark = document.createElement("mark");
        mark.dataset["find"] = "1";
        mark.textContent = text.slice(idx, idx + q.length);
        frag.appendChild(mark);
        marks.push(mark);
        from = idx + q.length;
        idx = text.toLowerCase().indexOf(q, from);
      }
      frag.appendChild(document.createTextNode(text.slice(from)));
      node.parentNode?.replaceChild(frag, node);
    }
    setHits(marks.length);
    const target = dir === 1 ? marks[0] : marks[marks.length - 1];
    target?.scrollIntoView({ block: "center" });
  };

  const fontFamily = useMemo(() => {
    if (settings.fontFamily === "app") return "inherit";
    const f = fonts.find((x) => x.family === settings.fontFamily);
    return f ? `"${f.family}", inherit` : "inherit";
  }, [settings.fontFamily, fonts]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {menu && (
        <div className="border-b border-border bg-background">
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a la biblioteca"
              className="flex size-10 items-center justify-center rounded-lg border border-border active:scale-95"
            >
              <ChevronLeft size={26} strokeWidth={2} />
            </button>
            <span className="flex-1 truncate px-1 text-[13px] text-muted-foreground">
              {book.title}
            </span>
            <button
              type="button"
              onClick={() => setPanel((p) => (p === "search" ? "none" : "search"))}
              aria-label="Buscar en el libro"
              className="flex size-10 items-center justify-center rounded-lg border border-border active:scale-95"
            >
              <Search size={20} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={() => setPanel((p) => (p === "font" ? "none" : "font"))}
              aria-label="Fuente y tamaño"
              className="flex size-10 items-center justify-center rounded-lg border border-border active:scale-95"
            >
              <Type size={20} strokeWidth={1.9} />
            </button>
          </div>

          {panel === "search" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(1);
              }}
              className="flex items-center gap-2 border-t border-border px-3 py-2"
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-transparent py-1 text-[16px] outline-none"
              />
              {query && (
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {hits}
                </span>
              )}
              <button
                type="submit"
                aria-label="Buscar"
                className="flex size-8 shrink-0 items-center justify-center rounded border border-border"
              >
                <Search size={16} strokeWidth={1.9} />
              </button>
            </form>
          )}

          {panel === "font" && (
            <div className="space-y-3 border-t border-border px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] uppercase tracking-widest text-muted-foreground">
                  Tamaño
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Reducir tamaño"
                    onClick={() =>
                      onSettings({ ...settings, fontSize: Math.max(12, settings.fontSize - 1) })
                    }
                    className="flex size-8 items-center justify-center rounded border border-border"
                  >
                    <Minus size={14} strokeWidth={2} />
                  </button>
                  <span className="min-w-6 text-center text-[16px] tabular-nums">
                    {settings.fontSize}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar tamaño"
                    onClick={() =>
                      onSettings({ ...settings, fontSize: Math.min(40, settings.fontSize + 1) })
                    }
                    className="flex size-8 items-center justify-center rounded border border-border"
                  >
                    <Plus size={14} strokeWidth={2} />
                  </button>
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[13px] uppercase tracking-widest text-muted-foreground">
                  Fuente
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSettings({ ...settings, fontFamily: "app" })}
                    className={`rounded border px-3 py-1 text-[14px] ${
                      settings.fontFamily === "app"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Predeterminada
                  </button>
                  {fonts.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onSettings({ ...settings, fontFamily: f.family })}
                      style={{ fontFamily: `"${f.family}"` }}
                      className={`rounded border px-3 py-1 text-[14px] ${
                        settings.fontFamily === f.family
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onClick={handleTap}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          cancelPress();
          swipeStart.current = null;
        }}
        style={{ touchAction: "pan-y" }}
        className="flex-1 overflow-hidden select-none"
      >
        {error && <p className="px-4 py-6 text-[16px] text-muted-foreground">{error}</p>}
        {!chapters && !error && (
          <p className="px-4 py-6 text-[16px] text-muted-foreground">Abriendo libro…</p>
        )}
        {chapters && pageW > 0 && (
          <div
            ref={contentRef}
            className="epub-content"
            style={{
              height: "100%",
              paddingTop: 24,
              paddingBottom: 24,
              paddingLeft: 16,
              boxSizing: "border-box",
              columnWidth: `${Math.max(120, pageW - 32)}px`,
              columnGap: 32,
              columnFill: "auto",
              fontSize: settings.fontSize,
              fontFamily,
              lineHeight: 1.6,
            }}
          >
            {chapters.map((c) => (
              <section key={c.id} dangerouslySetInnerHTML={{ __html: c.html }} />
            ))}
          </div>
        )}

      </div>

      {popup && (
        <div
          className="fixed z-[60] max-w-[70vw] rounded-md border border-border bg-background p-2 shadow-lg"
          style={{
            left: Math.min(popup.x, window.innerWidth - 240),
            top: Math.min(popup.y + 14, window.innerHeight - 160),
          }}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{popup.word}</p>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
                {popup.def}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar definición"
              onClick={() => setPopup(null)}
              className="shrink-0 text-muted-foreground"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
