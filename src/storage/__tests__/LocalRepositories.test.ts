// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../chess/ChessGame';
import { PuzzleSession } from '../../puzzles/PuzzleSession';
import { validatePuzzle } from '../../puzzles/validatePuzzle';
import { captureCheckpoint, recoverCheckpoint, recoverScenarioCheckpoint } from '../checkpointRecovery';
import { IndexedDbBackend } from '../IndexedDbBackend';
import { LocalRepositories } from '../LocalRepositories';
import { deriveLegacy } from '../legacy';
import { DEFAULT_SETTINGS, DEFAULT_WARDROBE } from '../storageTypes';
import type { GameRecord, ActivityCompletion, StorageResult, CheckpointRecord } from '../storageTypes';
import { reconstructGame } from '../validateRecords';
import { MemoryBackend } from './MemoryBackend';

function value<T>(result: StorageResult<T>): T {
  if (!result.ok) throw new Error(result.code + ': ' + result.message); return result.value;
}
function game(id = 'game-1', revision = 0, moves: string[] = []): GameRecord {
  return { schemaVersion: 2, id, revision, startFen: new ChessGame().fen, moves,
    playerColour: 'white', difficulty: 'gentle', help: { preview: false, hints: 0, takebacks: 0 },
    outcome: { status: 'resigned', winner: 'black' } };
}
function progress(id: string, revision = 0, contentVersion = 'v1', kind: 'puzzle' | 'scenario' = 'puzzle'): ActivityCompletion {
  return { schemaVersion: 2, kind, id, revision, contentVersion, sessionId: `${kind}:${id}:${contentVersion}` };
}
const childFen = '6k1/4Q3/5K2/8/8/8/8/8 w - - 2 2';
// A complete proof supplies all reachable hints without importing the costly
// fixture generator into a second worker. Construct only once in this test file.
import { fixtures } from '../../puzzles/__tests__/fixtures';

