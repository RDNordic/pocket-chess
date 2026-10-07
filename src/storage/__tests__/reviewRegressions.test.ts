// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../chess/ChessGame';
import { validatePuzzle } from '../../puzzles/validatePuzzle';
import type { PuzzleRecord } from '../../puzzles/puzzleTypes';
import { LocalRepositories } from '../LocalRepositories';
import { validateRecord } from '../validateRecords';
import type { ActivityCompletion, CheckpointRecord, GameRecord, StorageResult } from '../storageTypes';
import { MemoryBackend } from './MemoryBackend';

function value<T>(result: StorageResult<T>): T {
  if (!result.ok) throw new Error(result.code + ': ' + result.message); return result.value;
}
const fen = '6k1/4Q3/5K2/8/8/8/8/8 w - - 2 2';
const puzzle: PuzzleRecord = { schemaVersion: 1, id: 'activity', contentVersion: 'v1', startFen: fen,
  player: 'white', objective: { kind: 'mate', moves: 1 }, displayLine: ['e7g7'], completionText: 'Mate.',
  decisions: [{ fen, hints: [{ kind: 'concept', text: 'Give mate.' },
    { kind: 'piece', square: 'e7', text: 'Use the queen.' },
    { kind: 'destination', move: 'e7g7', text: 'Play Qg7.' }] }] };
function activity(kind: 'puzzle' | 'scenario', id = 'activity') {
  const checkpoint: CheckpointRecord = { schemaVersion: 2, kind, contentId: id, contentVersion: 'v1',
    sessionId: 'session-a', startFen: fen, revision: 7, acceptedMoves: [], decisionPly: 0, hintCount: 0 };
  const content = kind === 'puzzle' ? validatePuzzle({ ...puzzle, id }) :
    { id, contentVersion: 'v1', startFen: fen, validateBranch: (cp: CheckpointRecord) => cp.acceptedMoves.length === 0 && cp.decisionPly === 0 };
  const completion: ActivityCompletion = { schemaVersion: 2, kind, id, contentVersion: 'v1', revision: 8, sessionId: 'session-a' };
  return { checkpoint, content, completion };
}
function game(id: string): GameRecord {
  return { schemaVersion: 2, id, revision: 0, startFen: new ChessGame().fen, moves: [], playerColour: 'white',
    difficulty: 'gentle', help: { preview: false, hints: 0, takebacks: 0 }, outcome: { status: 'resigned', winner: 'black' } };
}

