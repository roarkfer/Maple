import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronUp,
  BookMarked,
  ChevronRight,
  Sparkle,
  Tag,
  ChevronDown,
  Check,
  Dumbbell,
  Folder,
  Hammer,
  ListTree,
  Minus,
  Moon,
  Pencil,
  PenLine,
  Notebook as NotebookIcon,
  Plus,
  Repeat,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import Writer from "@/components/Writer";
import type { Notebook, ReaderSettings } from "@/lib/library-types";

type Item = { id: string; text: string; done: boolean; rid?: string };
type ListKey = "habits" | "tasks" | "today" | "exercises" | "projects" | "write";

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

type Step = { id: string; text: string; done: boolean };
type ProjectFolder = { id: string; name: string; collapsed: boolean; steps: Step[] };
type Project = { id: string; name: string; folders: ProjectFolder[] };

type Freq = "daily" | "weekly" | "monthly" | "yearly";
type Rule = {
  id: string;
  text: string;
  freq: Freq;
  weekdays: number[]; // 0 = lunes … 6 = domingo
  monthdays: number[]; // 1..31
  yeardays: string[]; // "MM-DD"
  lastApplied: string;
};

type Store = {
  labels: Record<ListKey, string>;
  tasks: Item[];
  habits: Habit[];
  folders: FolderT[];
  projects: Project[];
  notebooks: Notebook[];
  recurring: Rule[];
  reader: ReaderSettings;
  lastPurge: number;
};

const STORAGE_KEY = "kompakt-lists-v1";

const DEFAULT_STORE: Store = {
  labels: {
    habits: "Hábitos",
    tasks: "Tareas",
    today: "Hoy",
    exercises: "Ejercicios",
    projects: "Proyectos",
    write: "Escribir",
  },
  tasks: [],
  habits: [],
  folders: [],
  projects: [],
  notebooks: [],
  recurring: [],
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

const FREQ_LABELS: Record<Freq, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
};

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function mmdd(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ruleSlot(rule: Rule, now: Date): string | null {
  const day = dateKey(now);
  switch (rule.freq) {
    case "daily":
      return day;
    case "weekly":
      return rule.weekdays.includes((now.getDay() + 6) % 7) ? day : null;
    case "monthly":
      return rule.monthdays.includes(now.getDate()) ? day : null;
    case "yearly":
      return rule.yeardays.includes(mmdd(now)) ? day : null;
  }
}

// Reglas recurrentes: agrega la tarea si falta, la desmarca si ya estaba completada.
function applyRecurring(store: Store, now = new Date()): Store {
  let tasks = store.tasks;
  let changed = false;
  const recurring = store.recurring.map((rule) => {
    const slot = ruleSlot(rule, now);
    if (!slot || rule.lastApplied === slot) return rule;
    changed = true;
    const existing = tasks.find((t) => t.rid === rule.id);
    if (!existing) {
      tasks = [...tasks, { id: nextId(), text: rule.text, done: false, rid: rule.id }];
    } else if (existing.done) {
      tasks = tasks.map((t) => (t.rid === rule.id ? { ...t, done: false } : t));
    }
    return { ...rule, lastApplied: slot };
  });
  return changed ? { ...store, tasks, recurring } : store;
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
      const l = { ...DEFAULT_STORE.labels, ...(parsed.labels ?? {}) } as Record<ListKey, string>;
      const old = (parsed.labels as any)?.projects;
      if (!old || old === "Leer" || old === "Biblioteca") l.projects = "Proyectos";
      return l;
    })(),
    tasks,
    habits: habits.map((h) => ({ ...h, marks: h.marks ?? {} })),
    folders: parsed.folders ?? [],
    projects: (parsed.projects ?? []).map((p) => ({
      ...p,
      folders: (p.folders ?? []).map((f) => ({ ...f, collapsed: !!f.collapsed, steps: f.steps ?? [] })),
    })),
    notebooks: (parsed.notebooks ?? []).map((n) => ({ ...n, tags: n.tags ?? [] })),
    recurring: (parsed.recurring ?? []).map((r) => ({
      ...r,
      weekdays: r.weekdays ?? [],
      monthdays: r.monthdays ?? [],
      yeardays: r.yeardays ?? [],
      lastApplied: r.lastApplied ?? "",
    })),

    reader: { ...DEFAULT_STORE.reader, ...(parsed.reader ?? {}) },
    lastPurge: parsed.lastPurge ?? 0,

  };
}


