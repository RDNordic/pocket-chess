import { describe, expect, it } from 'vitest';
import { ChessGame } from '../ChessGame';

describe('ChessGame', () => {
  it('applies a legal opening move', () => {
    const game = new ChessGame();
    const applied = game.applyMove({ from: 'e2', to: 'e4' });

    expect(applied).not.toBeNull();
    expect(applied?.san).toBe('e4');
    expect(game.turn).toBe('black');
  });

  it('rejects an illegal move without changing state', () => {
    const game = new ChessGame();
    const fenBefore = game.fen;

    const applied = game.applyMove({ from: 'e2', to: 'e5' });

    expect(applied).toBeNull();
    expect(game.fen).toBe(fenBefore);
    expect(game.turn).toBe('white');
  });

  it('supports kingside castling once squares are clear', () => {
    const game = new ChessGame();
    for (const [from, to] of [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['g2', 'g3'],
      ['g7', 'g6'],
      ['f1', 'g2'],
      ['f8', 'g7'],
    ] as const) {
      expect(game.applyMove({ from, to })).not.toBeNull();
    }

    const castle = game.applyMove({ from: 'e1', to: 'g1' });
    expect(castle).not.toBeNull();
    expect(castle?.san).toBe('O-O');
  });

  it('handles en passant capture', () => {
    const game = new ChessGame();
    const moves: Array<[string, string]> = [
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
    ];
    for (const [from, to] of moves) {
      expect(game.applyMove({ from, to })).not.toBeNull();
    }

    const enPassant = game.applyMove({ from: 'e5', to: 'd6' });
    expect(enPassant).not.toBeNull();
    expect(enPassant?.san).toBe('exd6');
  });

  it('promotes a pawn when reaching the final rank', () => {
    // White pawn one step from promotion, kings placed legally, black to move irrelevant here.
    const game = new ChessGame('7k/4P3/8/8/8/8/8/K7 w - - 0 1');

    const promoted = game.applyMove({ from: 'e7', to: 'e8', promotion: 'q' });

    expect(promoted).not.toBeNull();
    expect(promoted?.san).toBe('e8=Q+');
    expect(game.getSnapshot().pieces.some((p) => p.square === 'e8' && p.type === 'q')).toBe(true);
  });

  it('detects check', () => {
    const game = new ChessGame('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(game.getSnapshot().isCheck).toBe(true);
  });

  it('detects checkmate (scholar\'s mate)', () => {
    const game = new ChessGame();
    const moves: Array<[string, string]> = [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['d1', 'h5'],
      ['b8', 'c6'],
      ['f1', 'c4'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ];
    for (const [from, to] of moves) {
      expect(game.applyMove({ from, to })).not.toBeNull();
    }

    const snapshot = game.getSnapshot();
    expect(snapshot.status).toBe('checkmate');
  });

  it('detects stalemate', () => {
    const game = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(game.getSnapshot().status).toBe('stalemate');
  });

  it('undoes the most recent move and restores prior state', () => {
    const game = new ChessGame();
    const fenBefore = game.fen;
    game.applyMove({ from: 'e2', to: 'e4' });

    const undone = game.undoLastMove();

    expect(undone).toBe(true);
    expect(game.fen).toBe(fenBefore);
    expect(game.getSnapshot().history).toHaveLength(0);
  });

  it('produces a PGN that can reconstruct the game', () => {
    const game = new ChessGame();
    game.applyMove({ from: 'e2', to: 'e4' });
    game.applyMove({ from: 'e7', to: 'e5' });

    const restored = ChessGame.fromPgn(game.pgn);

    expect(restored.fen).toBe(game.fen);
    expect(restored.getSnapshot().history).toHaveLength(2);
  });

  it('applies engine-style UCI moves through the same legality checks', () => {
    const game = new ChessGame();
    const applied = game.applyUciMove('e2e4');
    expect(applied).not.toBeNull();
    expect(applied?.uci).toBe('e2e4');

    // It is now black's turn, so attempting to move a white pawn must fail.
    const illegal = game.applyUciMove('a2a3');
    expect(illegal).toBeNull();
  });

  it('reports legal destinations for a selected square', () => {
    const game = new ChessGame();
    expect(game.legalDestinations('e2').sort()).toEqual(['e3', 'e4']);
  });
});
