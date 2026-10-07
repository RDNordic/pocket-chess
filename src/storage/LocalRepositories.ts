import type { PreparedPuzzle } from '../puzzles/validatePuzzle';
import { recoverCheckpoint, recoverScenarioCheckpoint } from './checkpointRecovery';
import type { ScenarioCheckpointContent } from './checkpointRecovery';
import { DEFAULT_METADATA, DEFAULT_SETTINGS, DEFAULT_WARDROBE, LocalRecordError, STORES } from './storageTypes';
import type { LocalBackend, Tables, StoreName, StorageResult, RecordIssue, SaveToken, ResetAction,
  GameRecord, LedgerRecord, ActivityCompletion, ActivityLifecycleRecord, CheckpointRecord, SettingsRecord, WardrobeRecord, MetadataRecord } from './storageTypes';
import { isCompleted, validateKey, validateRecord } from './validateRecords';
import type { RecordByStore } from './validateRecords';

const copy = <T>(value: T): T => structuredClone(value);
function fail(code: 'stale' | 'conflict' | 'invalid' | 'content-changed' | 'corrupt', message: string): never {
  throw new LocalRecordError(code, message);
}
function read<S extends StoreName>(tables: Tables, store: S, key: string): RecordByStore[S] | null {
  if (!tables[store].has(key)) return null;
  const value = validateRecord(store, tables[store].get(key)); validateKey(store, key, value); return value;
}
function all<S extends StoreName>(tables: Tables, store: S): RecordByStore[S][] {
  return [...tables[store].keys()].map(key => read(tables, store, key)!);
}
function meta(tables: Tables): MetadataRecord {
  const record = read(tables, 'metadata', 'local') ?? copy(DEFAULT_METADATA);
  if ('recordType' in record) fail('corrupt', 'Invalid storage metadata');
  return record;
}
function lifecycle(tables: Tables, key: string): ActivityLifecycleRecord | null {
  const record = read(tables, 'metadata', key);
  if (record && !('recordType' in record)) fail('corrupt', 'Invalid activity lifecycle metadata');
  return record;
}
function saveLifecycle(tables: Tables, key: string, record: ActivityLifecycleRecord): void {
  const valid = validateRecord('metadata', record); validateKey('metadata', key, valid);
  tables.metadata.set(key, valid);
}
function revision(previous: { revision: number } | null, next: { revision: number }): 'saved' | 'duplicate' {
  if (!previous) return 'saved';
  if (next.revision < previous.revision) fail('stale', 'An older revision cannot overwrite a newer record');
  if (next.revision === previous.revision) {
    if (JSON.stringify(previous) !== JSON.stringify(next)) fail('conflict', 'Same revision has different contents');
    return 'duplicate';
  }
  return 'saved';
}
async function fingerprint(record: GameRecord): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface LocalSnapshot {
  records: { [S in StoreName]: RecordByStore[S][] };
  issues: RecordIssue[];
}

/** No UI state or live chess state. Caller continues its live session on failure;
 * only ok:true means a transaction committed. Retrying the same intent is safe. */
export class LocalRepositories {
  private localGeneration = 0;
  private readonly tokens = new WeakSet<SaveToken>();
  constructor(private readonly backend: LocalBackend) {}

  private async result<T>(action: () => Promise<T>): Promise<StorageResult<T>> {
    try { return { ok: true, value: await action() }; }
    catch (error) {
      if (error instanceof LocalRecordError) return { ok: false, code: error.code, message: error.message };
      return { ok: false, code: 'write-failed', message: 'Progress is not saved on this device. Retry saving.' };
    }
  }
  async beginSession(): Promise<StorageResult<SaveToken>> {
    const localGeneration = this.localGeneration;
    return this.result(() => this.backend.transact(false, tables => {
      if (localGeneration !== this.localGeneration) fail('stale', 'Session was invalidated by reset');
      const token = Object.freeze({ generation: meta(tables).generation, localGeneration });
      this.tokens.add(token); return token;
    }));
  }
  private guard(tables: Tables, token: SaveToken): void {
    if (!token || !this.tokens.has(token) || token.localGeneration !== this.localGeneration ||
      token.generation !== meta(tables).generation) fail('stale', 'Session was invalidated; start a new session before saving');
  }
  private write<T>(token: SaveToken, action: (tables: Tables) => T): Promise<StorageResult<T>> {
    return this.result(() => this.backend.transact(true, tables => { this.guard(tables, token); return action(tables); }));
  }

