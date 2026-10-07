import { LocalRecordError, STORES } from './storageTypes';
import type { LocalBackend, Tables } from './storageTypes';

/** Native, device-only IndexedDB; no singleton connection or implicit fallback. */
export class IndexedDbBackend implements LocalBackend {
  private connection: Promise<IDBDatabase> | null = null;
  private closed = false;
  constructor(private readonly name = 'pocket-chess-local', private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.closed || !this.factory) return Promise.reject(new LocalRecordError('unavailable', 'Local storage is unavailable'));
    if (this.connection) return this.connection;
    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const fail = (code: 'unavailable' | 'blocked' | 'unsupported', message: string) => {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(new LocalRecordError(code, message));
      };
      const timer = setTimeout(() => fail('blocked', 'Local storage open timed out'), 10_000);
      let request: IDBOpenDBRequest;
      try { request = this.factory!.open(this.name, 1); }
      catch { fail('unavailable', 'Local storage cannot be opened'); return; }
      request.onupgradeneeded = () => {
        for (const store of STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      };
      request.onblocked = () => fail('blocked', 'Another tab is blocking local storage');
      request.onerror = () => fail(request.error?.name === 'VersionError' ? 'unsupported' : 'unavailable', 'Local storage cannot be opened');
      request.onsuccess = () => {
        const db = request.result;
        if (settled || this.closed) { db.close(); fail('unavailable', 'Local storage was closed'); return; }
        if (STORES.some(store => !db.objectStoreNames.contains(store))) {
          db.close(); fail('unsupported', 'Local storage has an incompatible layout'); return;
        }
        settled = true; clearTimeout(timer);
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    }).catch(error => { this.connection = null; throw error; });
    return this.connection;
  }

  async transact<T>(write: boolean, action: (tables: Tables) => T): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try { transaction = db.transaction([...STORES], write ? 'readwrite' : 'readonly'); }
      catch { reject(new LocalRecordError('unavailable', 'Local storage connection is unavailable')); return; }
      let result: T;
      let actionError: unknown;
      const tables = Object.fromEntries(STORES.map(s => [s, new Map()])) as Tables;
      let remaining = STORES.length;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(actionError ?? new LocalRecordError(write ? 'write-failed' : 'unavailable', 'Local storage transaction failed; changes were not saved'));
      // Let request errors abort the whole transaction; never report partial success.
      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        const keys = store.getAllKeys();
        const values = store.getAll();
        values.onsuccess = () => {
          try {
            if (keys.result.some(key => typeof key !== 'string')) throw new LocalRecordError('corrupt', 'Unexpected local record key');
            keys.result.forEach((key, i) => tables[storeName].set(key as string, values.result[i]));
            if (--remaining !== 0) return;
            const before = Object.fromEntries(STORES.map(s => [s, new Map(tables[s])])) as Tables;
            result = action(tables);
            if (result instanceof Promise) throw new LocalRecordError('invalid', 'Storage callbacks must be synchronous');
            if (write) for (const name of STORES) {
              const target = transaction.objectStore(name);
              for (const key of before[name].keys()) if (!tables[name].has(key)) target.delete(key);
              for (const [key, value] of tables[name]) if (value !== before[name].get(key)) target.put(value, key);
            }
          } catch (error) { actionError = error; transaction.abort(); }
        };
      }
    });
  }

  close(): void {
    this.closed = true;
    void this.connection?.then(db => db.close(), () => undefined);
    this.connection = null;
  }
}
