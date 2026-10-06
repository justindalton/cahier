import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
// Vite `?url` import: emits the wasm as a build asset and resolves to its
// URL at runtime, so `locateFile` can point sql.js at the bundled copy.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import { applySchema } from './schema';
import { seedIfEmpty } from './seed';

const IDB_NAME = 'cahier';
const IDB_VERSION = 1;
const STORE_BLOBS = 'blobs';
const KEY_MAIN = 'main';

/** Open the IndexedDB database, creating the object store if needed. */
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

/** Read a byte blob from the `blobs` store, or null if absent. */
async function idbGetBytes(key: string): Promise<Uint8Array | null> {
  const db = await openIdb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readonly');
      const request = tx.objectStore(STORE_BLOBS).get(key);
      request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB get failed'));
    });
  } finally {
    db.close();
  }
}

/** Write a byte blob to the `blobs` store. */
async function idbPutBytes(key: string, value: Uint8Array): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

let dbPromise: Promise<Database> | null = null;

/**
 * Get the application database, creating (or restoring) it on first call.
 * Idempotent: every call returns the same instance.
 */
export function getDb(): Promise<Database> {
  if (dbPromise === null) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  let db: Database;
  try {
    const saved = await idbGetBytes(KEY_MAIN);
    db = saved !== null ? new SQL.Database(saved) : new SQL.Database();
  } catch (error) {
    // IndexedDB unavailable or unreadable: fall back to a fresh in-memory
    // database so the app still works (data will not survive reload).
    console.warn('[cahier] Failed to load persisted database; starting fresh.', error);
    db = new SQL.Database();
  }

  applySchema(db);
  await seedIfEmpty(db);
  return db;
}

/**
 * Persist the current database to IndexedDB. Call after mutations that
 * should survive a reload.
 */
export async function persist(): Promise<void> {
  const db = await getDb();
  const bytes = db.export();
  await idbPutBytes(KEY_MAIN, bytes);
}