  load(): Promise<StorageResult<LocalSnapshot>> {
    return this.result(() => this.backend.transact(false, tables => {
      const records = Object.fromEntries(STORES.map(store => [store, []])) as unknown as LocalSnapshot['records'];
      const issues: RecordIssue[] = [];
      for (const store of STORES) for (const key of tables[store].keys()) {
        try { (records[store] as unknown[]).push(read(tables, store, key)!); }
        catch (error) {
          if (!(error instanceof LocalRecordError)) throw error;
          issues.push({ store, key, code: error.code === 'unsupported' ? 'unsupported' : 'corrupt' });
        }
      }
      if (!tables.settings.has('local')) records.settings.push(copy(DEFAULT_SETTINGS));
      if (!tables.wardrobe.has('local')) records.wardrobe.push(copy(DEFAULT_WARDROBE));
      return { records, issues };
    }));
  }

  /** Explicit per-record migration; bad/future records are isolated and retained.
   * No migration side effects on ordinary load. Entire write rolls back on error. */
  migrate(token: SaveToken): Promise<StorageResult<RecordIssue[]>> {
    return this.write(token, tables => {
      const issues: RecordIssue[] = [];
      for (const store of STORES) for (const [key, raw] of tables[store]) {
        try {
          const valid = read(tables, store, key)!;
          if ((raw as { schemaVersion?: unknown })?.schemaVersion === 1) tables[store].set(key, valid);
        } catch (error) {
          if (!(error instanceof LocalRecordError)) throw error;
          issues.push({ store, key, code: error.code === 'unsupported' ? 'unsupported' : 'corrupt' });
        }
      }
      return issues;
    });
  }

  saveSettings(token: SaveToken, input: SettingsRecord): Promise<StorageResult<'saved' | 'duplicate'>> {
    return this.result(async () => {
      const record = validateRecord('settings', input);
      const result = await this.write(token, tables => {
        const status = revision(read(tables, 'settings', 'local'), record);
        tables.settings.set('local', record); return status;
      });
      if (!result.ok) throw new LocalRecordError(result.code, result.message); return result.value;
    });
  }
  saveWardrobe(token: SaveToken, input: WardrobeRecord): Promise<StorageResult<'saved' | 'duplicate'>> {
    return this.result(async () => {
      const record = validateRecord('wardrobe', input);
      return this.unwrap(await this.write(token, tables => {
        const previous = read(tables, 'wardrobe', 'local') ?? copy(DEFAULT_WARDROBE);
        if (!previous.owned.every(item => record.owned.includes(item)) || record.owned.some(item => !previous.owned.includes(item))) {
          fail('invalid', 'Inventory changes require the award transaction');
        }
        const status = revision(read(tables, 'wardrobe', 'local'), record);
        tables.wardrobe.set('local', record); return status;
      }));
    });
  }
  private unwrap<T>(result: StorageResult<T>): T {
    if (!result.ok) throw new LocalRecordError(result.code, result.message); return result.value;
  }

  private grant(tables: Tables, evidence: string): string[] {
    const awards = all(tables, 'awards'); // Never overwrite unknown/corrupt award data.
    const wardrobe = read(tables, 'wardrobe', 'local') ?? copy(DEFAULT_WARDROBE);
    if (awards.some(a => a.kind === 'grant' && !wardrobe.owned.includes('milestone:' + a.id))) {
      fail('corrupt', 'Award and inventory records disagree');
    }
    const entry = validateRecord('awards', { schemaVersion: 2, kind: 'evidence', id: evidence });
    if (!awards.some(a => a.id === evidence)) { tables.awards.set(evidence, entry); awards.push(entry); }
    const eligible = [
      ...(awards.some(a => a.id.startsWith('game:')) ? ['first-game'] : []),
      ...(awards.filter(a => a.kind === 'evidence' && a.id.startsWith('puzzle:')).length >= 5 ? ['five-puzzles'] : []),
      ...(awards.some(a => a.id.startsWith('scenario:')) ? ['first-scenario'] : []),
    ];
    const granted = eligible.filter(id => !awards.some(a => a.kind === 'grant' && a.id === id));
    for (const id of granted) {
      tables.awards.set(id, validateRecord('awards', { schemaVersion: 2, kind: 'grant', id }));
      if (!wardrobe.owned.includes('milestone:' + id)) wardrobe.owned.push('milestone:' + id);
    }
    if (granted.length) { wardrobe.revision++; tables.wardrobe.set('local', validateRecord('wardrobe', wardrobe)); }
    return granted;
  }

