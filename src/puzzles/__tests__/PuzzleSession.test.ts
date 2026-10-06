import { Chess } from 'chess.js';
import { ChessGame } from '../../chess/ChessGame';
import { describe, expect, it, vi } from 'vitest';
import type { MoveRequest, SquareId } from '../../chess/chessTypes';
import { PuzzleSession } from '../PuzzleSession';
import type { PuzzleRecord } from '../puzzleTypes';
import { validatePuzzle } from '../validatePuzzle';
import { fixtures, oracle } from './fixtures';

function move(uci: string): MoveRequest {
  return { from: uci.slice(0, 2) as SquareId, to: uci.slice(2, 4) as SquareId,
    ...(uci.length === 5 ? { promotion: uci[4] as 'q' | 'r' | 'b' | 'n' } : {}) };
}
function clone(record: PuzzleRecord): PuzzleRecord { return structuredClone(record); }
function finish(session: PuzzleSession, record: PuzzleRecord): void {
  for (let i = 0; i < record.displayLine.length; i++) {
    if (i % 2 === 0) expect(['accepted', 'complete']).toContain(session.submitMove(move(record.displayLine[i])));
    else expect(session.advanceOpponentReply(session.getSnapshot().replyToken!, record.displayLine[i])).toBe(true);
  }
  expect(session.getSnapshot().phase).toBe('complete');
}

