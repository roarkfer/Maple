import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Check,
  Dumbbell,
  Folder,
  Minus,
  Moon,
  Pencil,
  PenLine,
  Plus,
  Repeat,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import Library, { registerFont } from "@/components/Library";
import Reader from "@/components/Reader";
import Writer from "@/components/Writer";
import { getFile } from "@/lib/idb";
import type {
  BookMeta,
  DictMeta,
  FontMeta,
  Notebook,
  ReaderSettings,
} from "@/lib/library-types";

type Item = { id: string; text: string; done: boolean };
type ListKey = "habits" | "tasks" | "exercises" | "read" | "write";

type Habit = { id: string; name: string; marks: Record<string, boolean> };
type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  kg: number;
  done?: boolean[];
};
type FolderT = { id: string; name: string; exercises: Exercise[] };

type Store = {
  labels: Record<ListKey, string>;
  tasks: Item[];
  habits: Habit[];
  folders: FolderT[];
  books: BookMeta[];
  dicts: DictMeta[];
  fonts: FontMeta[];
  notebooks: Notebook[];
  reader: ReaderSettings;
  lastPurge: number;
};

const STORAGE_KEY = "kompakt-lists-v1";

const DEFAULT_STORE: Store = {
  labels: {
    habits: "Hábitos",
    tasks: "Tareas",
    exercises: "Ejercicios",
    read: "Biblioteca",
    write: "Escribir",
  },
  tasks: [],
  habits: [],
  folders: [],
  books: [],
  dicts: [],
  fonts: [],
  notebooks: [],
  reader: { fontSize: 18, fontFamily: "" },
  lastPurge: 0,
};


const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function nextId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Lunes de la semana de `d` (semana lunes→domingo).
function mondayOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Último cruce de las 2:00 am (hora local) antes de `now`.
function lastTwoAm(now: Date) {
  const d = new Date(now);
  d.setHours(2, 0, 0, 0);
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

// Solo se borran las tareas completadas. Hábitos y ejercicios se conservan.
function purge(store: Store, now = new Date()): Store {
  const cutoff = lastTwoAm(now);
  if (store.lastPurge >= cutoff) return store;
  return { ...store, lastPurge: cutoff, tasks: store.tasks.filter((i) => !i.done) };
}

function migrate(raw: unknown): Store {
  const parsed = { ...DEFAULT_STORE, ...(raw as Partial<Store> & { lists?: any }) };
  const legacy = (raw as any)?.lists;
  const tasks: Item[] = parsed.tasks?.length ? parsed.tasks : (legacy?.tasks ?? []);
  const habits: Habit[] = parsed.habits?.length
    ? parsed.habits
    : ((legacy?.habits ?? []) as Item[]).map((i) => ({ id: i.id, name: i.text, marks: {} }));
  return {
    labels: (() => {
      const l = { ...DEFAULT_STORE.labels, ...(parsed.labels ?? {}) };
      if (l.read === "Leer") l.read = "Biblioteca";
      return l;
    })(),
    tasks,
    habits: habits.map((h) => ({ ...h, marks: h.marks ?? {} })),
    folders: parsed.folders ?? [],
    books: parsed.books ?? [],
    dicts: parsed.dicts ?? [],
    fonts: parsed.fonts ?? [],
    notebooks: parsed.notebooks ?? [],
    reader: { ...DEFAULT_STORE.reader, ...(parsed.reader ?? {}) },
    lastPurge: parsed.lastPurge ?? 0,
  };
}


function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label={`Restar ${label}`}
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex size-6 items-center justify-center rounded border border-border text-muted-foreground"
      >
        <Minus size={12} strokeWidth={2} />
      </button>
      <span className="min-w-5 text-center text-[16px] tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Sumar ${label}`}
        onClick={() => onChange(value + step)}
        className="flex size-6 items-center justify-center rounded border border-border text-muted-foreground"
      >
        <Plus size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1) as [T];
  next.splice(to, 0, x);
  return next;
}