  completeActivity(token: SaveToken, input: ActivityCompletion): Promise<StorageResult<{ status: 'saved' | 'duplicate'; grants: string[] }>> {
    return this.result(async () => {
      const record = validateRecord('progress', input);
      if (!record.sessionId) fail('invalid', 'Completion requires its activity session ID');
      return this.unwrap(await this.write(token, tables => {
        const key = `${record.kind}:${record.id}`;
        const status = revision(read(tables, 'progress', key), record);
        // A retry is a read-only acknowledgement, never a checkpoint cleanup.
        if (status === 'duplicate') return { status, grants: [] };
        const checkpoint = read(tables, 'checkpoints', record.kind);
        const matches = checkpoint && 'kind' in checkpoint && checkpoint.contentId === record.id &&
          checkpoint.contentVersion === record.contentVersion && checkpoint.sessionId === record.sessionId;
        if (checkpoint && 'kind' in checkpoint && checkpoint.sessionId === record.sessionId && !matches) {
          fail('conflict', 'Completion identity disagrees with its session checkpoint');
        }
        if (matches && record.revision <= checkpoint.revision) fail('stale', 'Completion must advance the checkpoint revision');
        const receiptKey = `activity-complete:${record.kind}:${record.sessionId}`;
        const closed = lifecycle(tables, receiptKey);
        if (closed && (closed.contentId !== record.id || closed.contentVersion !== record.contentVersion)) {
          fail('conflict', 'Completed session identity cannot change');
        }
        if (closed && record.revision <= closed.revision) fail('stale', 'Completion revision is stale');
        // Permanent evidence survives a learning reset; stable ID, not version/hints.
        const grants = this.grant(tables, key);
        tables.progress.set(key, record);
        const receipt: ActivityLifecycleRecord = { schemaVersion: 2, recordType: 'activity-lifecycle',
          kind: record.kind, contentId: record.id, contentVersion: record.contentVersion,
          sessionId: record.sessionId!, revision: record.revision, state: 'complete' };
        saveLifecycle(tables, receiptKey, receipt);
        const slotKey = `activity-slot:${record.kind}`;
        const slot = lifecycle(tables, slotKey);
        if ((matches || !checkpoint) && (!slot || record.revision > slot.revision)) {
          saveLifecycle(tables, slotKey, receipt);
        }
        if (matches) tables.checkpoints.delete(record.kind);
        return { status, grants };
      }));
    });
  }

  saveCheckpoint(token: SaveToken, input: CheckpointRecord, activatedContent?: PreparedPuzzle | ScenarioCheckpointContent): Promise<StorageResult<'saved' | 'duplicate'>> {
    return this.result(async () => {
      const record = validateRecord('checkpoints', input);
      if (!('kind' in record)) fail('invalid', 'Expected activity checkpoint');
      if (record.kind === 'puzzle') {
        if (!activatedContent || !('record' in activatedContent) || recoverCheckpoint(record, activatedContent).status !== 'resumed') {
          fail('content-changed', 'Checkpoint cannot resume against activated content');
        }
      } else if (!activatedContent || 'record' in activatedContent || recoverScenarioCheckpoint(record, activatedContent).status !== 'resumed') {
        fail('content-changed', 'Scenario checkpoint requires matching content and branch validation');
      }
      return this.unwrap(await this.write(token, tables => {
        const previous = read(tables, 'checkpoints', record.kind);
        if (lifecycle(tables, `activity-complete:${record.kind}:${record.sessionId}`)) fail('stale', 'Completed session cannot save a checkpoint');
        const completed = read(tables, 'progress', `${record.kind}:${record.contentId}`);
        if (completed && record.revision <= completed.revision) fail('stale', 'Checkpoint predates completion');
        const slotKey = `activity-slot:${record.kind}`;
        const slot = lifecycle(tables, slotKey);
        if (slot && (record.revision < slot.revision ||
          (record.revision === slot.revision && (!previous || previous.revision !== slot.revision)))) {
          fail('stale', 'Checkpoint revision is stale');
        }
        const status = revision(previous, record);
        if (status === 'duplicate') return status;
        saveLifecycle(tables, slotKey, { schemaVersion: 2, recordType: 'activity-lifecycle', kind: record.kind,
          contentId: record.contentId, contentVersion: record.contentVersion, sessionId: record.sessionId,
          revision: record.revision, state: 'checkpoint' });
        tables.checkpoints.set(record.kind, record); return status;
      }));
    });
  }

