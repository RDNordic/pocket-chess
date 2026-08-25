import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessGame, ChessGameError } from '../ChessGame';

describe('ChessGame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const moves: Array<[Square, Square]> = [
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

  describe('promotion', () => {
    it('reports that a pawn reaching the final rank requires promotion', () => {
      const game = new ChessGame('7k/4P3/8/8/8/8/8/K7 w - - 0 1');
      expect(game.requiresPromotion('e7', 'e8')).toBe(true);
    });

    it('reports that an ordinary move does not require promotion', () => {
      const game = new ChessGame();
      expect(game.requiresPromotion('e2', 'e4')).toBe(false);
    });

    it('promotes to a queen when requested', () => {
      const game = new ChessGame('7k/4P3/8/8/8/8/8/K7 w - - 0 1');
      const promoted = game.applyMove({ from: 'e7', to: 'e8', promotion: 'q' });

      expect(promoted).not.toBeNull();
      expect(promoted?.san).toBe('e8=Q+');
      expect(
        game.getSnapshot().pieces.some((p) => p.square === 'e8' && p.type === 'q'),
      ).toBe(true);
    });

    it('supports underpromotion to a knight', () => {
      const game = new ChessGame('7k/4P3/8/8/8/8/8/K7 w - - 0 1');
      const promoted = game.applyMove({ from: 'e7', to: 'e8', promotion: 'n' });

      expect(promoted).not.toBeNull();
      expect(promoted?.san).toBe('e8=N');
      expect(
        game.getSnapshot().pieces.some((p) => p.square === 'e8' && p.type === 'n'),
      ).toBe(true);
    });

    it('supports underpromotion to a rook and a bishop', () => {
      for (const promotion of ['r', 'b'] as const) {
        const game = new ChessGame('7k/4P3/8/8/8/8/8/K7 w - - 0 1');
        const promoted = game.applyMove({ from: 'e7', to: 'e8', promotion });
        expect(promoted?.promotion).toBe(promotion);
      }
    });
  });

  it('detects check', () => {
    const game = new ChessGame('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(game.getSnapshot().isCheck).toBe(true);
  });

  describe('terminal outcomes', () => {
    it('detects checkmate and reports the winner (scholar\'s mate)', () => {
      const game = new ChessGame();
      const moves: Array<[Square, Square]> = [
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

      expect(game.getSnapshot().outcome).toEqual({ status: 'checkmate', winner: 'white' });
    });

    it('detects stalemate', () => {
      const game = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      expect(game.getSnapshot().outcome).toEqual({ status: 'draw', reason: 'stalemate' });
    });

    it('detects insufficient material', () => {
      const game = new ChessGame('7k/8/8/8/8/8/8/K7 w - - 0 1');
      expect(game.getSnapshot().outcome).toEqual({
        status: 'draw',
        reason: 'insufficient-material',
      });
    });

    it('detects a draw by the fifty-move rule', () => {
      // Halfmove clock at 99; one non-capture, non-pawn move pushes it to
      // 100, which chess.js treats as a fifty-move-rule draw.
      const game = new ChessGame('8/8/8/4k3/8/4K2R/8/8 w - - 99 60');
      const applied = game.applyMove({ from: 'h3', to: 'h4' });

      expect(applied).not.toBeNull();
      expect(game.getSnapshot().outcome).toEqual({
        status: 'draw',
        reason: 'fifty-move-rule',
      });
    });

    it('detects a draw by threefold repetition', () => {
      const game = new ChessGame();
      const shuffle: Array<[Square, Square]> = [
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
      ];
      for (const [from, to] of shuffle) {
        expect(game.applyMove({ from, to })).not.toBeNull();
      }

      expect(game.getSnapshot().outcome).toEqual({
        status: 'draw',
        reason: 'threefold-repetition',
      });
    });

    it('blocks further moves once the game is over', () => {
      const game = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      expect(game.isGameOver).toBe(true);
      expect(game.legalDestinations('h8')).toHaveLength(0);
    });
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

  it('undoes a castling move cleanly', () => {
    const game = new ChessGame();
    for (const [from, to] of [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['g2', 'g3'],
      ['g7', 'g6'],
      ['f1', 'g2'],
      ['f8', 'g7'],
    ] as const) {
      game.applyMove({ from, to });
    }
    const fenBeforeCastle = game.fen;
    game.applyMove({ from: 'e1', to: 'g1' });

    expect(game.undoLastMove()).toBe(true);
    expect(game.fen).toBe(fenBeforeCastle);
  });

  it('produces a PGN that can reconstruct the game', () => {
    const game = new ChessGame();
    game.applyMove({ from: 'e2', to: 'e4' });
    game.applyMove({ from: 'e7', to: 'e5' });

    const restored = ChessGame.fromPgn(game.pgn);

    expect(restored.fen).toBe(game.fen);
    expect(restored.getSnapshot().history).toHaveLength(2);
  });

  describe('move history and last move (derived live from chess.js)', () => {
    it('reflects applied moves without any independently tracked list', () => {
      const game = new ChessGame();
      game.applyMove({ from: 'e2', to: 'e4' });
      game.applyMove({ from: 'e7', to: 'e5' });

      const snapshot = game.getSnapshot();
      expect(snapshot.history.map((m) => m.san)).toEqual(['e4', 'e5']);
      expect(snapshot.lastMove).toEqual({ from: 'e7', to: 'e5' });
    });

    it('updates last move and history after undo', () => {
      const game = new ChessGame();
      game.applyMove({ from: 'e2', to: 'e4' });
      game.applyMove({ from: 'e7', to: 'e5' });
      game.undoLastMove();

      const snapshot = game.getSnapshot();
      expect(snapshot.history).toHaveLength(1);
      expect(snapshot.lastMove).toEqual({ from: 'e2', to: 'e4' });
    });

    it('has no last move on a fresh game', () => {
      const game = new ChessGame();
      expect(game.getSnapshot().lastMove).toBeUndefined();
      expect(game.getSnapshot().history).toHaveLength(0);
    });
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

  it('rejects malformed UCI strings without throwing', () => {
    const game = new ChessGame();
    expect(game.applyUciMove('')).toBeNull();
    expect(game.applyUciMove('not-a-move')).toBeNull();
    expect(game.applyUciMove('e2')).toBeNull();
  });

  it('reports legal destinations for a selected square', () => {
    const game = new ChessGame();
    expect(game.legalDestinations('e2').sort()).toEqual(['e3', 'e4']);
  });

  describe('error handling', () => {
    it('returns null for an ordinary illegal-move rejection', () => {
      const game = new ChessGame();
      expect(game.applyMove({ from: 'e2', to: 'e5' })).toBeNull();
    });

    it('does not swallow an unexpected chess.js failure as an illegal move', () => {
      vi.spyOn(Chess.prototype, 'move').mockImplementationOnce(() => {
        throw new Error('unexpected internal failure');
      });

      const game = new ChessGame();
      expect(() => game.applyMove({ from: 'e2', to: 'e4' })).toThrow(ChessGameError);
    });
  });
});
