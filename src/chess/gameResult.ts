import type { Chess } from 'chess.js';
import type { DrawReason, GameOutcome, PlayerColour } from './chessTypes';

function opponentOf(colour: PlayerColour): PlayerColour {
  return colour === 'white' ? 'black' : 'white';
}

/**
 * Derives the terminal outcome purely from chess.js, which is the
 * authoritative rules engine. `resigned`/`aborted` are not derivable from
 * chess.js and must be produced by an application layer that tracks those
 * actions explicitly; this function only ever returns `in-progress`,
 * `checkmate`, or `draw`.
 */
export function deriveGameOutcome(chess: Chess): GameOutcome {
  if (chess.isCheckmate()) {
    // The side to move is the side that has been checkmated.
    const checkmatedColour: PlayerColour = chess.turn() === 'w' ? 'white' : 'black';
    return { status: 'checkmate', winner: opponentOf(checkmatedColour) };
  }
  if (chess.isStalemate()) {
    return { status: 'draw', reason: 'stalemate' };
  }
  if (chess.isThreefoldRepetition()) {
    return { status: 'draw', reason: 'threefold-repetition' };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { status: 'draw', reason: 'fifty-move-rule' };
  }
  if (chess.isInsufficientMaterial()) {
    return { status: 'draw', reason: 'insufficient-material' };
  }
  return { status: 'in-progress' };
}

function capitalise(colour: PlayerColour): string {
  return colour === 'white' ? 'White' : 'Black';
}

const DRAW_REASON_LABEL: Record<DrawReason, string> = {
  stalemate: 'stalemate',
  'threefold-repetition': 'threefold repetition',
  'fifty-move-rule': 'the fifty-move rule',
  'insufficient-material': 'insufficient material',
};

/** Human-readable summary of a terminal or in-progress outcome. */
export function describeGameOutcome(outcome: GameOutcome): string {
  switch (outcome.status) {
    case 'in-progress':
      return 'In progress';
    case 'checkmate':
      return `${capitalise(outcome.winner)} wins by checkmate`;
    case 'resigned':
      return `${capitalise(outcome.winner)} wins by resignation`;
    case 'aborted':
      return 'Game aborted';
    case 'draw':
      return `Draw by ${DRAW_REASON_LABEL[outcome.reason]}`;
    default: {
      const exhaustiveCheck: never = outcome;
      return exhaustiveCheck;
    }
  }
}