  saveGame(token: SaveToken, input: GameRecord): Promise<StorageResult<{ status: 'saved' | 'duplicate'; grants: string[]; pruned: string[] }>> {
    return this.result(async () => {
      const record = validateRecord('games', input); // Outcome/path validated before opening the write transaction.
      const digest = await fingerprint(record);
      return this.unwrap(await this.write(token, tables => {
        const metadata = meta(tables);
        const ledger = all(tables, 'ledger');
        const orders = ledger.filter(r => r.order !== null).map(r => r.order!);
        if (new Set(orders).size !== orders.length || orders.some(order => order >= metadata.nextOrder)) fail('corrupt', 'Invalid completion order ledger');
        const previous = ledger.find(r => r.id === record.id);
        if (previous) {
          if (record.revision < previous.revision) fail('stale', 'Game revision is stale');
          if (record.revision === previous.revision) {
            if (digest !== previous.fingerprint) fail('conflict', 'Game revision has different contents');
            return { status: 'duplicate' as const, grants: [], pruned: [] };
          }
          if (previous.outcome.status === 'resigned') fail('conflict', 'Resignation remains terminal');
        }
        // Existing incompatible detail for this ID must be explicitly reset, not overwritten.
        read(tables, 'games', record.id);
        const active = read(tables, 'checkpoints', 'bot');
        if (record.outcome.status === 'in-progress' && active && 'id' in active && active.id !== record.id) {
          fail('conflict', 'Finish or abandon the current bot game before starting another');
        }
        const completed = isCompleted(record.outcome);
        const order = previous?.order ?? (completed ? metadata.nextOrder++ : null);
        const result: LedgerRecord = { schemaVersion: 2, id: record.id, revision: record.revision, order,
          playerColour: record.playerColour, difficulty: record.difficulty, help: record.help,
          outcome: record.outcome, fingerprint: digest };
        tables.ledger.set(record.id, result); tables.metadata.set('local', validateRecord('metadata', metadata));
        if (completed) tables.games.set(record.id, record);
        else tables.games.delete(record.id);
        if (record.outcome.status === 'in-progress') tables.checkpoints.set('bot', record);
        else if (active && 'id' in active && active.id === record.id) tables.checkpoints.delete('bot');
        const grants = completed ? this.grant(tables, 'game:' + record.id) : [];
        const retained = all(tables, 'games').sort((a, b) =>
          (read(tables, 'ledger', b.id)?.order ?? 0) - (read(tables, 'ledger', a.id)?.order ?? 0));
        const pruned = retained.slice(100).map(r => r.id);
        pruned.forEach(id => tables.games.delete(id));
        return { status: 'saved' as const, grants, pruned };
      }));
    });
  }

  /** Local invalidation begins immediately, even if the reset later fails.
   * Durable generation changes in the same transaction as erased data, so other
   * instances/tabs cannot resurrect it with their earlier tokens. */
  reset(action: ResetAction): Promise<StorageResult<void>> {
    this.localGeneration++;
    return this.result(() => this.backend.transact(true, tables => {
      if (!['appearance', 'learning', 'games', 'fresh'].includes(action)) fail('invalid', 'Unknown reset');
      let metadata;
      try { metadata = meta(tables); }
      catch (error) {
        // Deliberate fresh-start can erase incompatible records; narrower resets
        // must preserve them and report the problem. A new opaque epoch prevents
        // an earlier peer token from matching even when metadata was corrupt.
        if (action !== 'fresh') throw error;
        metadata = copy(DEFAULT_METADATA);
      }
      metadata.generation = globalThis.crypto.randomUUID();
      if (action === 'fresh') {
        for (const store of STORES) tables[store].clear();
        metadata.nextOrder = 1;
        tables.settings.set('local', copy(DEFAULT_SETTINGS)); tables.wardrobe.set('local', copy(DEFAULT_WARDROBE));
      } else if (action === 'learning') {
        tables.progress.clear(); tables.checkpoints.delete('puzzle'); tables.checkpoints.delete('scenario');
        for (const key of tables.metadata.keys()) if (key !== 'local') tables.metadata.delete(key);
      } else if (action === 'games') {
        tables.games.clear(); tables.ledger.clear(); tables.checkpoints.delete('bot'); metadata.nextOrder = 1;
      } else {
        const wardrobe = read(tables, 'wardrobe', 'local') ?? copy(DEFAULT_WARDROBE);
        wardrobe.equipped = []; wardrobe.boardTheme = DEFAULT_WARDROBE.boardTheme; wardrobe.pieceTheme = DEFAULT_WARDROBE.pieceTheme;
        wardrobe.revision++; tables.wardrobe.set('local', validateRecord('wardrobe', wardrobe));
      }
      tables.metadata.set('local', validateRecord('metadata', metadata));
    }));
  }
  close(): void { this.localGeneration++; this.backend.close(); }
}
