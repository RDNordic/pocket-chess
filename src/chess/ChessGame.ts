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

// chess.js's own `moves({ square })` treats a falsy `square` (e.g. `''` or
// `null`) as "no filter" and returns every legal move in the position
// rather than rejecting it - this is a documented quirk of that API, not a
// bug in chess.js. Runtime data reaching this class isn't guaranteed to
// satisfy the `SquareId` type the way TypeScript callers are (a future
// engine, puzzle, or PGN-import source could hand this a malformed or
// empty string), so every entry point that forwards a square into
// `moves({ square })` validates its shape first rather than relying on
// chess.js to reject it.
const SQUARE_PATTERN = /^[a-h][1-8]$/;

function isSquareId(value: unknown): value is SquareId {
  return typeof value === 'string' && SQUARE_PATTERN.test(value);
}

/**
 * Thrown by `ChessGame` methods when chess.js raises something other than
 * an ordinary move-rejection (e.g. an unexpected internal failure on a move
 * this class had already confirmed was legal). This is deliberately never
 * caught internally: an ordinary illegal-move attempt returns `null`, but a
 * genuine programming error or unexpected library failure must not be
 * silently reinterpreted as "the user tried an illegal move" - that
 * distinction matters once move requests can also originate from an
 * engine or puzzle solution rather than direct human input.
 */
export class ChessGameError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ChessGameError';
  }
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

  /** Legal moves including distinct promotion choices; no board mutation. */
  legalMoves(): readonly AppliedMove[] {
    return this.chess.moves({ verbose: true }).map(toAppliedMove);
  }

  /** Disposable domain-owned projection retaining history/draw semantics. */
  projectMove(request: MoveRequest): ChessGame | null {
    if (!request || typeof request !== 'object') return null;
    const projected = ChessGame.fromPgn(this.pgn);
    return projected.applyMove(request) ? projected : null;
  }

  /**
   * Legal destination squares for a given source square. A pawn one step
   * from promotion has four verbose move descriptors from chess.js (one per
   * promotion piece) that all share the same destination square, so this
   * dedupes them - callers here want distinct squares to highlight, not one
   * entry per underlying move.
   */
  legalDestinations(from: SquareId): SquareId[] {
    if (!isSquareId(from)) {
      return [];
    }
    const destinations = this.chess
      .moves({ square: from, verbose: true })
      .map((move) => move.to);
    return [...new Set(destinations)];
  }

  /**
   * Whether moving from `from` to `to` requires the player to choose a
   * promotion piece. Delegates to chess.js's own move descriptor rather
   * than reimplementing the "pawn reaches the final rank" rule, so callers
   * (e.g. the board UI) never need their own copy of that rule.
   */
  requiresPromotion(from: SquareId, to: SquareId): boolean {
    if (!isSquareId(from)) {
      return false;
    }
    return this.chess
      .moves({ square: from, verbose: true })
      .some((move) => move.to === to && move.isPromotion());
  }

  /**
   * Attempts to apply a move. Returns the applied move on success, or null
   * if the request does not match one of chess.js's own legal-move
   * descriptors for the source square (an ordinary illegal move, a
   * malformed source/destination/promotion, or a promotion request that
   * doesn't match what the position actually requires). State is never
   * mutated on a rejected attempt.
   *
   * `request.from`/`request.to` are validated as real square shapes before
   * they ever reach chess.js's `moves({ square })` - a falsy value there
   * (e.g. `''`, from malformed runtime data such as engine/puzzle/PGN
   * input that doesn't actually satisfy the `SquareId` type at runtime)
   * would otherwise be treated by chess.js as "no filter" and return every
   * legal move in the position, which could then wrongly satisfy the
   * `candidate.to === request.to` check below for an unrelated move.
   * `candidate.from === request.from` is also checked explicitly as a
   * second, independent guard against exactly that failure mode, so this
   * does not rely on the shape check alone.
   *
   * Legality is otherwise checked against `chess.moves({ square, verbose:
   * true })` *before* calling chess.js's own `move()`, rather than by
   * pattern-matching chess.js's error message text - that message is
   * undocumented library wording, not a contract. Because of that
   * pre-check, `move()` is only ever called with something this class has
   * already confirmed is legal, so if it still throws, that is a genuine
   * unexpected failure (programming error or library bug), not a rejected
   * user move - it is not swallowed and propagates as a `ChessGameError`.
   */
  applyMove(request: MoveRequest): AppliedMove | null {
    if (!isSquareId(request.from) || !isSquareId(request.to)) {
      return null;
    }

    const legalMoves = this.chess.moves({ square: request.from, verbose: true });
    const isLegal = legalMoves.some(
      (candidate) =>
        candidate.from === request.from &&
        candidate.to === request.to &&
        (candidate.promotion ?? undefined) === request.promotion,
    );
    if (!isLegal) {
      return null;
    }

    let move;
    try {
      move = this.chess.move({
        from: request.from,
        to: request.to,
        promotion: request.promotion,
      });
    } catch (error) {
      throw new ChessGameError(
        'chess.js rejected a move this class had already confirmed was legal',
        { cause: error },
      );
    }
    return toAppliedMove(move);
  }

  /**
   * Applies a move given in raw UCI form (e.g. engine output). The contract
   * is deliberately lowercase-only, matching both the real UCI protocol
   * (engines like Stockfish always emit lowercase square/promotion
   * letters) and this class's own `SquareId`/`isSquareId` shape, which
   * accept lowercase only. This regex previously had a case-insensitive
   * flag that accepted uppercase input (e.g. `'E2E4'`) here but not in
   * `applyMove()`'s own `isSquareId` check, so such input silently fell
   * through to a `null` rejection from a different, undocumented reason
   * than "malformed UCI string" - inconsistent enough to be worth fixing
   * outright now, before a real engine adapter is built on top of this.
   * Uppercase UCI input is rejected here, at the clearest boundary, rather
   * than silently normalised - a well-formed UCI source should never send
   * it in the first place.
   */
  applyUciMove(uci: string): AppliedMove | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
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