describe('M2 local record transactions', () => {
  it('reloads settings, wardrobe, current bot game and puzzle independently', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    value(await repo.saveSettings(token, { ...DEFAULT_SETTINGS, revision: 1, launchMode: 'kids', language: 'da' }));
    value(await repo.saveWardrobe(token, { ...DEFAULT_WARDROBE, revision: 1, boardTheme: 'bright' }));
    const active = { ...game(), moves: ['e2e4'], outcome: { status: 'in-progress' as const } };
    value(await repo.saveGame(token, active));
    const content = validatePuzzle(fixtures.alternatives); const session = new PuzzleSession(content.record);
    session.requestHint();
    value(await repo.saveCheckpoint(token, captureCheckpoint(session, content, 0), content));
    const reload = value(await new LocalRepositories(backend).load());
    expect(reload.records.settings[0].language).toBe('da');
    expect(reload.records.wardrobe[0].boardTheme).toBe('bright');
    const stored = reload.records.checkpoints.find(c => 'id' in c)! as GameRecord;
    expect(reconstructGame(stored).history.map(m => m.uci)).toEqual(['e2e4']);
    expect(reload.records.checkpoints).toHaveLength(2);
    const restored = recoverCheckpoint(reload.records.checkpoints.find(c => 'kind' in c), content);
    expect(restored.status).toBe('resumed');
    if (restored.status === 'resumed') expect(restored.session.getSnapshot().hints).toHaveLength(1);
  });

  it('isolates corrupt/future data, leaves raw data untouched and migrates valid v1 explicitly', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend);
    backend.tables.settings.set('local', { ...DEFAULT_SETTINGS, schemaVersion: 1, music: undefined });
    backend.tables.metadata.set('local', { schemaVersion: 1, generation: 7, nextOrder: 1 });
    backend.tables.games.set('bad', { schemaVersion: 2 });
    backend.tables.progress.set('puzzle:future', { schemaVersion: 999 });
    const raw = structuredClone(backend.tables);
    const loaded = value(await repo.load());
    expect(loaded.issues).toEqual([{ store: 'games', key: 'bad', code: 'corrupt' }, { store: 'progress', key: 'puzzle:future', code: 'unsupported' }]);
    expect(loaded.records.settings[0].music).toBe(false);
    expect(backend.tables).toEqual(raw);
    const token = value(await repo.beginSession());
    expect(value(await repo.migrate(token))).toHaveLength(2);
    expect((backend.tables.settings.get('local') as { schemaVersion: number }).schemaVersion).toBe(2);
    expect(backend.tables.metadata.get('local')).toEqual({ schemaVersion: 2, generation: 'v1:7', nextOrder: 1 });
    expect(backend.tables.games.get('bad')).toEqual(raw.games.get('bad'));
    expect(await repo.completeActivity(token, progress('future'))).toMatchObject({ ok: false, code: 'unsupported' });
    backend.tables.settings.set('local', { schemaVersion: 8 });
    expect(await repo.saveSettings(token, { ...DEFAULT_SETTINGS, revision: 2 })).toMatchObject({ ok: false, code: 'unsupported' });
  });

  it('rolls back failed migrations and result/award writes; retry commits once', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    backend.tables.settings.set('local', { ...DEFAULT_SETTINGS, schemaVersion: 1 });
    backend.failNextWrite = true;
    expect(await repo.migrate(token)).toMatchObject({ ok: false, code: 'write-failed' });
    expect((backend.tables.settings.get('local') as { schemaVersion: number }).schemaVersion).toBe(1);
    backend.failNextWrite = true; const before = structuredClone(backend.tables);
    expect(await repo.saveGame(token, game())).toMatchObject({ ok: false, code: 'write-failed' });
    expect(backend.tables).toEqual(before);
    expect(value(await repo.saveGame(token, game())).grants).toEqual(['first-game']);
    expect(value(await repo.saveGame(token, game())).status).toBe('duplicate');
    const records = value(await repo.load()).records;
    expect(records.ledger).toHaveLength(1);
    expect(records.wardrobe[0].owned.filter(i => i === 'milestone:first-game')).toHaveLength(1);
  });

  it('counts distinct stable puzzle IDs across hints, repeats, versions and learning resets', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); let token = value(await repo.beginSession());
    for (let i = 0; i < 4; i++) expect(value(await repo.completeActivity(token, progress('p' + i))).grants).toEqual([]);
    expect(value(await repo.completeActivity(token, progress('p0', 1, 'v2'))).grants).toEqual([]);
    expect(value(await repo.completeActivity(token, progress('p0', 1, 'v2'))).status).toBe('duplicate');
    expect(value(await repo.completeActivity(token, progress('p4'))).grants).toEqual(['five-puzzles']);
    value(await repo.reset('learning')); token = value(await repo.beginSession());
    expect(value(await repo.completeActivity(token, progress('p4'))).grants).toEqual([]);
    expect(value(await repo.completeActivity(token, progress('scenario', 0, 'v1', 'scenario'))).grants).toEqual(['first-scenario']);
    const records = value(await repo.load()).records;
    expect(records.awards.filter(a => a.kind === 'grant')).toHaveLength(2);
    expect(records.wardrobe[0].owned).toContain('milestone:five-puzzles');
  });

  it('never grants or records completion after a failed activity transaction', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    for (let i = 0; i < 4; i++) value(await repo.completeActivity(token, progress('p' + i)));
    const before = structuredClone(backend.tables); backend.failNextWrite = true;
    expect(await repo.completeActivity(token, progress('p4'))).toMatchObject({ ok: false });
    expect(backend.tables).toEqual(before);
    expect(value(await repo.completeActivity(token, progress('p4'))).grants).toEqual(['five-puzzles']);
  });

  it('reconciles terminal takeback and revised completion under the original order', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const mateMoves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const terminal = { ...game('mate'), moves: mateMoves, outcome: { status: 'checkmate' as const, winner: 'black' as const } };
    value(await repo.saveGame(token, terminal)); value(await repo.saveGame(token, game('later')));
    const reopened = { ...terminal, revision: 1, moves: mateMoves.slice(0, 2), outcome: { status: 'in-progress' as const } };
    value(await repo.saveGame(token, reopened));
    let records = value(await repo.load()).records;
    expect(deriveLegacy(records.ledger).lifetime.games).toBe(1);
    expect(records.games.map(r => r.id)).toEqual(['later']);
    expect(records.wardrobe[0].owned).toContain('milestone:first-game');
    expect(await repo.saveGame(token, terminal)).toMatchObject({ ok: false, code: 'stale' });
    expect(await repo.saveGame(token, { ...reopened, help: { preview: true, hints: 0, takebacks: 0 } })).toMatchObject({ ok: false, code: 'conflict' });
    value(await repo.saveGame(token, { ...terminal, revision: 2 }));
    records = value(await repo.load()).records;
    expect(records.ledger.find(r => r.id === 'mate')!.order).toBe(1);
    expect(deriveLegacy(records.ledger).lifetime.games).toBe(2);
    expect(await repo.saveGame(token, { ...game('later', 1), outcome: { status: 'in-progress' } })).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('retains Legacy across 99/100/101 and 199/200 boundaries, pruning and duplicate writes', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    for (let i = 1; i <= 201; i++) {
      value(await repo.saveGame(token, { ...game('g' + i), playerColour: i % 2 ? 'black' : 'white',
        ...(i === 100 ? { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], outcome: { status: 'checkmate' as const, winner: 'black' as const } } : {}),
        difficulty: i % 2 ? 'casual' : 'gentle', help: { preview: i % 2 === 0, hints: 1, takebacks: 0 } }));
      if ([99, 100, 101, 199, 200, 201].includes(i)) {
        const records = value(await repo.load()).records; const legacy = deriveLegacy(records.ledger);
        expect(legacy.lifetime.games).toBe(i); expect(records.games).toHaveLength(Math.min(i, 100));
        expect(legacy.blocks.map(b => b.games)).toEqual(i <= 100 ? [i] : i <= 200 ? [100, i - 100] : [100, 100, 1]);
      }
    }
    value(await repo.saveGame(token, { ...game('abandoned'), outcome: { status: 'aborted' } }));
    const records = value(await repo.load()).records; const legacy = deriveLegacy(records.ledger);
    expect(legacy.lifetime.games).toBe(201); expect(legacy.lifetime.wins).toBe(101);
    expect(legacy.lifetime.help.hinted).toBe(201); expect(legacy.blocks[0].scorePercent).toBe(50);
    expect(legacy.lifetime.difficulty).toEqual({ casual: 101, gentle: 100 });
    // Duplicate after pruning must not re-add replay detail or change the ledger.
    const original = { ...game('g1'), playerColour: 'black' as const, difficulty: 'casual' as const, help: { preview: false, hints: 1, takebacks: 0 } };
    expect(value(await repo.saveGame(token, original)).status).toBe('duplicate');
    expect(value(await repo.load()).records.games).toHaveLength(100);
    value(await repo.saveGame(token, { ...game('g100', 1), outcome: { status: 'in-progress' } }));
    expect(deriveLegacy(value(await repo.load()).records.ledger).blocks.map(b => b.games)).toEqual([100, 100]);
    value(await repo.saveGame(token, { ...game('g100', 2), outcome: { status: 'resigned', winner: 'white' } }));
    const corrected = value(await repo.load()).records.ledger;
    expect(corrected.find(r => r.id === 'g100')!.order).toBe(100);
    expect(deriveLegacy(corrected).blocks[0].scorePercent).toBe(51);
  });

  it('includes draws at half a point without claiming Elo', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const draw = { ...game('draw'), startFen: '7k/8/8/8/8/8/8/K7 w - - 0 1', outcome: { status: 'draw' as const, reason: 'insufficient-material' as const } };
    value(await repo.saveGame(token, draw));
    expect(deriveLegacy(value(await repo.load()).records.ledger).lifetime).toMatchObject({ games: 1, draws: 1, scorePercent: 50 });
  });

  it.each(['appearance', 'learning', 'games', 'fresh'] as const)('applies the %s reset matrix and rejects old saves from another instance', async action => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const peer = new LocalRepositories(backend);
    const token = value(await repo.beginSession()); const peerToken = value(await peer.beginSession());
    value(await repo.saveSettings(token, { ...DEFAULT_SETTINGS, revision: 1, language: 'da', music: true }));
    value(await repo.saveGame(token, game())); value(await repo.completeActivity(token, progress('p')));
    const wardrobe = value(await repo.load()).records.wardrobe[0];
    value(await repo.saveWardrobe(token, { ...wardrobe, revision: wardrobe.revision + 1, equipped: ['milestone:first-game'], boardTheme: 'bright' }));
    value(await repo.reset(action));
    expect(await peer.completeActivity(peerToken, progress('late'))).toMatchObject({ ok: false, code: 'stale' });
    expect(await repo.saveGame(token, game('late'))).toMatchObject({ ok: false, code: 'stale' });
    const records = value(await repo.load()).records;
    expect(records.progress).toHaveLength(action === 'learning' || action === 'fresh' ? 0 : 1);
    expect(deriveLegacy(records.ledger).lifetime.games).toBe(action === 'games' || action === 'fresh' ? 0 : 1);
    expect(records.awards.length > 0).toBe(action !== 'fresh');
    expect(records.wardrobe[0].owned.includes('milestone:first-game')).toBe(action !== 'fresh');
    expect(records.settings[0].language).toBe(action === 'fresh' ? 'en' : 'da');
    expect(records.wardrobe[0].boardTheme).toBe(action === 'appearance' || action === 'fresh' ? 'classic' : 'bright');
  });

  it('invalidates queued saves immediately on reset, and failed resets never claim success', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    value(await repo.completeActivity(token, progress('existing')));
    let release!: () => void; backend.gate = new Promise<void>(resolve => { release = resolve; });
    const queued = repo.completeActivity(token, progress('late'));
    const reset = repo.reset('learning'); release();
    expect(await queued).toMatchObject({ ok: false, code: 'stale' }); value(await reset);
    expect(value(await repo.load()).records.progress).toHaveLength(0);
    const newToken = value(await repo.beginSession()); value(await repo.completeActivity(newToken, progress('kept')));
    backend.failNextWrite = true; const before = structuredClone(backend.tables);
    expect(await repo.reset('fresh')).toMatchObject({ ok: false, code: 'write-failed' });
    expect(backend.tables).toEqual(before);
    expect(await repo.completeActivity(newToken, progress('late'))).toMatchObject({ ok: false, code: 'stale' });
    value(await repo.completeActivity(value(await repo.beginSession()), progress('retry')));
  });

  it('serialises concurrent instances, prevents duplicate grants and protects the one active bot slot', async () => {
    const backend = new MemoryBackend(); const a = new LocalRepositories(backend); const b = new LocalRepositories(backend);
    const ta = value(await a.beginSession()); const tb = value(await b.beginSession());
    const results = await Promise.all([a.saveGame(ta, game()), b.saveGame(tb, game())]);
    expect(results.map(r => value(r).status).sort()).toEqual(['duplicate', 'saved']);
    value(await a.saveGame(ta, { ...game('live'), outcome: { status: 'in-progress' } }));
    expect(await b.saveGame(tb, { ...game('other'), outcome: { status: 'in-progress' } })).toMatchObject({ ok: false, code: 'conflict' });
    value(await a.saveGame(ta, { ...game('live', 1), outcome: { status: 'aborted' } }));
    value(await b.saveGame(tb, { ...game('other'), outcome: { status: 'in-progress' } }));
    expect(value(await a.load()).records.awards.filter(a => a.kind === 'grant')).toHaveLength(1);
  });

  it.each([
    { ...game(), moves: ['e2e5'] },
    { ...game(), moves: ['E2E4'] },
    { ...game(), outcome: { status: 'checkmate', winner: 'white' } },
    { ...game(), startFen: '6k1/4Q3/5K2/8/8/8/8/8 w K - 2 2' },
    { ...game(), revision: -1 },
  ])('rejects invalid imported game %j without writing', async input => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    expect(await repo.saveGame(token, input as GameRecord)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(backend.tables.ledger.size).toBe(0);
  });

  it('does not claim success when IndexedDB is unavailable', async () => {
    const repo = new LocalRepositories(new IndexedDbBackend('unused', undefined));
    expect(await repo.load()).toMatchObject({ ok: false, code: 'unavailable' });
    expect(await repo.beginSession()).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('does not overwrite corrupt awards/inventory or mismatched ledger identities', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    backend.tables.awards.set('future', { schemaVersion: 9 });
    expect(await repo.completeActivity(token, progress('p'))).toMatchObject({ ok: false, code: 'unsupported' });
    expect(backend.tables.progress.size).toBe(0);
    backend.tables.awards.clear(); value(await repo.saveGame(token, game()));
    const ledger = backend.tables.ledger.get('game-1'); backend.tables.ledger.delete('game-1'); backend.tables.ledger.set('wrong-id', ledger);
    expect(await repo.saveGame(token, game('new'))).toMatchObject({ ok: false, code: 'corrupt' });
  });

  it('resets learning and game checkpoints independently while retaining earned inventory', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); let token = value(await repo.beginSession());
    const content = validatePuzzle(fixtures.alternatives);
    const checkpoint = captureCheckpoint(new PuzzleSession(content.record), content, 0);
    value(await repo.saveCheckpoint(token, checkpoint, content));
    value(await repo.saveGame(token, { ...game(), outcome: { status: 'in-progress' } }));
    value(await repo.reset('learning'));
    expect(value(await repo.load()).records.checkpoints.map(c => 'kind' in c ? c.kind : 'bot')).toEqual(['bot']);
    token = value(await repo.beginSession()); value(await repo.saveCheckpoint(token, checkpoint, content));
    value(await repo.reset('games'));
    expect(value(await repo.load()).records.checkpoints.map(c => 'kind' in c ? c.kind : 'bot')).toEqual(['puzzle']);
  });

  it('allows deliberate fresh-start recovery from corrupt metadata and invalidates earlier peer tokens', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const peer = new LocalRepositories(backend);
    const token = value(await peer.beginSession());
    backend.tables.metadata.set('local', { schemaVersion: 99 });
    expect(await repo.beginSession()).toMatchObject({ ok: false, code: 'unsupported' });
    expect(await repo.reset('learning')).toMatchObject({ ok: false, code: 'unsupported' });
    value(await repo.reset('fresh'));
    expect(await peer.completeActivity(token, progress('late'))).toMatchObject({ ok: false, code: 'stale' });
    expect(value(await repo.load()).issues).toEqual([]);
  });

  it('reports failed settings/checkpoint writes and keeps prior records; revisions prevent stale replacement', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    backend.failNextWrite = true;
    expect(await repo.saveSettings(token, { ...DEFAULT_SETTINGS, revision: 1, music: true })).toMatchObject({ ok: false });
    expect(value(await repo.load()).records.settings[0].music).toBe(false);
    const content = validatePuzzle(fixtures.alternatives); const checkpoint = captureCheckpoint(new PuzzleSession(content.record), content, 1);
    value(await repo.saveCheckpoint(token, checkpoint, content)); backend.failNextWrite = true;
    expect(await repo.saveCheckpoint(token, { ...checkpoint, revision: 2, hintCount: 1 }, content)).toMatchObject({ ok: false });
    expect(value(await repo.load()).records.checkpoints[0]).toEqual(checkpoint);
    expect(await repo.saveCheckpoint(token, { ...checkpoint, revision: 0 }, content)).toMatchObject({ ok: false, code: 'stale' });
    expect(await repo.saveCheckpoint(token, { ...checkpoint, hintCount: 1 }, content)).toMatchObject({ ok: false, code: 'conflict' });
  });

  it.each([
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1'], 'f1', 'r'],
    ['7k/8/8/3pP3/8/8/8/K7 w - d6 0 2', ['e5d6'], 'd6', 'p'],
    ['k6r/6P1/8/8/8/8/8/K7 w - - 0 1', ['g7h8n'], 'h8', 'n'],
  ])('reconstructs stored special moves from %s', async (startFen, moves, square, type) => {
    const repo = new LocalRepositories(new MemoryBackend()); const token = value(await repo.beginSession());
    const projected = reconstructGame({ startFen, moves });
    const record = { ...game(), startFen, moves, outcome: projected.getSnapshot().outcome };
    value(await repo.saveGame(token, record));
    const records = value(await repo.load()).records;
    const saved = records.games[0] ?? records.checkpoints.find(c => 'id' in c)! as GameRecord;
    expect(reconstructGame(saved).getSnapshot().pieces).toContainEqual({ square, type, colour: 'white' });
  });
});

