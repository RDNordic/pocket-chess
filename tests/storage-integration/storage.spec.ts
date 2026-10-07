import { test, expect } from '@playwright/test';
import type { StorageHarness } from './storage-harness';
import type { ActivityCompletion, CheckpointRecord } from '../../src/storage/storageTypes';
declare global { interface Window { storageHarness: StorageHarness } }

test.beforeEach(async ({ page }) => {
  // Fresh non-persistent context, synthetic records; no request may leave localhost.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/tests/storage-integration/storage-harness.html');
  await page.waitForFunction(() => Boolean(window.storageHarness));
});

test('real IndexedDB survives reload and reconstructs accepted game history', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const h = window.storageHarness; const token = await h.repo.beginSession();
    if (!token.ok) throw new Error(token.message);
    const settings = await h.repo.saveSettings(token.value, { ...h.DEFAULT_SETTINGS, revision: 1, language: 'da' });
    const current = await h.repo.saveGame(token.value, { ...h.game(), outcome: { status: 'in-progress' } });
    const content = h.validatePuzzle(h.syntheticPuzzle); const session = new h.PuzzleSession(content.record); session.requestHint();
    const checkpoint = await h.repo.saveCheckpoint(token.value, h.captureCheckpoint(session, content, 0), content);
    h.repo.close(); return { settings, current, checkpoint };
  });
  expect(saved.settings.ok).toBe(true); expect(saved.current.ok).toBe(true);
  expect(saved.checkpoint.ok).toBe(true);
  await page.reload(); await page.waitForFunction(() => Boolean(window.storageHarness));
  const restored = await page.evaluate(async () => {
    const h = window.storageHarness; const load = await h.repo.load();
    if (!load.ok) throw new Error(load.message);
    const game = load.value.records.checkpoints.find(c => 'id' in c);
    if (!game || !('id' in game)) throw new Error('Missing current game');
    const recovery = h.recoverCheckpoint(load.value.records.checkpoints.find(c => 'kind' in c), h.validatePuzzle(h.syntheticPuzzle));
    return { language: load.value.records.settings[0].language, moves: h.reconstructGame(game).history.map(m => m.uci),
      puzzleHints: recovery.status === 'resumed' ? recovery.session.getSnapshot().hints.length : -1, issues: load.value.issues };
  });
  expect(restored).toEqual({ language: 'da', moves: ['e2e4'], puzzleHints: 1, issues: [] });
});

test('real transaction abort rolls back result, ledger, award and inventory together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.storageHarness; const token = await h.repo.beginSession();
    if (!token.ok) throw new Error(token.message);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'wardrobe') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let failed;
    try { failed = await h.repo.saveGame(token.value, h.game()); }
    finally { IDBObjectStore.prototype.put = original; }
    const beforeRetry = await h.repo.load();
    const retry = await h.repo.saveGame(token.value, h.game());
    const duplicate = await h.repo.saveGame(token.value, h.game());
    const afterRetry = await h.repo.load();
    return { failed, beforeRetry, retry, duplicate, afterRetry };
  });
  expect(result.failed).toMatchObject({ ok: false });
  expect(result.beforeRetry.ok).toBe(true);
  if (result.beforeRetry.ok) {
    expect(result.beforeRetry.value.records.ledger).toHaveLength(0);
    expect(result.beforeRetry.value.records.games).toHaveLength(0);
    expect(result.beforeRetry.value.records.awards).toHaveLength(0);
  }
  expect(result.retry).toMatchObject({ ok: true, value: { status: 'saved', grants: ['first-game'] } });
  expect(result.duplicate).toMatchObject({ ok: true, value: { status: 'duplicate' } });
  if (result.afterRetry.ok) expect(result.afterRetry.value.records.wardrobe[0].owned).toContain('milestone:first-game');
});

test('concurrent connections count once and durable reset rejects a late peer save', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.storageHarness;
    const peer = new h.LocalRepositories(new h.IndexedDbBackend('pocket-chess-m2-test'));
    const a = await h.repo.beginSession(); const b = await peer.beginSession();
    if (!a.ok || !b.ok) throw new Error('Storage unavailable');
    const concurrent = await Promise.all([h.repo.saveGame(a.value, h.game()), peer.saveGame(b.value, h.game())]);
    const reset = await h.repo.reset('games');
    const late = await peer.saveGame(b.value, h.game('late'));
    const load = await peer.load(); peer.close(); return { concurrent, reset, late, load };
  });
  expect(result.concurrent.map(r => r.ok ? r.value.status : r.code).sort()).toEqual(['duplicate', 'saved']);
  expect(result.reset.ok).toBe(true); expect(result.late).toMatchObject({ ok: false, code: 'stale' });
  if (result.load.ok) {
    expect(result.load.value.records.ledger).toHaveLength(0);
    expect(result.load.value.records.awards.some(a => a.id === 'first-game')).toBe(true);
  }
});

