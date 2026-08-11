export const X3_PROTOCOL = 1;
export const X3_REVISION_KEY = "maple-x3-revision";
export const X3_HOST_KEY = "maple-x3-base-url";

const DEFAULT_BASE_URLS = [
  "http://192.168.4.1/api/v1",
  "http://maple-x3.local/api/v1",
];

type Task = { id: string; text: string; done: boolean; rid?: string };
type Habit = { id: string; name: string; marks: Record<string, boolean> };
type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  kg: number;
  done?: boolean[];
};
type ExerciseFolder = { id: string; name: string; exercises: Exercise[] };
type ProjectStep = { id: string; text: string; done: boolean };
type ProjectFolder = { id: string; name: string; collapsed: boolean; steps: ProjectStep[] };
type Project = { id: string; name: string; folders: ProjectFolder[] };
type Notebook = {
  id: string;
  name: string;
  text: string;
  updatedAt: number;
  tags?: string[];
};

export type MapleStoreForX3 = {
  labels: Record<string, string>;
  tasks: Task[];
  habits: Habit[];
  folders: ExerciseFolder[];
  projects: Project[];
  notebooks: Notebook[];
};

type X3Change = {
  seq?: number;
  kind?: string;
  id?: string;
  value?: boolean | number;
  date?: string;
  setIndex?: number;
  projectId?: string;
  folderId?: string;
};

type X3ChangesResponse = {
  protocol?: number;
  device?: string;
  baseRevision?: number;
  lastSeq?: number;
  changes?: X3Change[];
};

type X3Status = {
  ok?: boolean;
  device?: string;
  protocol?: number;
  revision?: number;
  pendingChanges?: number;
  lastSeq?: number;
};

export type X3SyncStatus =
  | "Buscando Maple X3…"
  | "Recibiendo cambios…"
  | "Enviando Maple…"
  | "X3 actualizado ✓";

export type X3SyncResult<T extends MapleStoreForX3> = {
  store: T;
  revision: number;
  baseUrl: string;
};

function cloneStore<T>(store: T): T {
  if (typeof structuredClone === "function") return structuredClone(store);
  return JSON.parse(JSON.stringify(store)) as T;
}

function normaliseBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function candidateBaseUrls(): string[] {
  const configured = localStorage.getItem(X3_HOST_KEY);
  return Array.from(
    new Set(
      [configured, ...DEFAULT_BASE_URLS]
        .filter((x): x is string => !!x)
        .map(normaliseBaseUrl),
    ),
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3500,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const localRequestInit = {
      ...init,
      mode: "cors",
      cache: "no-store",
      signal: controller.signal,
      targetAddressSpace: "local",
    } as RequestInit & { targetAddressSpace: "local" };

    return await fetch(url, localRequestInit);
  } finally {
    window.clearTimeout(timer);
  }
}

async function findX3(): Promise<{ baseUrl: string; status: X3Status }> {
  let lastError: unknown = null;
  for (const baseUrl of candidateBaseUrls()) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = (await response.json()) as X3Status;
      if (status.protocol !== X3_PROTOCOL) {
        throw new Error(`Protocolo X3 no compatible: ${status.protocol ?? "?"}`);
      }
      localStorage.setItem(X3_HOST_KEY, baseUrl);
      return { baseUrl, status };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Maple X3 no encontrado");
}

export function buildX3State<T extends MapleStoreForX3>(
  store: T,
  revision: number,
  dark = false,
) {
  return {
    protocol: X3_PROTOCOL,
    protocolRevision: "1.2",
    mapleVersion: "7.5",
    revision,
    generatedAt: new Date().toISOString(),
    devicePolicy: {
      structureAuthority: "maple",
      x3CanCreate: false,
      x3CanRename: false,
      x3CanDelete: false,
      x3CanReorder: false,
      x3CanToggle: true,
      x3CanChangeExerciseKg: true,
      x3CanChangeExerciseReps: false,
      x3CanChangeExerciseSetCount: false,
    },
    labels: { ...store.labels },
    tasks: store.tasks.map((task) => ({ ...task })),
    habits: store.habits.map((habit) => ({
      ...habit,
      marks: { ...(habit.marks ?? {}) },
    })),
    exerciseFolders: store.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      exercises: folder.exercises.map((exercise) => ({
        ...exercise,
        done: Array.from({ length: Math.max(0, exercise.sets) }, (_, index) =>
          Boolean(exercise.done?.[index]),
        ),
      })),
    })),
    projects: store.projects.map((project) => ({
      ...project,
      folders: project.folders.map((folder) => ({
        ...folder,
        steps: folder.steps.map((step) => ({ ...step })),
      })),
    })),
    // En v1.2 el texto viaja dentro del state para mantener el firmware simple.
    // El X3 solo lo muestra; nunca lo modifica.
    notebooks: store.notebooks.map((notebook) => ({
      id: notebook.id,
      name: notebook.name,
      text: notebook.text ?? "",
      updatedAt: notebook.updatedAt ?? 0,
      tags: notebook.tags ?? [],
    })),
    ui: {
      dark,
      defaultTab: "today",
      todayShowsExercises: false,
    },
  };
}

