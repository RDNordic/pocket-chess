import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { deriveGameOutcome } from './gameResult';
import type {
  AppliedMove,
  BoardPiece,
  GameStateSnapshot,
  MoveRequest,
  PieceType,
  PlayerColour,
  PromotionPiece,
  SquareId,
} from './chessTypes';

function toColour(chessJsColour: 'w' | 'b'): PlayerColour {
  return chessJsColour === 'w' ? 'white' : 'black';
}

/**
 * Thrown by `ChessGame` methods when chess.js raises something other than
 * its own ordinary move-rejection error (e.g. malformed input reaching the
 * library, or an unexpected internal failure). This is deliberately never
 * caught internally: an ordinary illegal-move attempt returns `null`, but a
 * genuine programming error or unexpected library failure must not be
 * silently reinterpreted as "the user tried an illegal move" - that
 * distinction matters once move requests can also originate from an
 * engine or puzzle solution rather than direct human input.
 */
export class ChessGameError extends Error {}

// chess.js reports both syntactically malformed and ruleset-illegal move
// attempts as a plain `Error` with a message that always starts this way.
// See node_modules/chess.js/dist/esm/chess.js.
const INVALID_MOVE_MESSAGE = /^invalid move/i;

function isOrdinaryInvalidMoveError(error: unknown): error is Error {
  return error instanceof Error && INVALID_MOVE_MESSAGE.test(error.message);
}

function toAppliedMove(move: Move): AppliedMove {
  return {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    from: move.from,
    to: move.to,
    promotion: move.promotion as PromotionPiece | undefined,
    captured: move.captured as PieceType | undefined,
    // chess.js's own SAN generation is the authoritative source for
    // check/checkmate suffixes; deriving from it avoids a second
    // independent check computation.
    isCheck: move.san.includes('+') || move.san.includes('#'),
    isCheckmate: move.san.includes('#'),
  };
}

/**
 * Authoritative chess domain wrapper. This is the single source of truth
 * for board position, legality, move history, and terminal outcome.
 * chess.js's own history is the only representation of applied moves - no
 * parallel move list is maintained here, so there is nothing that can drift
 * out of sync with it. React components and the future engine adapter must
 * go through this class rather than touching chess.js directly.
 */
export class ChessGame {
  private readonly chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  /** Reconstructs a game from a PGN game record (e.g. loaded from storage). */
  static fromPgn(pgn: string): ChessGame {
    const game = new ChessGame();
    game.chess.loadPgn(pgn);
    return game;
  }

  /** Legal destination squares for a given source square, in UCI form. */
  legalDestinations(from: SquareId): SquareId[] {
    return this.chess.moves({ square: from as Square, verbose: true }).map((move) => move.to);
  }

  /**
   * Whether moving from `from` to `to` requires the player to choose a
   * promotion piece. Delegates to chess.js's own move descriptor rather
   * than reimplementing the "pawn reaches the final rank" rule, so callers
   * (e.g. the board UI) never need their own copy of that rule.
   */
  requiresPromotion(from: SquareId, to: SquareId): boolean {
    return this.chess
      .moves({ square: from as Square, verbose: true })
      .some((move) => move.to === to && move.isPromotion());
  }

  /**
   * Attempts to apply a move. Returns the applied move on success, or null
   * if chess.js rejects it as an ordinary illegal/malformed move attempt.
   * State is never mutated on a rejected attempt. Any other failure (a
   * genuine programming error or unexpected library behaviour) is not
   * swallowed and propagates as a `ChessGameError`.
   */
  applyMove(request: MoveRequest): AppliedMove | null {
    let move;
    try {
      move = this.chess.move({
        from: request.from as Square,
        to: request.to as Square,
        promotion: request.promotion,
      });
    } catch (error) {
      if (isOrdinaryInvalidMoveError(error)) {
        return null;
      }
      throw new ChessGameError('Unexpected failure while applying a move', { cause: error });
    }
    return toAppliedMove(move);
  }

  /** Applies a move given in raw UCI form (e.g. engine output). */
  applyUciMove(uci: string): AppliedMove | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) {
      return null;
    }
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci.slice(4, 5) as PromotionPiece) : undefined;
    return this.applyMove({ from: from as Square, to: to as Square, promotion });
  }

  /** Undoes the most recent move, if any. Returns whether a move was undone. */
  undoLastMove(): boolean {
    return this.chess.undo() !== null;
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

  /** Full applied-move history, derived live from chess.js on every call. */
  get history(): readonly AppliedMove[] {
    return this.chess.history({ verbose: true }).map(toAppliedMove);
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
    const history = this.history;
    const lastApplied = history[history.length - 1];
    return {
      fen: this.fen,
      turn: this.turn,
      outcome: deriveGameOutcome(this.chess),
      isCheck: this.chess.isCheck(),
      pieces: this.pieces(),
      lastMove: lastApplied ? { from: lastApplied.from, to: lastApplied.to } : undefined,
      history,
    };
  }
}