function DigitWheel({ digit, onDigit }: { digit: number; onDigit: (d: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ITEM = 32;

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = digit * ITEM;
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      onScroll={() => {
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => {
          const el = ref.current;
          if (!el) return;
          const i = Math.max(0, Math.min(9, Math.round(el.scrollTop / ITEM)));
          el.scrollTo({ top: i * ITEM, behavior: "smooth" });
          onDigit(i);
        }, 120);
      }}
      className="h-24 w-9 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded border border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: ITEM }} />
      {Array.from({ length: 10 }).map((_, d) => (
        <div
          key={d}
          style={{ height: ITEM }}
          className={`flex snap-center items-center justify-center text-[17px] tabular-nums ${
            d === digit ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {d}
        </div>
      ))}
      <div style={{ height: ITEM }} />
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const v = Math.max(0, Math.min(99, Math.round(value)));
  const tens = Math.floor(v / 10);
  const units = v % 10;

  const start = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 800);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const set = (t: number, u: number) => onChange(Math.max(min, t * 10 + u));

  return (
    <div className="relative flex items-center justify-center">
      <span
        role="button"
        tabIndex={0}
        aria-label={`Modificar ${label}`}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className={`min-w-8 select-none rounded px-1 text-center text-[17px] tabular-nums ${
          open ? "bg-foreground text-background" : ""
        }`}
      >
        {v}
      </span>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 gap-1 rounded-md border border-border bg-background p-1 shadow-lg">
            <DigitWheel digit={tens} onDigit={(d) => set(d, units)} />
            <DigitWheel digit={units} onDigit={(d) => set(tens, d)} />
          </div>
        </>
      )}
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

function projectPct(p: Project) {
  const steps = p.folders.flatMap((f) => f.steps);
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

const EXPORT_PARTS = [
  { key: "habits" as const, label: "Hábitos" },
  { key: "tasks" as const, label: "Tareas" },
  { key: "exercises" as const, label: "Ejercicios" },
  { key: "projects" as const, label: "Proyectos" },
  { key: "write" as const, label: "Escribir" },
];
type ExportKey = (typeof EXPORT_PARTS)[number]["key"];

const DARK_KEY = "maple-dark";


// Fusiona un paquete recibido con el estado local: solo agrega o marca,
// nunca reemplaza ni borra información existente.
function mergeStore(s: Store, data: Partial<Store>): Store {
  const next: Store = { ...s };

  if (Array.isArray(data.tasks)) {
    const tasks = [...s.tasks];
    for (const t of data.tasks) {
      const i = tasks.findIndex((x) => x.text.trim() === t.text.trim());
      if (i === -1) tasks.push({ ...t, id: nextId() });
      else if (t.done) tasks[i] = { ...tasks[i]!, done: true };
    }
    next.tasks = tasks;
  }

  if (Array.isArray(data.habits)) {
    const habits = [...s.habits];
    for (const h of data.habits) {
      const i = habits.findIndex((x) => x.name.trim() === h.name.trim());
      if (i === -1) habits.push({ ...h, id: nextId() });
      else habits[i] = { ...habits[i]!, marks: { ...h.marks, ...habits[i]!.marks } };
    }
    next.habits = habits;
  }

  if (Array.isArray(data.folders)) {
    const folders = [...s.folders];
    for (const f of data.folders) {
      const i = folders.findIndex((x) => x.name.trim() === f.name.trim());
      if (i === -1) {
        folders.push({ ...f, id: nextId(), exercises: f.exercises.map((e) => ({ ...e, id: nextId() })) });
      } else {
        const cur = folders[i]!;
        const exercises = [...cur.exercises];
        for (const e of f.exercises) {
          if (!exercises.some((x) => x.name.trim() === e.name.trim())) {
            exercises.push({ ...e, id: nextId() });
          }
        }
        folders[i] = { ...cur, exercises };
      }
    }
    next.folders = folders;
  }

  if (Array.isArray(data.projects)) {
    const projects = [...s.projects];
    for (const p of data.projects) {
      const i = projects.findIndex((x) => x.name.trim() === p.name.trim());
      if (i === -1) {
        projects.push({
          ...p,
          id: nextId(),
          folders: p.folders.map((f) => ({
            ...f,
            id: nextId(),
            steps: f.steps.map((st) => ({ ...st, id: nextId() })),
          })),
        });
        continue;
      }
      const cur = projects[i]!;
      const pfolders = [...cur.folders];
      for (const f of p.folders) {
        const j = pfolders.findIndex((x) => x.name.trim() === f.name.trim());
        if (j === -1) {
          pfolders.push({ ...f, id: nextId(), steps: f.steps.map((st) => ({ ...st, id: nextId() })) });
          continue;
        }
        const curF = pfolders[j]!;
        const steps = [...curF.steps];
        for (const st of f.steps) {
          const k = steps.findIndex((x) => x.text.trim() === st.text.trim());
          if (k === -1) steps.push({ ...st, id: nextId() });
          else if (st.done) steps[k] = { ...steps[k]!, done: true };
        }
        pfolders[j] = { ...curF, steps };
      }
      projects[i] = { ...cur, folders: pfolders };
    }
    next.projects = projects;
  }

  if (Array.isArray(data.notebooks)) {
    const notebooks = [...s.notebooks];
    for (const n of data.notebooks) {
      const i = notebooks.findIndex((x) => x.name.trim() === n.name.trim());
      if (i === -1) notebooks.push({ ...n, id: nextId() });
      else if ((n.updatedAt ?? 0) > (notebooks[i]!.updatedAt ?? 0)) {
        notebooks[i] = { ...notebooks[i]!, text: n.text, updatedAt: n.updatedAt };
      }
    }
    next.notebooks = notebooks;
  }

  if (Array.isArray(data.recurring)) {
    const recurring = [...s.recurring];
    for (const r of data.recurring) {
      if (!recurring.some((x) => x.text.trim() === r.text.trim())) {
        recurring.push({ ...r, id: nextId() });
      }
    }
    next.recurring = recurring;
  }

  return next;
}




export default function App() {
  const [store, setStore] = useState<Store>(DEFAULT_STORE);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<ListKey>("today");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openHabit, setOpenHabit] = useState<string | null>(null);
  const [openNotebook, setOpenNotebook] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [openGrimorio, setOpenGrimorio] = useState(false);
  const [openTags, setOpenTags] = useState<string[]>([]);
  const [recurOpen, setRecurOpen] = useState(false);
  const [recurFreq, setRecurFreq] = useState<Freq | null>(null);
  const [recurWeek, setRecurWeek] = useState<number[]>([]);
  const [recurMonth, setRecurMonth] = useState<number[]>([]);
  const [recurYear, setRecurYear] = useState<string[]>([]);
  const [yearMonth, setYearMonth] = useState(new Date().getMonth());
  const inputRef = useRef<HTMLInputElement>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [transferMsg, setTransferMsg] = useState("");
  const [exportSel, setExportSel] = useState<Record<ExportKey, boolean>>({
    habits: true,
    tasks: true,
    exercises: true,
    projects: true,
    write: true,
  });
  const longPressRef = useRef<number | undefined>(undefined);
  const suppressTapRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);

  const sendPackage = async (sel: Record<ExportKey, boolean> = exportSel) => {
    const payload: Record<string, unknown> = { app: "maple", version: 1, exportedAt: Date.now() };
    if (sel.habits) payload['habits'] = store.habits;
    if (sel.tasks) {
      payload['tasks'] = store.tasks;
      payload['recurring'] = store.recurring;
    }
    if (sel.exercises) payload['folders'] = store.folders;
    if (sel.projects) payload['projects'] = store.projects;
    if (sel.write) payload['notebooks'] = store.notebooks;




    const name = `maple-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(payload, null, 2)], name, {
      type: "application/json",
    });

    // Presenta siempre la hoja de compartir nativa del dispositivo (WhatsApp,
    // correo, guardar en archivos, etc.) cuando esté disponible; solo si
    // falla o no existe, recurre a la descarga directa.
    if (typeof navigator.share === "function") {
      try {
        const shareData: ShareData = { title: name, text: "Paquete Maple" };
        if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
        await navigator.share(shareData);
        setTransferMsg("Paquete enviado.");
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
        // si compartir falló, cae abajo a la descarga directa
      }
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setTransferMsg(`Se guardó ${name}.`);
  };

  const importPackage = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<Store>;
      setStore((s) => mergeStore(s, data));
      setTransferMsg("Paquete sincronizado.");
      setTransferOpen(false);
    } catch {
      setTransferMsg("No se pudo leer el paquete.");
    }
  };


  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setStore(applyRecurring(purge(migrate(raw ? JSON.parse(raw) : {}))));
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

  // Revisa cada minuto por si la app queda abierta pasada la 2 am o cambia la hora.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => setStore((s) => applyRecurring(purge(s))), 60_000);
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
  const project = store.projects.find((p) => p.id === openProject) ?? null;

  const inFolder = tab === "exercises" && folder !== null;
  const inFolderList = tab === "exercises" && folder === null;
  const inHabit = tab === "habits" && habit !== null;
  const inNotebook = tab === "write" && notebook !== null;
  const inGrimorio = tab === "write" && openGrimorio && !inNotebook;
  const inProject = tab === "projects" && project !== null;
  const inProjectList = tab === "projects" && project === null;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    store.notebooks.forEach((n) => (n.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [store.notebooks]);

  const toggleTask = useCallback(
    (id: string) =>
      setStore((s) => ({
        ...s,
        tasks: s.tasks.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
      })),
    [],
  );

  const removeTask = useCallback(
    (id: string) =>
      setStore((s) => {
        const item = s.tasks.find((i) => i.id === id);
        return {
          ...s,
          tasks: s.tasks.filter((i) => i.id !== id),
          recurring: item?.rid ? s.recurring.filter((r) => r.id !== item.rid) : s.recurring,
        };
      }),
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

  const updateProject = useCallback(
    (id: string, fn: (p: Project) => Project) =>
      setStore((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) })),
    [],
  );

  const updateProjectFolder = useCallback(
    (pid: string, fid: string, fn: (f: ProjectFolder) => ProjectFolder) =>
      setStore((s) => ({
        ...s,
        projects: s.projects.map((p) =>
          p.id === pid
            ? { ...p, folders: p.folders.map((f) => (f.id === fid ? fn(f) : f)) }
            : p,
        ),
      })),
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
        notebooks: [
          ...s.notebooks,
          { id: nextId(), name: text, text: "", updatedAt: Date.now(), tags: [] },
        ],
      }));
    } else if (tab === "habits") {
      setStore((s) => ({ ...s, habits: [...s.habits, { id: nextId(), name: text, marks: {} }] }));
    } else if (inProjectList) {
      setStore((s) => ({
        ...s,
        projects: [...s.projects, { id: nextId(), name: text, folders: [] }],
      }));
    } else if (inProject && project) {
      updateProject(project.id, (p) => ({
        ...p,
        folders: [...p.folders, { id: nextId(), name: text, collapsed: false, steps: [] }],
      }));
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
    } else if (recurOpen && recurFreq) {
      const rule: Rule = {
        id: nextId(),
        text,
        freq: recurFreq,
        weekdays: recurWeek,
        monthdays: recurMonth,
        yeardays: recurYear,
        lastApplied: "",
      };
      setStore((s) => applyRecurring({ ...s, recurring: [...s.recurring, rule] }));
      setRecurOpen(false);
      setRecurFreq(null);
      setRecurWeek([]);
      setRecurMonth([]);
      setRecurYear([]);
    } else {
      setStore((s) => ({ ...s, tasks: [...s.tasks, { id: nextId(), text, done: false }] }));
    }
    setDraft("");
    inputRef.current?.focus();
  }, [
    draft,
    tab,
    inFolder,
    inFolderList,
    inHabit,
    inProject,
    inProjectList,
    project,
    folder,
    updateFolder,
    updateProject,
    recurOpen,
    recurFreq,
    recurWeek,
    recurMonth,
    recurYear,
  ]);

  const tabs = useMemo(
    () =>
      [
        { key: "habits" as const, Icon: Repeat },
        { key: "tasks" as const, Icon: Check },
        { key: "today" as const, Icon: Sparkle },
        { key: "exercises" as const, Icon: Dumbbell },
        { key: "projects" as const, Icon: ListTree },
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
        onTagsChange={(tags) =>
          setStore((s) => ({
            ...s,
            notebooks: s.notebooks.map((n) => (n.id === notebook.id ? { ...n, tags } : n)),
          }))
        }
      />
    );
  }

  const goTab = (key: ListKey) => {
    setTab(key);
    setOpenFolder(null);
    setOpenHabit(null);
    setOpenNotebook(null);
    setOpenProject(null);
    setOpenGrimorio(false);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-3 pb-6 pt-3 text-foreground">

      {/* Estrella del norte — pestaña Hoy, centrada arriba de las demás */}
      <div className="flex items-center justify-center gap-2">

        {transferOpen ? (
          <button
            type="button"
            onClick={() => {
              setExportOpen((v) => !v);
            }}
            className="rounded-md border border-border px-3 py-2 text-[13px]"
          >
            Exportar
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (suppressTapRef.current) {
              suppressTapRef.current = false;
              return;
            }
            goTab("today");
          }}
          onPointerDown={() => {
            longPressRef.current = window.setTimeout(() => {
              suppressTapRef.current = true;
              setTransferOpen(true);
            }, 800);
          }}
          onPointerUp={() => window.clearTimeout(longPressRef.current)}
          onPointerLeave={() => window.clearTimeout(longPressRef.current)}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={tab === "today"}
          aria-label="Hoy"
          className={`flex items-center justify-center rounded-full border size-14 ${
            tab === "today"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground"
          }`}
        >
          <Sparkle size={26} strokeWidth={1.75} />
        </button>
        {transferOpen ? (
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded-md border border-border px-3 py-2 text-[13px]"
          >
            Importar
          </button>
        ) : null}
      </div>





      <input
        ref={importRef}
        type="file"
        accept="application/json,.maple,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importPackage(f);
        }}
      />

      {transferOpen && exportOpen ? (
        <div className="mt-3 rounded-md border border-border p-3">
          {EXPORT_PARTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setExportSel((s) => ({ ...s, [key]: !s[key] }))
              }
              className="flex w-full items-center gap-3 py-2 text-left text-[14px]"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-foreground ${
                  exportSel[key] ? "bg-foreground text-background" : ""
                }`}
              >
                {exportSel[key] ? <Check size={14} strokeWidth={2.4} /> : null}
              </span>
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void sendPackage()}
            className="mt-2 min-h-11 w-full rounded-md border border-foreground bg-foreground text-[14px] text-background"
          >
            Enviar
          </button>
          {transferMsg ? (
            <p className="pt-2 text-center text-[12px] text-muted-foreground">{transferMsg}</p>
          ) : null}
        </div>
      ) : null}

      {transferOpen && !exportOpen ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setTransferOpen(false)}
            className="text-[12px] text-muted-foreground underline"
          >
            cerrar
          </button>
        </div>
      ) : null}


      <nav className="mt-3 grid grid-cols-5 items-stretch gap-1">
        {tabs
          .filter(({ key }) => key !== "today")
          .map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => goTab(key)}
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
        {(inFolder || inHabit || inNotebook || inProject || inGrimorio) && (
          <button
            type="button"
            onClick={() => {
              setOpenFolder(null);
              setOpenHabit(null);
              setOpenNotebook(null);
              setOpenProject(null);
              setOpenGrimorio(false);
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
              : inProject && project
                ? project.name
                : inNotebook && notebook
                  ? notebook.name
                  : inGrimorio
                    ? "Grimorio"
                    : tab === "today"
                      ? "Hoy"
                      : store.labels[tab]}
        </h1>

      </div>


      {tab === "today" ? (
        <div className="mt-2 flex-1 space-y-5">
          <section>
            <p className="text-[13px] tracking-widest text-muted-foreground">
              {store.labels.tasks}
            </p>
            <ul className="divide-y divide-border">
              {store.tasks
                .filter((t) => !t.done)
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleTask(t.id)}
                      aria-label={`Completar ${t.text}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-foreground"
                    />
                    <span className="flex-1 text-[17px] leading-snug">{t.text}</span>
                  </li>
                ))}
              {store.tasks.every((t) => t.done) && (
                <li className="py-2 text-[15px] text-muted-foreground">Nada pendiente.</li>
              )}
            </ul>
          </section>

          <section>
            <p className="text-[13px] tracking-widest text-muted-foreground">
              {store.labels.habits}
            </p>
            <ul className="divide-y divide-border">
              {store.habits.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateHabit(h.id, (x) => ({
                        ...x,
                        marks: { ...x.marks, [todayKey]: !x.marks[todayKey] },
                      }))
                    }
                    aria-label={`Marcar ${h.name}`}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-foreground ${
                      h.marks[todayKey] ? "bg-foreground text-background" : ""
                    }`}
                  >
                    {h.marks[todayKey] && <Check size={14} strokeWidth={2.4} />}
                  </button>
                  <span className="flex-1 text-[17px] leading-snug">{h.name}</span>
                </li>
              ))}
              {store.habits.length === 0 && (
                <li className="py-2 text-[15px] text-muted-foreground">Sin hábitos.</li>
              )}
            </ul>
          </section>




          <section>
            <p className="text-[13px] tracking-widest text-muted-foreground">
              {store.labels.projects}
            </p>
            <ul className="divide-y divide-border">
              {store.projects.map((p) => {
                const next = p.folders.flatMap((f) => f.steps).find((s) => !s.done);
                if (!next) return null;
                return (
                  <li key={p.id} className="flex items-center gap-2 py-2 text-[16px]">
                    <Hammer
                      size={16}
                      strokeWidth={1.75}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 truncate">{next.text}</span>
                    <span className="max-w-24 truncate text-[14px] text-muted-foreground">
                      {p.name}
                    </span>
                  </li>
                );
              })}
              {store.projects.every((p) => !p.folders.flatMap((f) => f.steps).some((s) => !s.done)) && (
                <li className="py-2 text-[15px] text-muted-foreground">Sin próximos pasos.</li>
              )}
            </ul>
          </section>
        </div>
      ) : inProjectList ? (

        <ul className="mt-2 flex-1 divide-y divide-border">
          {store.projects.map((p, pi) => {
            const pct = projectPct(p);
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Hammer size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                {editing ? (
                  <input
                    value={p.name}
                    onChange={(e) => updateProject(p.id, (x) => ({ ...x, name: e.target.value }))}
                    className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenProject(p.id)}
                    className="flex-1 text-left text-[17px] leading-snug"
                  >
                    {p.name}
                  </button>
                )}
                <span className="w-24 shrink-0">
                  <span className="block text-right text-[13px] tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full border border-border">
                    <span
                      className="block h-full bg-foreground"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>
                {editing && (
                  <Reorder
                    first={pi === 0}
                    last={pi === store.projects.length - 1}
                    onMove={(dir) =>
                      setStore((s) => ({ ...s, projects: move(s.projects, pi, pi + dir) }))
                    }
                  />
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      setStore((s) => ({ ...s, projects: s.projects.filter((x) => x.id !== p.id) }))
                    }
                    aria-label="Eliminar proyecto"
                    className="text-muted-foreground"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
              </li>
            );
          })}
          {ready && store.projects.length === 0 && (
            <li className="py-6 text-[16px] text-muted-foreground">
              Sin proyectos. Agrega uno abajo.
            </li>
          )}
        </ul>
      ) : inProject && project ? (
        <div className="mt-2 flex-1 divide-y divide-border">
          {project.folders.map((f, fi) => (
            <div key={f.id} className="py-3">
              <div className="flex items-center gap-2">
                {editing ? (
                  <input
                    value={f.name}
                    onChange={(e) =>
                      updateProjectFolder(project.id, f.id, (x) => ({ ...x, name: e.target.value }))
                    }
                    className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      updateProjectFolder(project.id, f.id, (x) => ({
                        ...x,
                        collapsed: !x.collapsed,
                      }))
                    }
                    className="flex flex-1 items-center gap-2 text-left text-[17px] leading-snug"
                  >
                    {f.collapsed ? (
                      <ChevronDown size={16} strokeWidth={1.9} className="text-muted-foreground" />
                    ) : (
                      <ChevronUp size={16} strokeWidth={1.9} className="text-muted-foreground" />
                    )}
                    <Folder size={16} strokeWidth={1.75} className="text-muted-foreground" />
                    {f.name}
                  </button>
                )}
                {editing && (
                  <Reorder
                    first={fi === 0}
                    last={fi === project.folders.length - 1}
                    onMove={(dir) =>
                      updateProject(project.id, (p) => ({
                        ...p,
                        folders: move(p.folders, fi, fi + dir),
                      }))
                    }
                  />
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() =>
                      updateProject(project.id, (p) => ({
                        ...p,
                        folders: p.folders.filter((x) => x.id !== f.id),
                      }))
                    }
                    aria-label="Eliminar carpeta"
                    className="text-muted-foreground"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                )}
                {!f.collapsed && (
                  <button
                    type="button"
                    aria-label={`Agregar paso a ${f.name}`}
                    onClick={() =>
                      updateProjectFolder(project.id, f.id, (x) => ({
                        ...x,
                        steps: [
                          ...x.steps,
                          { id: nextId(), text: `Paso ${x.steps.length + 1}`, done: false },
                        ],
                      }))
                    }
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-foreground active:scale-95"
                  >
                    <Plus size={16} strokeWidth={1.9} />
                  </button>
                )}
              </div>

              {!f.collapsed && (
                <ul className="mt-2 space-y-2 pl-6">
                  {f.steps.map((st, si) => (
                    <li key={st.id} className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label={st.done ? "Marcar como pendiente" : "Marcar como terminado"}
                        onClick={() =>
                          updateProjectFolder(project.id, f.id, (x) => ({
                            ...x,
                            steps: x.steps.map((y) =>
                              y.id === st.id ? { ...y, done: !y.done } : y,
                            ),
                          }))
                        }
                        className={`flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-foreground ${
                          st.done ? "bg-foreground text-background" : ""
                        }`}
                      >
                        {st.done && <Check size={14} strokeWidth={3} />}
                      </button>
                      {editing ? (
                        <input
                          value={st.text}
                          onChange={(e) =>
                            updateProjectFolder(project.id, f.id, (x) => ({
                              ...x,
                              steps: x.steps.map((y) =>
                                y.id === st.id ? { ...y, text: e.target.value } : y,
                              ),
                            }))
                          }
                          className="flex-1 bg-transparent py-1 text-[17px] outline-none"
                        />
                      ) : (
                        <span
                          className={`flex-1 text-[17px] leading-snug ${
                            st.done ? "text-muted-foreground line-through" : ""
                          }`}
                        >
                          {st.text}
                        </span>
                      )}
                      {editing && (
                        <Reorder
                          first={si === 0}
                          last={si === f.steps.length - 1}
                          onMove={(dir) =>
                            updateProjectFolder(project.id, f.id, (x) => ({
                              ...x,
                              steps: move(x.steps, si, si + dir),
                            }))
                          }
                        />
                      )}
                      {editing && (
                        <button
                          type="button"
                          onClick={() =>
                            updateProjectFolder(project.id, f.id, (x) => ({
                              ...x,
                              steps: x.steps.filter((y) => y.id !== st.id),
                            }))
                          }
                          aria-label="Eliminar paso"
                          className="text-muted-foreground"
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      )}
                    </li>
                  ))}
                  {f.steps.length === 0 && (
                    <li className="text-[15px] text-muted-foreground">Sin pasos. Usa el +.</li>
                  )}
                </ul>
              )}
            </div>
          ))}
          {ready && project.folders.length === 0 && (
            <p className="py-6 text-[16px] text-muted-foreground">Sin carpetas. Agrega una abajo.</p>
          )}
        </div>
      ) : inGrimorio ? (
        <ul className="mt-2 flex-1 divide-y divide-border">
          {allTags.map((t) => {
            const open = openTags.includes(t);
            const books = store.notebooks.filter((n) => (n.tags ?? []).includes(t));
            return (
              <li key={t} className="py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenTags((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 py-1 text-left text-[17px]"
                >
                  {open ? (
                    <ChevronDown size={16} strokeWidth={1.9} />
                  ) : (
                    <ChevronRight size={16} strokeWidth={1.9} />
                  )}
                  <Tag size={15} strokeWidth={1.8} className="text-muted-foreground" />
                  <span className="flex-1 truncate">{t}</span>
                  <span className="text-[13px] text-muted-foreground">{books.length}</span>
                </button>
                {open && (
                  <ul className="ml-6 border-l border-border pl-3">
                    {books.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setOpenNotebook(n.id)}
                          className="flex w-full items-center gap-2 py-2 text-left text-[16px]"
                        >
                          <NotebookIcon
                            size={16}
                            strokeWidth={1.75}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="truncate">{n.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {ready && allTags.length === 0 && (
            <li className="py-6 text-[16px] text-muted-foreground">
              Aún no hay etiquetas. Agrégalas dentro de una libreta.
            </li>
          )}
        </ul>
      ) : tab === "write" ? (
        (
          <ul className="mt-2 flex-1 divide-y divide-border">
            <li className="flex items-center gap-3 py-3">
              <BookMarked size={20} strokeWidth={1.75} className="shrink-0" />
              <button
                type="button"
                onClick={() => setOpenGrimorio(true)}
                className="flex-1 text-left text-[17px] leading-snug tracking-wide"
              >
                Grimorio
              </button>
              <span className="text-[13px] text-muted-foreground">{allTags.length}</span>
            </li>
            {store.notebooks.map((n, ni) => (

              <li key={n.id} className="flex items-center gap-3 py-3">
                <NotebookIcon size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
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
                        className={`flex size-6 items-center justify-center rounded-sm border-2 border-foreground ${
                          on ? "bg-foreground text-background" : ""
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
                          className={`flex size-6 items-center justify-center rounded-sm border-2 border-foreground ${
                            on ? "bg-foreground text-background" : ""
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
                className={`flex size-6 shrink-0 items-center justify-center rounded-sm border-2 border-foreground ${
                  item.done ? "bg-foreground text-background" : ""
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

      {!inHabit && !inNotebook && !inGrimorio && tab !== "today" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-3 border-t border-border pt-3"
        >
          {tab === "tasks" && recurOpen && (
            <div className="mb-2 space-y-2 rounded-md border border-border p-2">
              <div className="flex flex-wrap gap-1">
                {(Object.keys(FREQ_LABELS) as Freq[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecurFreq(f)}
                    aria-pressed={recurFreq === f}
                    className={`rounded-md border px-2 py-1 text-[13px] ${
                      recurFreq === f
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {FREQ_LABELS[f]}
                  </button>
                ))}
              </div>

              {recurFreq === "weekly" && (
                <div className="flex gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={`${d}${i}`}
                      type="button"
                      onClick={() =>
                        setRecurWeek((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                        )
                      }
                      aria-pressed={recurWeek.includes(i)}
                      className={`flex-1 rounded-sm border py-1 text-[12px] ${
                        recurWeek.includes(i)
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {recurFreq === "monthly" && (
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setRecurMonth((prev) =>
                          prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                        )
                      }
                      aria-pressed={recurMonth.includes(d)}
                      className={`rounded-sm border py-1 text-[12px] ${
                        recurMonth.includes(d)
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {recurFreq === "yearly" && (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-1">
                    {MONTHS.map((m, mi) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setYearMonth(mi)}
                        aria-pressed={yearMonth === mi}
                        className={`rounded-md border px-2 py-1 text-[12px] ${
                          yearMonth === mi
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                      const key = `${String(yearMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      const on = recurYear.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setRecurYear((prev) =>
                              prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
                            )
                          }
                          aria-pressed={on}
                          className={`rounded-sm border py-1 text-[12px] ${
                            on
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                inProjectList
                  ? "Nuevo proyecto…"
                  : inProject
                    ? "Nueva carpeta…"
                    : inFolderList
                      ? "Nueva carpeta…"
                      : inFolder
                        ? "Nuevo ejercicio…"
                        : tab === "habits"
                          ? "Nuevo hábito…"
                          : recurOpen
                            ? "Tarea recurrente…"
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
            {tab === "tasks" && (
              <button
                type="button"
                onClick={() => setRecurOpen((v) => !v)}
                aria-pressed={recurOpen}
                aria-label="Recurrente"
                className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${
                  recurOpen
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Repeat size={17} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </form>
      )}

    </main>
  );
}