describe('M1 headless puzzle session', () => {
  it.each(Object.entries(fixtures))('validates and completes the %s synthetic fixture', (_name, record) => {
    const session = new PuzzleSession(record);
    expect(session.getSnapshot().contentError).toBeNull();
    finish(session, record);
  });

  it('matches every winning root move and defence against the independent exhaustive oracle', () => {
    for (const record of Object.values(fixtures)) {
      const proof = validatePuzzle(record);
      const expected = oracle(record.startFen, record.objective);
      const compare = (actual: typeof proof.root, reference: typeof expected): void => {
        expect([...actual.choices.keys()].sort()).toEqual([...reference.options.keys()].sort());
        for (const [uci, option] of reference.options) {
          const tested = actual.choices.get(uci)!;
          expect(tested.complete).toBe(option.complete);
          expect([...tested.replies.keys()].sort()).toEqual([...option.replies.keys()].sort());
          for (const [reply, child] of option.replies) compare(tested.replies.get(reply)!, child);
        }
      };
      compare(proof.root, expected);
    }
  });

  it('accepts every alternative first move, not only the display line', () => {
    const record = fixtures.alternatives;
    const expected = oracle(record.startFen, record.objective);
    expect(expected.options.size).toBeGreaterThan(1);
    for (const [uci, option] of expected.options) {
      const session = new PuzzleSession(record);
      expect(session.submitMove(move(uci))).toBe(option.complete ? 'complete' : 'accepted');
      if (!option.complete) {
        const [reply, child] = [...option.replies][0];
        expect(session.advanceOpponentReply(session.getSnapshot().replyToken!, reply)).toBe(true);
        expect(session.submitMove(move(child.options.keys().next().value!))).toBe('complete');
      }
    }
  });

  it('supports every legal defence of an accepted move, including off-display replies', () => {
    const record = fixtures.defences;
    const replies = oracle(record.startFen, record.objective).options.get('e4e7')!.replies;
    expect(replies.size).toBeGreaterThan(1);
    for (const [reply, child] of replies) {
      const session = new PuzzleSession(record);
      session.submitMove(move('e4e7'));
      expect(session.submitMove(move('h8g8'))).toBe('blocked');
      expect(session.advanceOpponentReply(session.getSnapshot().replyToken!, reply)).toBe(true);
      const chess = new Chess(session.getSnapshot().position!.fen);
      expect(chess.turn()).toBe('w');
      expect(session.submitMove(move(child.options.keys().next().value!))).toBe('complete');
    }
  });

  it.each(['e4e4', 'e4f6', 'a1a9', 'E4E7'])('rejects illegal/malformed %s without changing checkpoint, history or hints', uci => {
    const session = new PuzzleSession(fixtures.alternatives);
    session.requestHint();
    const before = session.getSnapshot();
    expect(session.submitMove(move(uci))).toBe('illegal');
    expect(session.getSnapshot()).toEqual(before);
  });

  it('retains a legal unsuccessful attempt, demonstrates a verified escape and retries immediately', () => {
    const session = new PuzzleSession(fixtures.unsuccessful);
    const before = session.getSnapshot();
    expect(session.submitMove(move('e4h4'))).toBe('unsuccessful');
    const snapshot = session.getSnapshot();
    expect(snapshot.position).toEqual(before.position);
    expect(snapshot.checkpoint).toEqual(before.checkpoint);
    expect(snapshot.attemptedPosition!.history.at(-1)!.san).toBe('Qh4+');
    const refutation = session.showRefutation()!;
    expect(refutation.history.at(-1)!.san).toBe('Kg8');
    const defended = new Chess(refutation.fen);
    expect(defended.moves({ verbose: true }).some(m => { defended.move(m); const mate = defended.isCheckmate(); defended.undo(); return mate; })).toBe(false);
    expect(session.showRefutation()).toEqual(refutation);
    expect(session.getSnapshot()).toEqual(snapshot);
    expect(session.retry()).toBe(true);
    expect(session.getSnapshot().position).toEqual(before.position);
    session.submitMove(move('e4h4'));
    expect(session.retry()).toBe(true); // showing a defence was not mandatory
  });

  it('restores the missed SECOND decision with earlier correct moves intact', () => {
    const session = new PuzzleSession(fixtures.alternatives);
    session.submitMove(move('e4e7'));
    session.advanceOpponentReply(session.getSnapshot().replyToken!, 'h8g8');
    const checkpoint = session.getSnapshot().position;
    expect(session.submitMove(move('e7e6'))).toBe('unsuccessful');
    session.retry();
    expect(session.getSnapshot().position).toEqual(checkpoint);
    expect(session.getSnapshot().position!.history).toHaveLength(2);
    session.restart();
    expect(session.getSnapshot().position!.history).toHaveLength(0);
  });

  it.each(['retry', 'restart', 'load', 'close'] as const)('invalidates pending replies on %s', operation => {
    const session = new PuzzleSession(fixtures.alternatives);
    session.submitMove(move('e4e7'));
    const old = session.getSnapshot().replyToken!;
    if (operation === 'load') session.load(fixtures.alternatives);
    else session[operation]();
    const before = session.getSnapshot();
    expect(session.advanceOpponentReply(old, 'h8g8')).toBe(false);
    expect(session.getSnapshot()).toEqual(before);
    if (operation !== 'close') {
      session.submitMove(move('e4e7'));
      expect(session.advanceOpponentReply(old)).toBe(false);
      const token = session.getSnapshot().replyToken!;
      expect(session.advanceOpponentReply(token)).toBe(true);
      expect(session.advanceOpponentReply(token)).toBe(false);
    }
  });

  it('rejects unprepared replies and capabilities from another session without losing the pending reply', () => {
    const a = new PuzzleSession(fixtures.alternatives), b = new PuzzleSession(fixtures.alternatives);
    a.submitMove(move('e4e7')); b.submitMove(move('e4e7'));
    const snapshot = a.getSnapshot();
    expect(a.advanceOpponentReply(b.getSnapshot().replyToken!)).toBe(false);
    expect(a.advanceOpponentReply(snapshot.replyToken!, 'h8h7')).toBe(false);
    expect(a.getSnapshot()).toEqual(snapshot);
    expect(a.advanceOpponentReply(snapshot.replyToken!)).toBe(true);
  });

  it('offers exactly three coherent hints without moving or completing, then resets for the next decision', () => {
    const session = new PuzzleSession(fixtures.alternatives);
    const before = session.getSnapshot().position;
    expect(session.getSnapshot().hints).toHaveLength(0);
    expect(session.requestHint()!.kind).toBe('concept');
    const piece = session.requestHint()!;
    expect(piece).toMatchObject({ kind: 'piece', square: 'e4' });
    expect(session.requestHint()).toMatchObject({ kind: 'destination', move: 'e4e7' });
    expect(session.requestHint()).toBeNull();
    expect(session.getSnapshot().position).toEqual(before);
    expect(session.takeCompletion()).toBeNull();
    session.submitMove(move('e4e7'));
    expect(session.requestHint()).toBeNull();
    session.advanceOpponentReply(session.getSnapshot().replyToken!);
    expect(session.getSnapshot().hints).toHaveLength(0);
    session.requestHint();
    expect(session.requestHint()).toMatchObject({ kind: 'piece', square: 'e7' });
    expect(session.requestHint()).toMatchObject({ kind: 'destination', move: 'e7g7' });
  });

  it.each(['q', 'r', 'b', 'n'] as const)('keeps capture-promotion choice %s distinct', promotion => {
    const session = new PuzzleSession(fixtures.promotion);
    const before = session.getSnapshot();
    expect(session.submitMove(move('g7h8'))).toBe('illegal');
    expect(session.getSnapshot()).toEqual(before);
    expect(session.submitMove(move('g7h8' + promotion))).toBe('complete');
    expect(session.getSnapshot().position!.history[0].promotion).toBe(promotion);
    expect(session.getSnapshot().position!.pieces.find(p => p.square === 'h8')!.type).toBe(promotion);
  });

  it('only completes a capture for the specified target, without claiming material gain', () => {
    const session = new PuzzleSession(fixtures.capture);
    expect(session.submitMove(move('d4d5'))).toBe('unsuccessful');
    expect(session.showRefutation()).toBeNull();
    session.retry();
    expect(session.submitMove(move('d4d7'))).toBe('complete');
    expect(session.getSnapshot().feedback).toBe('You captured the specified target.');
  });

  it('replays detached snapshots without changing completion, and emits completion once even after restart', () => {
    const session = new PuzzleSession(fixtures.alternatives);
    expect(session.replaySnapshot(0)).toBeNull();
    finish(session, fixtures.alternatives);
    expect(session.takeCompletion()).toEqual({ puzzleId: fixtures.alternatives.id, contentVersion: 'synthetic-v1' });
    expect(session.takeCompletion()).toBeNull();
    const before = session.getSnapshot();
    for (let ply = 0; ply <= 3; ply++) {
      const snapshot = session.replaySnapshot(ply)!;
      expect(snapshot.history).toHaveLength(ply);
      (snapshot.pieces as unknown[]).length = 0;
      expect(session.getSnapshot()).toEqual(before);
    }
    for (const invalid of [-1, 4, NaN, 0.5]) expect(session.replaySnapshot(invalid)).toBeNull();
    expect(session.submitMove(move('g8h8'))).toBe('blocked');
    session.restart(); finish(session, fixtures.alternatives);
    expect(session.takeCompletion()).toBeNull();
  });

  it('isolates caller-owned content and mutable snapshot/hint copies', () => {
    const record = clone(fixtures.immediateMate);
    const session = new PuzzleSession(record);
    record.startFen = 'broken'; record.decisions = [];
    const hint = session.requestHint()!; hint.text = 'tampered';
    const snapshot = session.getSnapshot();
    (snapshot.position!.pieces as unknown[]).length = 0;
    expect(session.getSnapshot().hints[0].text).not.toBe('tampered');
    expect(session.getSnapshot().position!.pieces).toHaveLength(3);
    expect(session.submitMove(move('e7g7'))).toBe('complete');
  });

  it.each([
    ['FEN', (r: PuzzleRecord) => { r.startFen = 'invalid'; }],
    ['player', (r: PuzzleRecord) => { r.player = 'black'; }],
    ['unsupported depth', (r: PuzzleRecord) => { r.objective = { kind: 'mate', moves: 3 } as unknown as PuzzleRecord['objective']; }],
    ['missing decision', (r: PuzzleRecord) => { r.decisions = r.decisions.slice(1); }],
    ['unreachable decision', (r: PuzzleRecord) => { r.decisions = [...r.decisions, { ...r.decisions[0], fen: fixtures.capture.startFen }]; }],
    ['missing hint', (r: PuzzleRecord) => { (r.decisions[0].hints as unknown as unknown[]).pop(); }],
    ['losing hint', (r: PuzzleRecord) => { r.decisions[0].hints[2].move = 'e4h4'; }],
    ['mismatched hints', (r: PuzzleRecord) => { r.decisions[0].hints[1].square = 'a1'; }],
    ['incomplete line', (r: PuzzleRecord) => { r.displayLine = ['e4e7']; }],
    ['illegal line', (r: PuzzleRecord) => { r.displayLine = ['e4h8']; }],
    ['incorrect setup', (r: PuzzleRecord) => { r.source = { fen: r.startFen, setupMove: 'h8g8' }; }],
  ])('fails closed for %s content', (_name, corrupt) => {
    const record = clone(fixtures.alternatives); corrupt(record);
    const session = new PuzzleSession(record);
    expect(session.getSnapshot().phase).toBe('invalid-content');
    expect(session.getSnapshot().contentError).toBeTruthy();
    expect(session.getSnapshot().position).toBeNull();
    expect(session.getSnapshot().feedback).toBeNull();
    expect(session.submitMove(move('e4e7'))).toBe('blocked');
    expect(session.requestHint()).toBeNull(); expect(session.takeCompletion()).toBeNull();
  });

  it.each([null, undefined, [], {}, { schemaVersion: 2 }, { schemaVersion: 1, id: '' }])('handles malformed unknown record %j', record => {
    expect(new PuzzleSession(record).getSnapshot().phase).toBe('invalid-content');
  });

  it('fails closed on reload and recovers through a subsequent valid load', () => {
    const session = new PuzzleSession(fixtures.alternatives);
    session.submitMove(move('e4e7')); const token = session.getSnapshot().replyToken!;
    expect(session.load({})).toBe(false);
    expect(session.advanceOpponentReply(token)).toBe(false);
    expect(session.load(fixtures.immediateMate)).toBe(true);
    finish(session, fixtures.immediateMate);
  });

  it('rejects missing hints on an off-display winning branch', () => {
    const record = clone(fixtures.defences);
    const proof = oracle(record.startFen, record.objective);
    const child = proof.options.get('e4e7')!.replies.get('a7a6')!;
    record.decisions = record.decisions.filter(d => d.fen !== child.fen);
    expect(new PuzzleSession(record).getSnapshot().contentError).toBe('Missing hints for reachable decision');
  });

  it('supports a Black-to-play objective without White-specific rules', () => {
    const record: PuzzleRecord = {
      schemaVersion: 1, id: 'black-turn-check', contentVersion: 'test-v1',
      startFen: '8/8/8/8/8/5k2/4q3/6K1 b - - 0 1', player: 'black',
      objective: { kind: 'mate', moves: 1 }, displayLine: ['e2g2'],
      decisions: [{ fen: '8/8/8/8/8/5k2/4q3/6K1 b - - 0 1', hints: [
        { kind: 'concept', text: 'Find a protected check.' },
        { kind: 'piece', text: 'Use the queen.', square: 'e2' },
        { kind: 'destination', text: 'Try g2.', move: 'e2g2' },
      ] }], completionText: 'Checkmate.',
    };
    const session = new PuzzleSession(record);
    expect(session.submitMove(move('e2g2'))).toBe('complete');
    expect(session.getSnapshot().position!.outcome).toEqual({ status: 'checkmate', winner: 'black' });
  });

  it('capture objectives can specify the pawn removed by en passant', () => {
    const fen = '7k/8/8/3pP3/8/8/8/K7 w - d6 0 2';
    const game = new ChessGame(fen);
    const record: PuzzleRecord = {
      schemaVersion: 1, id: 'en-passant-check', contentVersion: 'test-v1',
      startFen: game.fen, player: 'white', objective: { kind: 'capture', target: 'd5', piece: 'p' },
      displayLine: ['e5d6'], decisions: [{ fen: game.fen, hints: [
        { kind: 'concept', text: 'Use en passant.' },
        { kind: 'piece', text: 'Use the e5 pawn.', square: 'e5' },
        { kind: 'destination', text: 'Play e5 to d6.', move: 'e5d6' },
      ] }], completionText: 'The target pawn was captured en passant.',
    };
    const session = new PuzzleSession(record);
    expect(session.submitMove(move('e5d6'))).toBe('complete');
  });

  it.each([
    '8/8/8/8/8/8/4k3/4KQ2 w - - 0 1', // adjacent kings
    '7k/8/8/8/8/8/8/K3P3 w - - 0 1', // back-rank pawn
    '7k/8/5K2/8/7Q/8/8/8 w - - 0 1', // non-moving king already checked
    '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', // already terminal
  ])('rejects an invalid starting position %s', fen => {
    const record = clone(fixtures.alternatives); record.startFen = fen;
    expect(new PuzzleSession(record).getSnapshot().phase).toBe('invalid-content');
  });

  it('fails closed if exhaustive preparation exceeds its work budget', () => {
    const mate = new ChessGame(fixtures.immediateMate.startFen).legalMoves().find(m => m.isCheckmate)!;
    const spy = vi.spyOn(ChessGame.prototype, 'legalMoves').mockReturnValueOnce(Array(50001).fill(mate));
    try {
      const session = new PuzzleSession(fixtures.immediateMate);
      expect(session.getSnapshot().phase).toBe('invalid-content');
      expect(session.getSnapshot().contentError).toBe('Puzzle preparation budget exceeded');
    } finally { spy.mockRestore(); }
  });

  it.each([null, undefined, 42, 'e4e7', { from: '', to: 'e7' }])('rejects malformed projected intent %j without touching state', input => {
    const session = new PuzzleSession(fixtures.immediateMate);
    const before = session.getSnapshot();
    expect(session.submitMove(input as MoveRequest)).toBe('illegal');
    expect(session.getSnapshot()).toEqual(before);
  });
});
