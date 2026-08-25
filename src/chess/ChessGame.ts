import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { deriveGameStatus } from './gameResult';
import type {
  AppliedMove,
  BoardPiece,
  GameStateSnapshot,
  MoveRequest,
  PlayerColour,
} from './chessTypes';

function toColour(chessJsColour: 'w' | 'b'): PlayerColour {
  return chessJsColour === 'w' ? 'white' : 'black';
}

/**
 * Authoritative chess domain wrapper. This is the single source of truth
 * for board position, legality, and terminal state. React components and
 * the engine adapter must go through this class rather than touching
 * chess.js directly.
 */
export class ChessGame {
  private readonly chess: Chess;
  private appliedMoves: AppliedMove[] = [];

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  /** Reconstructs a game from a PGN game record (e.g. loaded from storage). */
  static fromPgn(pgn: string): ChessGame {
    const game = new ChessGame();
    game.chess.loadPgn(pgn);
    game.appliedMoves = game.chess.history({ verbose: true }).map((move) => ({
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      from: move.from,
      to: move.to,
      promotion: move.promotion as AppliedMove['promotion'],
      captured: move.captured,
      isCheck: move.san.includes('+') || move.san.includes('#'),
      isCheckmate: move.san.includes('#'),
    }));
    return game;
  }

  /** Legal destination squares for a given source square, in UCI form. */
  legalDestinations(from: string): string[] {
    return this.chess
      .moves({ square: from as Square, verbose: true })
      .map((move) => move.to);
  }

  /**
   * Attempts to apply a move. Returns the applied move on success, or null
   * if the move is illegal. State is never mutated on an illegal attempt.
   */
  applyMove(request: MoveRequest): AppliedMove | null {
    try {
      const move = this.chess.move({
        from: request.from as Square,
        to: request.to as Square,
        promotion: request.promotion,
      });
      const applied: AppliedMove = {
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        from: move.from,
        to: move.to,
        promotion: move.promotion as AppliedMove['promotion'],
        captured: move.captured,
        isCheck: this.chess.isCheck(),
        isCheckmate: this.chess.isCheckmate(),
      };
      this.appliedMoves.push(applied);
      return applied;
    } catch {
      return null;
    }
  }

  /** Applies a move given in raw UCI form (e.g. engine output). */
  applyUciMove(uci: string): AppliedMove | null {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci.slice(4, 5) as AppliedMove['promotion']) : undefined;
    return this.applyMove({ from, to, promotion });
  }

  /** Undoes the most recent move, if any. Returns whether a move was undone. */
  undoLastMove(): boolean {
    const undone = this.chess.undo();
    if (undone) {
      this.appliedMoves.pop();
    }
    return undone !== null;
  }

  get turn(): PlayerColour {
    return toColour(this.chess.turn());
  }

  get fen(): string {
    return this.chess.fen();
  }

  get pgn(): string {
    return this.chess.pgn();
  }

  get isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  private pieces(): BoardPiece[] {
    const pieces: BoardPiece[] = [];
    for (const row of this.chess.board()) {
      for (const square of row) {
        if (square) {
          pieces.push({
            square: square.square,
            type: square.type,
            colour: toColour(square.color),
          });
        }
      }
    }
    return pieces;
  }

  /** Full immutable snapshot of the current state, for UI rendering. */
  getSnapshot(): GameStateSnapshot {
    const lastApplied = this.appliedMoves[this.appliedMoves.length - 1];
    return {
      fen: this.fen,
      turn: this.turn,
      status: deriveGameStatus(this.chess),
      isCheck: this.chess.isCheck(),
      pieces: this.pieces(),
      lastMove: lastApplied ? { from: lastApplied.from, to: lastApplied.to } : undefined,
      history: [...this.appliedMoves],
    };
  }
}