test('corrupt and future records survive reload; explicit migration updates only supported records', async ({ page }) => {
  await page.evaluate(async () => {
    const h = window.storageHarness;
    await h.backend.transact(true, tables => {
      tables.settings.set('local', { ...h.DEFAULT_SETTINGS, schemaVersion: 1, music: undefined });
      tables.games.set('bad', { schemaVersion: 2 }); tables.progress.set('puzzle:future', { schemaVersion: 77 });
    });
    h.repo.close();
  });
  await page.reload(); await page.waitForFunction(() => Boolean(window.storageHarness));
  const result = await page.evaluate(async () => {
    const h = window.storageHarness; const load = await h.repo.load(); const token = await h.repo.beginSession();
    if (!token.ok) throw new Error(token.message);
    const migration = await h.repo.migrate(token.value);
    const raw = await h.backend.transact(false, tables => ({ settings: tables.settings.get('local'), future: tables.progress.get('puzzle:future'), bad: tables.games.get('bad') }));
    return { load, migration, raw };
  });
  expect(result.load).toMatchObject({ ok: true });
  if (result.load.ok) expect(result.load.value.issues).toHaveLength(2);
  expect(result.migration.ok).toBe(true);
  expect(result.raw.settings).toMatchObject({ schemaVersion: 2, music: false });
  expect(result.raw.future).toEqual({ schemaVersion: 77 }); expect(result.raw.bad).toEqual({ schemaVersion: 2 });
});

test('failed native reset rolls back erasure and invalidates local session work', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.storageHarness; const token = await h.repo.beginSession();
    if (!token.ok) throw new Error(token.message);
    await h.repo.saveGame(token.value, h.game());
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'metadata') throw new DOMException('Synthetic write failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let reset;
    try { reset = await h.repo.reset('games'); }
    finally { IDBObjectStore.prototype.put = original; }
    const load = await h.repo.load(); const late = await h.repo.saveGame(token.value, h.game('late'));
    return { reset, load, late };
  });
  expect(result.reset.ok).toBe(false); expect(result.late).toMatchObject({ ok: false, code: 'stale' });
  if (result.load.ok) expect(result.load.value.records.ledger).toHaveLength(1);
});

test('future IndexedDB schema is reported unsupported without overwriting it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const h = window.storageHarness;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('future-layout', 2);
      request.onupgradeneeded = () => request.result.createObjectStore('future');
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const repo = new h.LocalRepositories(new h.IndexedDbBackend('future-layout'));
    const load = await repo.load(); repo.close(); return load;
  });
  expect(result).toMatchObject({ ok: false, code: 'unsupported' });
});

