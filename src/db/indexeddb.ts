// IndexedDB 封装:方案表与历史版本表
import type { Scheme, SchemeVersion } from '../model/types';

const DB_NAME = 'stand-sightline-db';
const DB_VERSION = 1;
const STORE_SCHEMES = 'schemes';
const STORE_VERSIONS = 'versions';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SCHEMES)) {
        db.createObjectStore(STORE_SCHEMES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
        const store = db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
        store.createIndex('schemeId', 'schemeId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const req = fn(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  async listSchemes(): Promise<Scheme[]> {
    const all = await tx<Scheme[]>(STORE_SCHEMES, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async getScheme(id: string): Promise<Scheme | undefined> {
    return tx<Scheme | undefined>(STORE_SCHEMES, 'readonly', (s) => s.get(id));
  },
  async putScheme(scheme: Scheme): Promise<void> {
    await tx(STORE_SCHEMES, 'readwrite', (s) => s.put(scheme));
  },
  async deleteScheme(id: string): Promise<void> {
    await tx(STORE_SCHEMES, 'readwrite', (s) => s.delete(id));
    const versions = await this.listVersions(id);
    for (const v of versions) {
      await tx(STORE_VERSIONS, 'readwrite', (s) => s.delete(v.id));
    }
  },

  async listVersions(schemeId: string): Promise<SchemeVersion[]> {
    const d = await openDb();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE_VERSIONS, 'readonly');
      const idx = t.objectStore(STORE_VERSIONS).index('schemeId');
      const req = idx.getAll(schemeId);
      req.onsuccess = () => resolve((req.result as SchemeVersion[]).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  },
  async addVersion(v: SchemeVersion, maxVersions: number): Promise<void> {
    await tx(STORE_VERSIONS, 'readwrite', (s) => s.put(v));
    const all = await this.listVersions(v.schemeId);
    if (all.length > maxVersions) {
      const d = await openDb();
      const stale = all.slice(maxVersions);
      await new Promise<void>((resolve, reject) => {
        const t = d.transaction(STORE_VERSIONS, 'readwrite');
        const store = t.objectStore(STORE_VERSIONS);
        for (const vv of stale) store.delete(vv.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    }
  },
  async deleteVersion(id: string): Promise<void> {
    await tx(STORE_VERSIONS, 'readwrite', (s) => s.delete(id));
  },
};
