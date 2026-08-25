import type { Chess } from 'chess.js';
import type { GameStatus } from './chessTypes';

/**
 * Derives terminal/active status purely from chess.js, which is the
 * authoritative rules engine. `resigned`/`aborted` are not derivable from
 * chess.js and must be set explicitly by the application layer.
 */
export function deriveGameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isDraw()) return 'draw';
  return 'active';
}