for (const kind of ['puzzle', 'scenario'] as const) {
  test(`${kind} failed completion rolls back checkpoint deletion and lifecycle receipts`, async ({ page }) => {
    const result = await page.evaluate(async kind => {
      const h = window.storageHarness; const token = await h.repo.beginSession();
      if (!token.ok) throw new Error(token.message);
      const checkpoint: CheckpointRecord = { schemaVersion: 2, kind, contentId: 'activity', contentVersion: 'v1',
        sessionId: 'session-a', startFen: h.syntheticPuzzle.startFen, revision: 7, acceptedMoves: [], decisionPly: 0, hintCount: 0 };
      const content = kind === 'puzzle' ? h.validatePuzzle({ ...h.syntheticPuzzle, id: 'activity', contentVersion: 'v1' }) :
        { id: 'activity', contentVersion: 'v1', startFen: checkpoint.startFen, validateBranch: () => true };
      await h.repo.saveCheckpoint(token.value, checkpoint, content);
      const before = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'metadata' && args[0]?.recordType === 'activity-lifecycle' && args[0]?.state === 'complete') {
          throw new DOMException('Synthetic lifecycle write failure', 'QuotaExceededError');
        }
        return original.apply(this, args);
      };
      const completion: ActivityCompletion = { schemaVersion: 2, kind, id: 'activity', contentVersion: 'v1', revision: 8, sessionId: 'session-a' };
      let failed;
      try { failed = await h.repo.completeActivity(token.value, completion); }
      finally { IDBObjectStore.prototype.put = original; }
      const after = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      const stillOpen = await h.repo.saveCheckpoint(token.value, checkpoint, content);
      const retry = await h.repo.completeActivity(token.value, completion);
      return { failed, unchanged: before === after, stillOpen, retry };
    }, kind);
    expect(result.failed.ok).toBe(false); expect(result.unchanged).toBe(true);
    expect(result.stillOpen).toEqual({ ok: true, value: 'duplicate' }); expect(result.retry.ok).toBe(true);
  });

  test(`${kind} completion fences survive real reload; a peer duplicate cannot erase a newer replay`, async ({ page }) => {
    const saved = await page.evaluate(async kind => {
      const h = window.storageHarness; const token = await h.repo.beginSession();
      if (!token.ok) throw new Error(token.message);
      const checkpoint: CheckpointRecord = { schemaVersion: 2, kind, contentId: 'activity', contentVersion: 'v1',
        sessionId: 'session-a', startFen: h.syntheticPuzzle.startFen, revision: 7, acceptedMoves: [], decisionPly: 0, hintCount: 0 };
      const content = kind === 'puzzle' ? h.validatePuzzle({ ...h.syntheticPuzzle, id: 'activity', contentVersion: 'v1' }) :
        { id: 'activity', contentVersion: 'v1', startFen: checkpoint.startFen, validateBranch: () => true };
      const completion: ActivityCompletion = { schemaVersion: 2, kind, id: 'activity', contentVersion: 'v1', revision: 8, sessionId: 'session-a' };
      const saved = await h.repo.saveCheckpoint(token.value, checkpoint, content);
      const completed = await h.repo.completeActivity(token.value, completion);
      h.repo.close(); return { checkpoint, completion, saved, completed };
    }, kind);
    expect(saved.saved.ok).toBe(true); expect(saved.completed.ok).toBe(true);
    await page.reload(); await page.waitForFunction(() => Boolean(window.storageHarness));
    const result = await page.evaluate(async ({ kind, checkpoint, completion }) => {
      const h = window.storageHarness; const peer = new h.LocalRepositories(new h.IndexedDbBackend('pocket-chess-m2-test'));
      const token = await h.repo.beginSession(); const peerToken = await peer.beginSession();
      if (!token.ok || !peerToken.ok) throw new Error('Storage unavailable');
      const content = kind === 'puzzle' ? h.validatePuzzle({ ...h.syntheticPuzzle, id: 'activity', contentVersion: 'v1' }) :
        { id: 'activity', contentVersion: 'v1', startFen: checkpoint.startFen, validateBranch: () => true };
      const stale = await peer.saveCheckpoint(peerToken.value, checkpoint, content);
      const replay = { ...checkpoint, revision: 9, sessionId: 'session-b' };
      const repeat = await h.repo.saveCheckpoint(token.value, replay, content);
      const before = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      const duplicate = await peer.completeActivity(peerToken.value, completion);
      const after = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      const load = await peer.load();
      const recompleted = await peer.completeActivity(peerToken.value, { ...completion, revision: 10, sessionId: 'session-b' });
      const staleReplay = await h.repo.saveCheckpoint(token.value, replay, content);
      peer.close(); return { stale, repeat, duplicate, unchanged: before === after, load, replay, recompleted, staleReplay };
    }, { kind, checkpoint: saved.checkpoint, completion: saved.completion });
    expect(result.stale).toMatchObject({ ok: false, code: 'stale' });
    expect(result.repeat.ok).toBe(true); expect(result.duplicate).toMatchObject({ ok: true, value: { status: 'duplicate', grants: [] } });
    expect(result.unchanged).toBe(true);
    if (result.load.ok) { expect(result.load.value.records.checkpoints).toEqual([result.replay]); expect(result.load.value.issues).toEqual([]); }
    expect(result.recompleted.ok).toBe(true); expect(result.staleReplay).toMatchObject({ ok: false, code: 'stale' });
  });
}

for (const kind of ['puzzle', 'scenario', 'game'] as const) {
  test(`${kind} prefixed evidence accepts 200-character source IDs and rejects 201 atomically`, async ({ page }) => {
    const result = await page.evaluate(async kind => {
      const h = window.storageHarness; const token = await h.repo.beginSession();
      if (!token.ok) throw new Error(token.message);
      const successes = [];
      for (const length of [199, 200]) {
        const id = 'z'.repeat(length);
        successes.push(kind === 'game' ? await h.repo.saveGame(token.value, h.game(id)) :
          await h.repo.completeActivity(token.value, { schemaVersion: 2, kind, id, contentVersion: 'v1', revision: length, sessionId: 'boundary-' + length }));
      }
      const before = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      const invalid = kind === 'game' ? await h.repo.saveGame(token.value, h.game('z'.repeat(201))) :
        await h.repo.completeActivity(token.value, { schemaVersion: 2, kind, id: 'z'.repeat(201), contentVersion: 'v1', revision: 201, sessionId: 'overlong' });
      const after = await h.backend.transact(false, tables => JSON.stringify(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]))));
      h.repo.close(); return { successes, invalid, unchanged: before === after };
    }, kind);
    expect(result.successes.every(r => r.ok)).toBe(true); expect(result.invalid).toMatchObject({ ok: false, code: 'corrupt' });
    expect(result.unchanged).toBe(true);
    await page.reload(); await page.waitForFunction(() => Boolean(window.storageHarness));
    const reload = await page.evaluate(() => window.storageHarness.repo.load());
    expect(reload.ok).toBe(true);
    if (reload.ok) {
      expect(reload.value.issues).toEqual([]);
      for (const length of [199, 200]) expect(reload.value.records.awards).toContainEqual({ schemaVersion: 2, kind: 'evidence', id: kind + ':' + 'z'.repeat(length) });
    }
  });
}