function Reorder({
  onMove,
  first,
  last,
}: {
  onMove: (dir: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <span className="flex shrink-0 flex-col">
      <button
        type="button"
        aria-label="Subir"
        disabled={first}
        onClick={() => onMove(-1)}
        className={`text-muted-foreground ${first ? "opacity-25" : ""}`}
      >
        <ChevronUp size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Bajar"
        disabled={last}
        onClick={() => onMove(1)}
        className={`text-muted-foreground ${last ? "opacity-25" : ""}`}
      >
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
    </span>
  );
}

function YearView({ habit }: { habit: Habit }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const start = mondayOf(new Date(year, 0, 1));
  const end = new Date(year, 11, 31);
  const weeks: Date[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  const marked = Object.values(habit.marks).filter(Boolean).length;

  return (
    <div className="mt-2 flex-1">
      <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
        {year} · {marked} días marcados
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((d) => {
                const inYear = d.getFullYear() === year;
                const on = habit.marks[dateKey(d)];
                return (
                  <span
                    key={dateKey(d)}
                    title={dateKey(d)}
                    className={`size-[9px] rounded-[2px] border ${
                      !inYear
                        ? "border-transparent"
                        : on
                          ? "border-foreground bg-foreground"
                          : "border-border"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DARK_KEY = "maple-dark";

export default function App() {
  const [store, setStore] = useState<Store>(DEFAULT_STORE);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<ListKey>("tasks");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openHabit, setOpenHabit] = useState<string | null>(null);
  const [openNotebook, setOpenNotebook] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Registra las fuentes .ttf guardadas.
  const fontsKey = store.fonts.map((f) => f.id).join(",");
  useEffect(() => {
    if (!ready) return;
    store.fonts.forEach((f) => void registerFont(f.family, f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fontsKey]);




  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setStore(purge(migrate(raw ? JSON.parse(raw) : {})));
      setDark(localStorage.getItem(DARK_KEY) === "1");
    } catch {
      setStore(DEFAULT_STORE);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (ready) localStorage.setItem(DARK_KEY, dark ? "1" : "0");
  }, [dark, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, ready]);

  // Revisa cada minuto por si la app queda abierta pasada la 2 am.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => setStore((s) => purge(s)), 60_000);
    return () => clearInterval(id);
  }, [ready]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [ready]);
  const todayKey = dateKey(today);
  const weekDays = useMemo(() => {
    const m = mondayOf(today);
    return Array.from({ length: 7 }, (_, i) => addDays(m, i));
  }, [today]);

  const folder = store.folders.find((f) => f.id === openFolder) ?? null;
  const habit = store.habits.find((h) => h.id === openHabit) ?? null;
  const notebook = store.notebooks.find((n) => n.id === openNotebook) ?? null;
  const book = store.books.find((b) => b.id === openBook) ?? null;
  
  const inFolder = tab === "exercises" && folder !== null;
  const inFolderList = tab === "exercises" && folder === null;
  const inHabit = tab === "habits" && habit !== null;
  const inNotebook = tab === "write" && notebook !== null;


  const toggleTask = useCallback(
    (id: string) =>
      setStore((s) => ({
        ...s,
        tasks: s.tasks.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
      })),
    [],
  );

  const removeTask = useCallback(
    (id: string) => setStore((s) => ({ ...s, tasks: s.tasks.filter((i) => i.id !== id) })),
    [],
  );

  const updateHabit = useCallback(
    (id: string, fn: (h: Habit) => Habit) =>
      setStore((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? fn(h) : h)) })),
    [],
  );

  const updateFolder = useCallback(
    (id: string, fn: (f: FolderT) => FolderT) =>
      setStore((s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? fn(f) : f)) })),
    [],
  );

  const clearAllSets = useCallback(() => {
    setStore((s) => ({
      ...s,
      folders: s.folders.map((f) =>
        openFolder && f.id !== openFolder
          ? f
          : { ...f, exercises: f.exercises.map((x) => ({ ...x, done: [] })) },
      ),
    }));
  }, [openFolder]);



  const add = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    if (inHabit) return;
    if (tab === "write") {
      setStore((s) => ({
        ...s,
        notebooks: [...s.notebooks, { id: nextId(), name: text, text: "", updatedAt: Date.now() }],
      }));
    } else if (tab === "habits") {
      setStore((s) => ({ ...s, habits: [...s.habits, { id: nextId(), name: text, marks: {} }] }));
    } else if (inFolderList) {
      setStore((s) => ({
        ...s,
        folders: [...s.folders, { id: nextId(), name: text, exercises: [] }],
      }));
    } else if (inFolder && folder) {
      updateFolder(folder.id, (f) => ({
        ...f,
        exercises: [
          ...f.exercises,
          { id: nextId(), name: text, sets: 4, reps: 12, kg: 10, done: [] },
        ],
      }));
    } else {
      setStore((s) => ({ ...s, tasks: [...s.tasks, { id: nextId(), text, done: false }] }));
    }
    setDraft("");
    inputRef.current?.focus();
  }, [draft, tab, inFolder, inFolderList, inHabit, folder, updateFolder]);

  const tabs = useMemo(
    () =>
      [
        { key: "habits" as const, Icon: Repeat },
        { key: "tasks" as const, Icon: Check },
        { key: "exercises" as const, Icon: Dumbbell },
        { key: "read" as const, Icon: BookOpen },
        { key: "write" as const, Icon: PenLine },
      ],
    [],
  );


  if (inNotebook && notebook) {
    return (
      <Writer
        notebook={notebook}
        settings={store.reader}
        onBack={() => setOpenNotebook(null)}
        onChange={(text) =>
          setStore((s) => ({
            ...s,
            notebooks: s.notebooks.map((n) =>
              n.id === notebook.id ? { ...n, text, updatedAt: Date.now() } : n,
            ),
          }))
        }
      />
    );
  }

  if (openBook && book) {
    return (
      <Reader
        book={book}
        fonts={store.fonts}
        settings={store.reader}
        onSettings={(reader) => setStore((s) => ({ ...s, reader }))}
        onProgress={(progress) =>
          setStore((s) => ({
            ...s,
            books: s.books.map((b) => (b.id === book.id ? { ...b, progress } : b)),
          }))
        }
        onBack={() => setOpenBook(null)}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-3 pb-6 pt-3 text-foreground">
      <nav className="grid grid-cols-5 items-stretch gap-1">
        {tabs.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setOpenFolder(null);
              setOpenHabit(null);
              setOpenNotebook(null);
            }}
            aria-pressed={tab === key}
            className={`flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[12px] tracking-wide ${
              tab === key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span className="w-full truncate text-center">{store.labels[key]}</span>
          </button>
        ))}
      </nav>


      <button
        type="button"
        onClick={() => setEditing((e) => !e)}
        aria-pressed={editing}
        className={`mt-2 flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-[13px] tracking-wide ${
          editing
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground"
        }`}
      >
        {editing ? <X size={16} strokeWidth={1.75} /> : <Pencil size={16} strokeWidth={1.75} />}
        <span className="truncate">{editing ? "Listo" : "Editar"}</span>
      </button>

      {editing && (
        <section className="mt-3 space-y-2 rounded-md border border-border p-3">
          <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
            Nombres de pestañas
          </p>
          {tabs.map(({ key, Icon }) => (
            <label key={key} className="flex items-center gap-2">
              <Icon size={16} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                value={store.labels[key]}
                onChange={(e) =>
                  setStore((s) => ({ ...s, labels: { ...s.labels, [key]: e.target.value } }))
                }
                className="w-full bg-transparent py-1 text-[16px] outline-none"
              />
            </label>
          ))}

          <div className="!mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              aria-pressed={dark}
              className="flex w-full items-center justify-between py-1 text-[16px]"
            >
              <span className="flex items-center gap-2">
                {dark ? <Moon size={16} strokeWidth={1.75} /> : <Sun size={16} strokeWidth={1.75} />}
                Modo oscuro
              </span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border ${
                  dark ? "border-foreground bg-foreground" : "border-border"
                }`}
              >
                <span
                  className={`size-3.5 rounded-full transition-transform ${
                    dark ? "translate-x-4 bg-background" : "translate-x-1 bg-foreground"
                  }`}
                />
              </span>
            </button>
          </div>

          {tab === "exercises" && (
            <div className="!mt-4 border-t border-border pt-3">
              <button
                type="button"
                onClick={clearAllSets}
                className="flex w-full items-center gap-2 py-1 text-[16px]"
              >
                <Square size={16} strokeWidth={1.75} />
                Desmarcar todos los sets
              </button>
            </div>
          )}
        </section>
      )}

      <div className="mt-4 flex items-center gap-2">
        {(inFolder || inHabit || inNotebook) && (
          <button
            type="button"
            onClick={() => {
              setOpenFolder(null);
              setOpenHabit(null);
              setOpenNotebook(null);
            }}
            aria-label="Volver"
            className="-ml-1 flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground active:scale-95"
          >
            <ChevronLeft size={26} strokeWidth={2} />
          </button>
        )}
        <h1 className="text-[14px] tracking-[0.15em] text-muted-foreground">
          {inFolder && folder
            ? folder.name
            : inHabit && habit
              ? habit.name
              : inNotebook && notebook
                ? notebook.name
                : store.labels[tab]}
        </h1>
      </div>


      {tab === "read" ? (
        <Library
          books={store.books}
          fonts={store.fonts}
          editing={editing}
          onBooks={(books) => setStore((s) => ({ ...s, books }))}
          onFonts={(fonts) => setStore((s) => ({ ...s, fonts }))}
          onOpen={(id) => setOpenBook(id)}
        />
      ) : tab === "write" ? (
        (
          <ul className="mt-2 flex-1 divide-y divide-border">
            {store.notebooks.map((n, ni) => (
              <li key={n.id} className="flex items-center gap-3 py-3">
                <PenLine size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                {editing ? (
                  <input
                    value={n.name}
                    onChange={(e) =>
                      setStore((s) => ({
                        ...s,
                        notebooks: s.notebooks.map((x) =>
                          x.id === n.id ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                    className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenNotebook(n.id)}
                    className="flex-1 text-left text-[17px] leading-snug"
                  >
                    {n.name}
                  </button>
                )}
                {editing && (
                  <Reorder
                    first={ni === 0}
                    last={ni === store.notebooks.length - 1}
                    onMove={(dir) =>
                      setStore((s) => ({ ...s, notebooks: move(s.notebooks, ni, ni + dir) }))
                    }
                  />
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      setStore((s) => ({
                        ...s,
                        notebooks: s.notebooks.filter((x) => x.id !== n.id),
                      }))
                    }
                    aria-label="Eliminar libreta"
                    className="text-muted-foreground"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
            {ready && store.notebooks.length === 0 && (
              <li className="py-6 text-[16px] text-muted-foreground">
                Sin libretas. Agrega una abajo.
              </li>
            )}
          </ul>
        )
      ) : inHabit && habit ? (
        <YearView habit={habit} />
      ) : tab === "habits" ? (
        <ul className="mt-2 flex-1 divide-y divide-border">
          {store.habits.map((h, hi) => (
            <li key={h.id} className="space-y-2 py-3">
              <div className="flex items-center gap-3">
                {editing ? (
                  <input
                    value={h.name}
                    onChange={(e) => updateHabit(h.id, (x) => ({ ...x, name: e.target.value }))}
                    className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenHabit(h.id)}
                    className="flex-1 text-left text-[17px] leading-snug"
                  >
                    {h.name}
                  </button>
                )}
                {editing && (
                  <Reorder
                    first={hi === 0}
                    last={hi === store.habits.length - 1}
                    onMove={(dir) =>
                      setStore((s) => ({ ...s, habits: move(s.habits, hi, hi + dir) }))
                    }
                  />
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      setStore((s) => ({ ...s, habits: s.habits.filter((x) => x.id !== h.id) }))
                    }
                    aria-label="Eliminar hábito"
                    className="text-muted-foreground"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((d, i) => {
                  const k = dateKey(d);
                  const isToday = k === todayKey;
                  const on = !!h.marks[k];
                  return (
                    <div key={k} className="flex flex-col items-center gap-1">
                      <span
                        className={`text-[12px] uppercase tracking-widest ${
                          isToday ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {DAY_LABELS[i]}
                      </span>
                      <button
                        type="button"
                        disabled={!isToday}
                        aria-label={`${h.name} ${k}`}
                        onClick={() =>
                          updateHabit(h.id, (x) => ({
                            ...x,
                            marks: { ...x.marks, [k]: !x.marks[k] },
                          }))
                        }
                        className={`flex size-7 items-center justify-center rounded border ${
                          on ? "border-foreground bg-foreground text-background" : "border-border"
                        } ${isToday ? "" : "opacity-40"}`}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
          {ready && store.habits.length === 0 && (
            <li className="py-6 text-[16px] text-muted-foreground">Sin hábitos.</li>
          )}
        </ul>
      ) : inFolderList ? (
        <ul className="mt-2 flex-1 divide-y divide-border">
          {store.folders.map((f, fi) => (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <Folder size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
              {editing ? (
                <input
                  value={f.name}
                  onChange={(e) => updateFolder(f.id, (x) => ({ ...x, name: e.target.value }))}
                  className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenFolder(f.id)}
                  className="flex-1 text-left text-[17px] leading-snug"
                >
                  {f.name}
                </button>
              )}
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {f.exercises.length}
              </span>
              {editing && (
                <Reorder
                  first={fi === 0}
                  last={fi === store.folders.length - 1}
                  onMove={(dir) =>
                    setStore((s) => ({ ...s, folders: move(s.folders, fi, fi + dir) }))
                  }
                />
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() =>
                    setStore((s) => ({ ...s, folders: s.folders.filter((x) => x.id !== f.id) }))
                  }
                  aria-label="Eliminar carpeta"
                  className="text-muted-foreground"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
          {ready && store.folders.length === 0 && (
            <li className="py-6 text-[16px] text-muted-foreground">Sin carpetas. Agrega una abajo.</li>
          )}
        </ul>
      ) : inFolder && folder ? (
        <div className="mt-2 flex-1">
          <div className="grid grid-cols-[4.5rem_1fr_4.5rem_4.5rem] gap-1 border-b border-border pb-1 text-[12px] uppercase tracking-widest text-muted-foreground">
            <span className="text-center">Sets</span>
            <span>Ejercicio</span>
            <span className="text-center">Reps</span>
            <span className="text-center">Kg</span>
          </div>
          <ul className="divide-y divide-border">
            {folder.exercises.map((ex, xi) => (
              <li key={ex.id} className="py-3">
                <div className="grid grid-cols-[4.5rem_1fr_4.5rem_4.5rem] items-center gap-1">
                  <Stepper
                    label="sets"
                    value={ex.sets}
                    onChange={(v) =>
                      updateFolder(folder.id, (f) => ({
                        ...f,
                        exercises: f.exercises.map((x) => (x.id === ex.id ? { ...x, sets: v } : x)),
                      }))
                    }
                  />
                  <input
                    value={ex.name}
                    onChange={(e) =>
                      updateFolder(folder.id, (f) => ({
                        ...f,
                        exercises: f.exercises.map((x) =>
                          x.id === ex.id ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                    className="w-full bg-transparent text-[17px] outline-none"
                  />
                  <Stepper
                    label="reps"
                    value={ex.reps}
                    onChange={(v) =>
                      updateFolder(folder.id, (f) => ({
                        ...f,
                        exercises: f.exercises.map((x) => (x.id === ex.id ? { ...x, reps: v } : x)),
                      }))
                    }
                  />
                  <Stepper
                    label="kilos"
                    value={ex.kg}
                    onChange={(v) =>
                      updateFolder(folder.id, (f) => ({
                        ...f,
                        exercises: f.exercises.map((x) => (x.id === ex.id ? { ...x, kg: v } : x)),
                      }))
                    }
                  />
                </div>
                {ex.sets > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {Array.from({ length: ex.sets }).map((_, si) => {
                      const on = !!ex.done?.[si];
                      return (
                        <button
                          key={si}
                          type="button"
                          aria-label={`Set ${si + 1} de ${ex.name}`}
                          aria-pressed={on}
                          onClick={() =>
                            updateFolder(folder.id, (f) => ({
                              ...f,
                              exercises: f.exercises.map((x) => {
                                if (x.id !== ex.id) return x;
                                const done = Array.from(
                                  { length: Math.max(x.sets, si + 1) },
                                  (_, i) => !!x.done?.[i],
                                );
                                done[si] = !done[si];
                                return { ...x, done };
                              }),
                            }))
                          }
                          className={`flex size-7 items-center justify-center rounded border ${
                            on
                              ? "border-foreground bg-foreground text-background"
                              : "border-border"
                          }`}
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {editing && (
                  <span className="mt-2 flex items-center gap-2">
                    <Reorder
                      first={xi === 0}
                      last={xi === folder.exercises.length - 1}
                      onMove={(dir) =>
                        updateFolder(folder.id, (f) => ({
                          ...f,
                          exercises: move(f.exercises, xi, xi + dir),
                        }))
                      }
                    />
                  </span>
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      updateFolder(folder.id, (f) => ({
                        ...f,
                        exercises: f.exercises.filter((x) => x.id !== ex.id),
                      }))
                    }
                    aria-label="Eliminar ejercicio"
                    className="mt-2 flex items-center gap-1 text-[13px] uppercase tracking-widest text-muted-foreground"
                  >
                    <Trash2 size={14} strokeWidth={1.75} /> Eliminar
                  </button>
                )}
              </li>
            ))}
            {ready && folder.exercises.length === 0 && (
              <li className="py-6 text-[16px] text-muted-foreground">Sin ejercicios.</li>
            )}
          </ul>
        </div>
      ) : (
        <ul className="mt-2 flex-1 divide-y divide-border">
          {store.tasks.map((item, ti) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => toggleTask(item.id)}
                aria-label={item.done ? "Marcar como pendiente" : "Marcar como completa"}
                className={`flex size-6 shrink-0 items-center justify-center rounded border ${
                  item.done ? "border-foreground bg-foreground text-background" : "border-border"
                }`}
              >
                {item.done && <Check size={14} strokeWidth={3} />}
              </button>
              {editing ? (
                <input
                  value={item.text}
                  onChange={(e) =>
                    setStore((s) => ({
                      ...s,
                      tasks: s.tasks.map((x) =>
                        x.id === item.id ? { ...x, text: e.target.value } : x,
                      ),
                    }))
                  }
                  className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                />
              ) : (
                <span
                  onClick={() => toggleTask(item.id)}
                  className={`flex-1 text-[17px] leading-snug ${
                    item.done ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {item.text}
                </span>
              )}

              {editing && (
                <Reorder
                  first={ti === 0}
                  last={ti === store.tasks.length - 1}
                  onMove={(dir) =>
                    setStore((s) => ({ ...s, tasks: move(s.tasks, ti, ti + dir) }))
                  }
                />
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() => removeTask(item.id)}
                  aria-label="Eliminar"
                  className="text-muted-foreground"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
          {ready && store.tasks.length === 0 && (
            <li className="py-6 text-[16px] text-muted-foreground">Lista vacía.</li>
          )}
        </ul>
      )}

      {!inHabit && !inNotebook && tab !== "read" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-3 flex items-center gap-2 border-t border-border pt-3"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              inFolderList
                ? "Nueva carpeta…"
                : inFolder
                  ? "Nuevo ejercicio…"
                  : tab === "habits"
                    ? "Nuevo hábito…"
                    : "Agregar…"
            }
            className="w-full bg-transparent py-2 text-[17px] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={inFolderList ? "Agregar carpeta" : "Agregar"}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-foreground"
          >
            {inFolderList ? (
              <Folder size={18} strokeWidth={1.75} />
            ) : (
              <Plus size={18} strokeWidth={1.75} />
            )}
          </button>
        </form>
      )}

      <p className="mt-3 text-[12px] uppercase tracking-widest text-muted-foreground">
        Las tareas completadas se borran a las 2:00 am
      </p>
    </main>
  );
}
