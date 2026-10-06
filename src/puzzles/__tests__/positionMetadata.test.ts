import { describe, expect, it, vi } from 'vitest';
import { ChessGame } from '../../chess/ChessGame';
import type { SquareId } from '../../chess/chessTypes';
import { PuzzleSession } from '../PuzzleSession';
import type { PuzzleRecord } from '../puzzleTypes';

const mateFen = '6k1/4Q3/5K2/8/8/8/8/8 w - - 2 2';
const mateRecord: PuzzleRecord = {
  schemaVersion: 1, id: 'metadata-mate', contentVersion: 'test-v1',
  startFen: mateFen, player: 'white', objective: { kind: 'mate', moves: 1 },
  displayLine: ['e7g7'], decisions: [{ fen: mateFen, hints: [
    { kind: 'concept', text: 'Give checkmate.' },
    { kind: 'piece', text: 'Use the queen.', square: 'e7' },
    { kind: 'destination', text: 'Play Qg7.', move: 'e7g7' },
  ] }], completionText: 'Checkmate.',
};

function captureRecord(fen: string, solution: string, target: SquareId, piece: 'p' | 'r'): PuzzleRecord {
  const game = new ChessGame(fen);
  return {
    schemaVersion: 1, id: 'metadata-regression', contentVersion: 'test-v1',
    startFen: fen, player: game.turn, objective: { kind: 'capture', target, piece },
    displayLine: [solution], decisions: [{ fen: game.fen, hints: [
      { kind: 'concept', text: 'Capture the target.' },
      { kind: 'piece', text: 'Use this piece.', square: solution.slice(0, 2) as SquareId },
      { kind: 'destination', text: 'Capture here.', move: solution },
    ] }], completionText: 'Captured.',
  };
}
function submit(session: PuzzleSession, uci: string) {
  return session.submitMove({ from: uci.slice(0, 2) as SquareId, to: uci.slice(2, 4) as SquareId });
}

