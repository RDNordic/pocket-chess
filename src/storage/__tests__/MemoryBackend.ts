import { LocalRecordError, STORES } from '../storageTypes';
import type { LocalBackend, Tables } from '../storageTypes';

/** Test-only transactional model. Native IndexedDB is checked in Chromium too. */
export class MemoryBackend implements LocalBackend {
  tables = Object.fromEntries(STORES.map(store => [store, new Map()])) as Tables;
  failNextWrite = false;
  gate: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  transact<T>(write: boolean, action: (tables: Tables) => T): Promise<T> {
    const gate = write ? this.gate : null;
    if (write) this.gate = null;
    const operation = this.queue.then(async () => {
      if (gate) await gate;
      const working = structuredClone(this.tables);
      const result = action(working);
      if (write) {
        if (this.failNextWrite) { this.failNextWrite = false; throw new LocalRecordError('write-failed', 'Synthetic failed write'); }
        this.tables = working;
      }
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  close() {}
}