describe('M2 checkpoint recovery contracts', () => {
  it('restores decision and pending reply with fresh tokens and no completion award', () => {
    const content = validatePuzzle(fixtures.alternatives); const session = new PuzzleSession(content.record);
    session.submitMove({ from: 'e4', to: 'e7' });
    const oldToken = session.getSnapshot().replyToken!;
    let checkpoint = captureCheckpoint(session, content, 0);
    let resumed = recoverCheckpoint(checkpoint, content);
    expect(resumed.status).toBe('resumed');
    if (resumed.status !== 'resumed') throw new Error('Expected resume');
    expect(resumed.session.advanceOpponentReply(oldToken)).toBe(false);
    expect(resumed.session.advanceOpponentReply(resumed.session.getSnapshot().replyToken!, 'h8g8')).toBe(true);
    checkpoint = captureCheckpoint(resumed.session, content, 1);
    expect(checkpoint.decisionPly).toBe(2);
    expect(checkpoint.sessionId).toBe(captureCheckpoint(session, content, 0).sessionId);
    resumed = recoverCheckpoint(checkpoint, content);
    if (resumed.status !== 'resumed') throw new Error('Expected resume');
    expect(resumed.session.getSnapshot().checkpoint!.fen).toBe(childFen);
    expect(resumed.session.takeCompletion()).toBeNull();
  });

  it('recovers an unsuccessful attempt to its accepted decision only', () => {
    const content = validatePuzzle(fixtures.alternatives); const session = new PuzzleSession(content.record);
    session.submitMove({ from: 'e4', to: 'h4' });
    const resumed = recoverCheckpoint(captureCheckpoint(session, content, 0), content);
    expect(resumed.status).toBe('resumed');
    if (resumed.status === 'resumed') {
      expect(resumed.session.getSnapshot().phase).toBe('player-turn');
      expect(resumed.session.getSnapshot().attemptedPosition).toBeNull();
    }
  });

  it('returns clear changed/removed/corrupt/unsupported outcomes and refuses saves after activated content changes', async () => {
    const content = validatePuzzle(fixtures.alternatives); const checkpoint = captureCheckpoint(new PuzzleSession(content.record), content, 0);
    const changed = validatePuzzle({ ...content.record, contentVersion: 'v2' });
    expect(recoverCheckpoint(checkpoint, changed)).toEqual({ status: 'restart', reason: 'content-changed' });
    expect(recoverCheckpoint({ ...checkpoint, startFen: childFen }, content)).toEqual({ status: 'restart', reason: 'content-changed' });
    expect(recoverCheckpoint(checkpoint, null)).toEqual({ status: 'selection', reason: 'removed' });
    expect(recoverCheckpoint({ ...checkpoint, schemaVersion: 9 }, content)).toEqual({ status: 'restart', reason: 'unsupported' });
    expect(recoverCheckpoint({ ...checkpoint, acceptedMoves: ['e4h4'] }, content)).toEqual({ status: 'restart', reason: 'corrupt' });
    expect(recoverCheckpoint({ ...checkpoint, decisionPly: 1 }, content)).toEqual({ status: 'restart', reason: 'corrupt' });
    const repo = new LocalRepositories(new MemoryBackend()); const token = value(await repo.beginSession());
    value(await repo.saveCheckpoint(token, checkpoint, content)); value(await repo.completeActivity(token, progress('unrelated')));
    expect(await repo.saveCheckpoint(token, { ...checkpoint, revision: 1 }, changed)).toMatchObject({ ok: false, code: 'content-changed' });
    expect(value(await repo.load()).records.progress).toHaveLength(1);
  });

  it('validates a synthetic scenario path through its trusted content adapter', async () => {
    const checkpoint: CheckpointRecord = { schemaVersion: 2, kind: 'scenario', contentId: 'scenario', contentVersion: 'v1',
      sessionId: 'scenario-session', startFen: new ChessGame().fen,
      revision: 0, acceptedMoves: ['e2e4', 'e7e5'], decisionPly: 2, hintCount: 1 };
    const content = { id: 'scenario', contentVersion: 'v1', startFen: new ChessGame().fen,
      validateBranch: (cp: CheckpointRecord, g: ChessGame) => cp.decisionPly === 2 && g.history.length === 2 && g.history[0].uci === 'e2e4' };
    expect(recoverScenarioCheckpoint(checkpoint, content).status).toBe('resumed');
    expect(recoverScenarioCheckpoint({ ...checkpoint, acceptedMoves: ['e2e5'] }, content).status).toBe('restart');
    expect(recoverScenarioCheckpoint(checkpoint, { ...content, contentVersion: 'v2' })).toEqual({ status: 'restart', reason: 'content-changed' });
    const repo = new LocalRepositories(new MemoryBackend()); const token = value(await repo.beginSession());
    value(await repo.saveCheckpoint(token, checkpoint, content));
    expect(await repo.saveCheckpoint(token, { ...checkpoint, revision: 1 }, { ...content, validateBranch: () => false })).toMatchObject({ ok: false });
  });

  it('removes the matching checkpoint with completion in the same transaction, not an unrelated checkpoint', async () => {
    const content = validatePuzzle(fixtures.alternatives); const repo = new LocalRepositories(new MemoryBackend()); const token = value(await repo.beginSession());
    const checkpoint = captureCheckpoint(new PuzzleSession(content.record), content, 0);
    value(await repo.saveCheckpoint(token, checkpoint, content));
    value(await repo.completeActivity(token, progress('unrelated')));
    expect(value(await repo.load()).records.checkpoints).toHaveLength(1);
    value(await repo.completeActivity(token, { ...progress(content.record.id, 1, content.record.contentVersion), sessionId: checkpoint.sessionId }));
    expect(value(await repo.load()).records.checkpoints).toHaveLength(0);
  });
});
