/**
 * IndexedDB persistence for the city, from inside the worker. Falls back to
 * "no persistence" silently when storage is unavailable (private windows,
 * blocked site data): the city still lives, it just won't remember.
 */
import type { Snapshot } from "../sim/persist";

const DB_NAME = "halcyon-exchange";
const STORE = "city";
const KEY = "current";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const db = () => (dbPromise ??= open());

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void, pick: (req: IDBRequest | void) => T, fallback: T): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve) => {
        if (!d) return resolve(fallback);
        try {
          const tx = d.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(pick(req));
          tx.onerror = () => resolve(fallback);
          tx.onabort = () => resolve(fallback);
        } catch {
          resolve(fallback);
        }
      }),
  );
}

export function loadSnapshot(): Promise<Snapshot | null> {
  return run("readonly", (s) => s.get(KEY), (req) => ((req as IDBRequest | undefined)?.result as Snapshot) ?? null, null);
}

export function saveSnapshot(snap: Snapshot): Promise<boolean> {
  return run("readwrite", (s) => s.put(snap, KEY), () => true, false);
}

export function clearSnapshot(): Promise<boolean> {
  return run("readwrite", (s) => s.delete(KEY), () => true, false);
}
