import type { Square } from 'chess.js';

export type PlayerColour = 'white' | 'black';

/** Re-export of chess.js's own constrained square-id union. */
export type SquareId = Square;

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface MoveRequest {
  from: SquareId;
  to: SquareId;
  promotion?: PromotionPiece;
}

export interface AppliedMove {
  san: string;
  uci: string;
  from: SquareId;
  to: SquareId;
  promotion?: PromotionPiece;
  captured?: PieceType;
  isCheck: boolean;
  isCheckmate: boolean;
}

export interface BoardPiece {
  square: SquareId;
  type: PieceType;
  colour: PlayerColour;
}

/** Why a drawn game was drawn, matching distinct chess.js draw predicates. */
export type DrawReason =
  | 'stalemate'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'insufficient-material';

/**
 * Explicit terminal-outcome model. `resigned`/`aborted` are not derivable
 * from chess.js and can only be produced by an application layer that
 * tracks a resignation/abort action explicitly (no such action exists yet
 * in this phase) - they are included so the shape is already suitable for
 * later persistence.
 */
export type GameOutcome =
  | { status: 'in-progress' }
  | { status: 'checkmate'; winner: PlayerColour }
  | { status: 'draw'; reason: DrawReason }
  | { status: 'resigned'; winner: PlayerColour }
  | { status: 'aborted' };

export interface GameStateSnapshot {
  fen: string;
  turn: PlayerColour;
  outcome: GameOutcome;
  isCheck: boolean;
  pieces: readonly BoardPiece[];
  lastMove?: { from: SquareId; to: SquareId };
  history: readonly AppliedMove[];
}