describe('puzzle FEN metadata boundary', () => {
  const malformed = [
    ['reported phantom castle', '6k1/4Q3/5K2/8/8/8/8/8 w K - 2 2', 'castling'],
    ['reported phantom en passant', '6k1/4Q3/5K2/2P5/8/8/8/8 w - b6 0 2', 'en-passant'],
    ['White kingside rook missing', '4k3/8/8/8/8/8/8/4K3 w K - 0 1', 'castling'],
    ['White queenside wrong rook colour', '4k3/8/8/8/8/8/8/r3K3 w Q - 0 1', 'castling'],
    ['Black kingside wrong piece', '4k2b/8/8/8/8/8/8/4K3 b k - 0 1', 'castling'],
    ['Black queenside king displaced', 'r4k2/8/8/8/8/8/8/4K3 b q - 0 1', 'castling'],
    ['White EP wrong pawn colour', '7k/8/8/3PP3/8/8/8/K7 w - d6 0 2', 'en-passant'],
    ['White EP target occupied', '7k/8/3n4/3pP3/8/8/8/K7 w - d6 0 2', 'en-passant'],
    ['White EP origin occupied', '7k/3n4/8/3pP3/8/8/8/K7 w - d6 0 2', 'en-passant'],
    ['White EP wrong rank', '7k/8/8/3pP3/8/8/8/K7 w - d3 0 2', 'en-passant'],
    ['Black EP missing pawn', '7k/8/8/8/4p3/8/8/K7 b - d3 0 2', 'en-passant'],
    ['Black EP wrong pawn colour', '7k/8/8/8/3pp3/8/8/K7 b - d3 0 2', 'en-passant'],
    ['Black EP target occupied', '7k/8/8/8/3Pp3/3N4/8/K7 b - d3 0 2', 'en-passant'],
    ['Black EP origin occupied', '7k/8/8/8/3Pp3/8/3N4/K7 b - d3 0 2', 'en-passant'],
    ['Black EP wrong rank', '7k/8/8/8/3Pp3/8/8/K7 b - d6 0 2', 'en-passant'],
  ];
  it.each(malformed)('rejects %s before domain evaluation, for start and source', (_name, fen, metadata) => {
    for (const location of ['start', 'source']) {
      const record = structuredClone(mateRecord);
      if (location === 'start') {
        record.startFen = fen;
        record.decisions[0].fen = fen;
      } else record.source = { fen, setupMove: 'g8h8' };
      const snapshotSpy = vi.spyOn(ChessGame.prototype, 'getSnapshot');
      const movesSpy = vi.spyOn(ChessGame.prototype, 'legalMoves');
      const fenSpy = vi.spyOn(ChessGame.prototype, 'fen', 'get');
      try {
        // A valid start is evaluated before an optional source. For a malformed
        // start, even the FEN getter (which simulates EP) must not be called.
        const session = new PuzzleSession(record);
        expect(session.getSnapshot().phase).toBe('invalid-content');
        expect(session.getSnapshot().contentError).toBe(`Inconsistent ${metadata} metadata`);
        expect(session.getSnapshot().position).toBeNull();
        expect(submit(session, 'f6h6')).toBe('blocked');
        expect(movesSpy).not.toHaveBeenCalled();
        if (location === 'start') {
          expect(snapshotSpy).not.toHaveBeenCalled();
          expect(fenSpy).not.toHaveBeenCalled();
        }
      } finally { snapshotSpy.mockRestore(); movesSpy.mockRestore(); fenSpy.mockRestore(); }
    }
  });

  it.each([
    ['w', 'e1g1', 'f1', 'g1', 'a1a8', 'a8'],
    ['w', 'e1c1', 'd1', 'c1', 'a1a8', 'a8'],
    ['b', 'e8g8', 'f8', 'g8', 'a8a1', 'a1'],
    ['b', 'e8c8', 'd8', 'c8', 'a8a1', 'a1'],
  ])('preserves legal %s castling %s', (turn, castle, rook, king, solution, target) => {
    const record = captureRecord(`r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1`, solution, target as SquareId, 'r');
    const session = new PuzzleSession(record);
    expect(session.getSnapshot().contentError).toBeNull();
    expect(submit(session, castle)).toBe('unsuccessful');
    const pieces = session.getSnapshot().attemptedPosition!.pieces;
    expect(pieces).toContainEqual({ square: rook, type: 'r', colour: record.player });
    expect(pieces).toContainEqual({ square: king, type: 'k', colour: record.player });
    expect(session.retry()).toBe(true);
    expect(submit(session, solution)).toBe('complete');
  });

  it.each([
    ['7k/8/8/3pP3/8/8/8/K7 w - d6 0 2', 'e5d6', 'd5'],
    ['7k/8/8/8/3Pp3/8/8/K7 b - d3 0 2', 'e4d3', 'd4'],
  ])('preserves legal en passant from %s', (fen, solution, target) => {
    const session = new PuzzleSession(captureRecord(fen, solution, target as SquareId, 'p'));
    expect(submit(session, solution)).toBe('complete');
    expect(session.getSnapshot().position!.pieces.some(p => p.square === target)).toBe(false);
  });

  it.each([
    // No adjacent capturer; FEN may still record the last double-pawn target.
    '8/7k/8/3p4/3Q4/8/8/K7 w - d6 0 2',
    // e5 pawn is pinned to e1 king by e8 rook; EP is structurally valid.
    '4r2k/8/8/3pP3/3Q4/8/8/4K3 w - d6 0 2',
  ])('accepts consistent EP without a legal EP capture: %s', fen => {
    const session = new PuzzleSession(captureRecord(fen, 'd4d5', 'd5', 'p'));
    expect(session.getSnapshot().contentError).toBeNull();
    expect(submit(session, 'e5d6')).toBe('illegal');
    expect(submit(session, 'd4d5')).toBe('complete');
  });

  it('accepts castling rights with a blocked path', () => {
    const session = new PuzzleSession(captureRecord('6k1/3r4/8/8/3Q4/8/8/4KB1R w K - 0 1', 'd4d7', 'd7', 'r'));
    expect(session.getSnapshot().contentError).toBeNull();
    expect(submit(session, 'e1g1')).toBe('illegal');
    expect(submit(session, 'd4d7')).toBe('complete');
  });

  it.each([
    ['r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8g8', 'a1a8', 'a8', 'r'],
    ['7k/3p4/8/4P3/8/8/8/K7 b - - 0 1', 'd7d5', 'e5d6', 'd5', 'p'],
    ['7k/8/8/8/3Pp3/8/2Q5/K7 b - d3 0 2', 'e4d3', 'c2d3', 'd3', 'p'],
  ])('preserves valid special-move source setup %s / %s', (fen, setupMove, solution, target, piece) => {
    const source = new ChessGame(fen);
    expect(source.applyUciMove(setupMove)).toBeTruthy();
    const record = captureRecord(source.fen, solution, target as SquareId, piece as 'p' | 'r');
    record.source = { fen, setupMove };
    const session = new PuzzleSession(record);
    expect(session.getSnapshot().contentError).toBeNull();
    expect(submit(session, solution)).toBe('complete');
  });
});