describe('M2 review: session-aware completion and durable checkpoint protection', () => {
  it.each(['puzzle', 'scenario'] as const)('keeps %s closed across reload/peers and preserves a newer intentional replay on duplicate completion', async kind => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const { checkpoint, content, completion } = activity(kind);
    value(await repo.saveCheckpoint(token, checkpoint, content));
    value(await repo.completeActivity(token, completion));
    expect(value(await repo.load()).records.checkpoints).toHaveLength(0);
    const reload = new LocalRepositories(backend); const peer = new LocalRepositories(backend);
    const reloadedToken = value(await reload.beginSession()); const peerToken = value(await peer.beginSession());
    expect(await reload.saveCheckpoint(reloadedToken, checkpoint, content)).toMatchObject({ ok: false, code: 'stale' });
    expect(await peer.saveCheckpoint(peerToken, { ...checkpoint, revision: 99 }, content)).toMatchObject({ ok: false, code: 'stale' });
    const replay = { ...checkpoint, revision: 9, sessionId: 'session-b' };
    value(await reload.saveCheckpoint(reloadedToken, replay, content));
    const before = structuredClone(backend.tables);
    expect(value(await peer.completeActivity(peerToken, completion))).toEqual({ status: 'duplicate', grants: [] });
    expect(backend.tables).toEqual(before); // No progress, metadata, evidence, inventory or checkpoint mutation.
    expect(value(await peer.load()).records.checkpoints).toEqual([replay]);
    value(await peer.completeActivity(peerToken, { ...completion, revision: 10, sessionId: 'session-b' }));
    expect(value(await peer.load()).records.checkpoints).toHaveLength(0);
    expect(await reload.saveCheckpoint(reloadedToken, replay, content)).toMatchObject({ ok: false, code: 'stale' });
    expect(value(await peer.load()).issues).toEqual([]);
  });

  it.each(['puzzle', 'scenario'] as const)('does not let a first delayed %s completion delete a different session', async kind => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const { checkpoint, content, completion } = activity(kind);
    const replay = { ...checkpoint, revision: 9, sessionId: 'session-b' };
    value(await repo.saveCheckpoint(token, replay, content));
    value(await repo.completeActivity(token, completion));
    expect(value(await repo.load()).records.checkpoints).toEqual([replay]);
    expect(await repo.saveCheckpoint(token, { ...checkpoint, revision: 11 }, content)).toMatchObject({ ok: false, code: 'stale' });
  });

  it.each(['puzzle', 'scenario'] as const)('rolls back %s completion, tombstones and awards on failed commit', async kind => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const { checkpoint, content, completion } = activity(kind);
    value(await repo.saveCheckpoint(token, checkpoint, content));
    const before = structuredClone(backend.tables); backend.failNextWrite = true;
    expect(await repo.completeActivity(token, completion)).toMatchObject({ ok: false, code: 'write-failed' });
    expect(backend.tables).toEqual(before);
    expect(value(await repo.saveCheckpoint(token, checkpoint, content))).toBe('duplicate');
    value(await repo.completeActivity(token, completion));
  });

  it('requires a completion session ID and a newer revision before clearing its checkpoint', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const { checkpoint, content, completion } = activity('puzzle');
    value(await repo.saveCheckpoint(token, checkpoint, content)); const before = structuredClone(backend.tables);
    expect(await repo.completeActivity(token, { ...completion, sessionId: undefined } as unknown as ActivityCompletion)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await repo.completeActivity(token, { ...completion, revision: 7 })).toMatchObject({ ok: false, code: 'stale' });
    expect(await repo.completeActivity(token, { ...completion, id: 'wrong-activity' })).toMatchObject({ ok: false, code: 'conflict' });
    expect(await repo.completeActivity(token, { ...completion, contentVersion: 'v2' })).toMatchObject({ ok: false, code: 'conflict' });
    expect(backend.tables).toEqual(before);
  });

  it('uses retained legacy progress as a revision floor without inventing its missing session identity', async () => {
    const backend = new MemoryBackend(); const { checkpoint, content, completion } = activity('puzzle');
    const { sessionId: _sessionId, ...legacy } = completion;
    backend.tables.progress.set('puzzle:activity', legacy);
    const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    expect(await repo.saveCheckpoint(token, checkpoint, content)).toMatchObject({ ok: false, code: 'stale' });
    value(await repo.saveCheckpoint(token, { ...checkpoint, revision: 9, sessionId: 'replay' }, content));
    expect(value(await repo.load()).issues).toEqual([]);
  });

  it('learning reset clears lifecycle fences only with a new durable reset epoch', async () => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const { checkpoint, content, completion } = activity('puzzle');
    value(await repo.completeActivity(token, completion)); value(await repo.reset('learning'));
    expect(await repo.saveCheckpoint(token, checkpoint, content)).toMatchObject({ ok: false, code: 'stale' });
    value(await repo.saveCheckpoint(value(await repo.beginSession()), { ...checkpoint, revision: 0, sessionId: 'after-reset' }, content));
  });
});

describe('M2 review: generated evidence ID boundaries', () => {
  it.each(['puzzle', 'scenario', 'game'] as const)('round-trips %s evidence for source IDs at lengths 1, 199 and 200', async kind => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    for (const length of [1, 199, 200]) {
      const id = 'a'.repeat(length);
      if (kind === 'game') value(await repo.saveGame(token, game(id)));
      else value(await repo.completeActivity(token, { schemaVersion: 2, kind, id, revision: length, contentVersion: 'v1', sessionId: 'session-' + length }));
      const reload = new LocalRepositories(backend); const loaded = value(await reload.load());
      expect(loaded.issues).toEqual([]);
      expect(loaded.records.awards).toContainEqual({ schemaVersion: 2, kind: 'evidence', id: kind + ':' + id });
    }
    // A subsequent completion must still work after loading all boundary evidence.
    value(await repo.completeActivity(token, { schemaVersion: 2, kind: 'scenario', id: 'subsequent', revision: 201,
      contentVersion: 'v1', sessionId: 'subsequent-session' }));
  });

  it.each(['puzzle', 'scenario', 'game'] as const)('atomically rejects overlong/invalid %s source IDs and rejects malformed evidence directly', async kind => {
    const backend = new MemoryBackend(); const repo = new LocalRepositories(backend); const token = value(await repo.beginSession());
    const before = structuredClone(backend.tables);
    for (const id of ['a'.repeat(201), 'bad\nsource', '']) {
      const result = kind === 'game' ? await repo.saveGame(token, game(id)) :
        await repo.completeActivity(token, { schemaVersion: 2, kind, id, revision: 0, contentVersion: 'v1', sessionId: 'session' });
      expect(result).toMatchObject({ ok: false, code: 'corrupt' });
      expect(backend.tables).toEqual(before);
      expect(() => validateRecord('awards', { schemaVersion: 2, kind: 'evidence', id: kind + ':' + id })).toThrow();
    }
  });
});