export function applyX3Changes<T extends MapleStoreForX3>(
  originalStore: T,
  payload: X3ChangesResponse,
): T {
  const store = cloneStore(originalStore);
  const changes = Array.isArray(payload.changes) ? payload.changes : [];

  for (const change of changes) {
    const id = typeof change.id === "string" ? change.id : "";
    switch (change.kind) {
      case "task.done": {
        if (typeof change.value !== "boolean") break;
        store.tasks = store.tasks.map((task) =>
          task.id === id ? { ...task, done: change.value as boolean } : task,
        );
        break;
      }

      case "habit.mark": {
        if (typeof change.value !== "boolean" || typeof change.date !== "string") break;
        store.habits = store.habits.map((habit) =>
          habit.id === id
            ? {
                ...habit,
                marks: { ...habit.marks, [change.date as string]: change.value as boolean },
              }
            : habit,
        );
        break;
      }

      case "exercise.set": {
        if (
          typeof change.value !== "boolean" ||
          !Number.isInteger(change.setIndex) ||
          (change.setIndex as number) < 0
        ) {
          break;
        }
        const setIndex = change.setIndex as number;
        store.folders = store.folders.map((folder) => ({
          ...folder,
          exercises: folder.exercises.map((exercise) => {
            if (exercise.id !== id || setIndex >= exercise.sets) return exercise;
            const done = Array.from({ length: exercise.sets }, (_, index) =>
              Boolean(exercise.done?.[index]),
            );
            done[setIndex] = change.value as boolean;
            return { ...exercise, done };
          }),
        }));
        break;
      }

      case "exercise.kg": {
        if (typeof change.value !== "number" || !Number.isFinite(change.value) || change.value < 0) {
          break;
        }
        store.folders = store.folders.map((folder) => ({
          ...folder,
          exercises: folder.exercises.map((exercise) =>
            exercise.id === id ? { ...exercise, kg: change.value as number } : exercise,
          ),
        }));
        break;
      }

      case "project.step": {
        if (typeof change.value !== "boolean") break;
        store.projects = store.projects.map((project) => {
          if (change.projectId && project.id !== change.projectId) return project;
          return {
            ...project,
            folders: project.folders.map((folder) => {
              if (change.folderId && folder.id !== change.folderId) return folder;
              return {
                ...folder,
                steps: folder.steps.map((step) =>
                  step.id === id ? { ...step, done: change.value as boolean } : step,
                ),
              };
            }),
          };
        });
        break;
      }
    }
  }

  return store;
}

export async function syncX3<T extends MapleStoreForX3>(
  currentStore: T,
  options: {
    dark?: boolean;
    onStatus?: (status: X3SyncStatus) => void;
  } = {},
): Promise<X3SyncResult<T>> {
  const onStatus = options.onStatus ?? (() => {});
  onStatus("Buscando Maple X3…");

  const { baseUrl, status } = await findX3();

  onStatus("Recibiendo cambios…");
  const changesResponse = await fetchWithTimeout(`${baseUrl}/changes`);
  if (!changesResponse.ok) throw new Error(`No se pudieron recibir cambios (${changesResponse.status})`);
  const changes = (await changesResponse.json()) as X3ChangesResponse;
  if (changes.protocol !== undefined && changes.protocol !== X3_PROTOCOL) {
    throw new Error("El protocolo del X3 no coincide con Maple");
  }

  const mergedStore = applyX3Changes(currentStore, changes);
  const localRevision = Number(localStorage.getItem(X3_REVISION_KEY) ?? "0") || 0;
  const revision = Math.max(localRevision, Number(status.revision ?? 0)) + 1;
  const state = buildX3State(mergedStore, revision, Boolean(options.dark));
  const ackThrough = Number(changes.lastSeq ?? status.lastSeq ?? 0) || 0;

  onStatus("Enviando Maple…");
  const stateResponse = await fetchWithTimeout(
    `${baseUrl}/state`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Maple-Ack-Through": String(ackThrough),
      },
      body: JSON.stringify(state),
    },
    10000,
  );

  if (!stateResponse.ok) {
    throw new Error(`El X3 rechazó el estado (${stateResponse.status})`);
  }

  localStorage.setItem(X3_REVISION_KEY, String(revision));
  onStatus("X3 actualizado ✓");
  return { store: mergedStore, revision, baseUrl };
}
