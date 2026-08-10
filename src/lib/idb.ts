// Almacén simple de archivos binarios (epub, diccionarios, fuentes, portadas)
// en IndexedDB, porque localStorage no soporta archivos grandes.

const DB_NAME = "maple-files";
const STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putFile(key: string, data: Blob | ArrayBuffer) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(key: string): Promise<ArrayBuffer | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = async () => {
      const v = req.result;
      if (!v) return resolve(null);
      if (v instanceof Blob) return resolve(await v.arrayBuffer());
      resolve(v as ArrayBuffer);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function delFile(key: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
