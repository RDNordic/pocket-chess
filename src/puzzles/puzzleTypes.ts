import type { GameStateSnapshot, PieceType, PlayerColour, SquareId } from '../chess/chessTypes';

/** M1 deliberately supports provable short objectives, not general tactics. */
export type PuzzleObjective =
  | { kind: 'mate'; moves: 1 | 2 }
  | { kind: 'capture'; target: SquareId; piece: Exclude<PieceType, 'k'> };

export type PuzzleHints = readonly [
  { kind: 'concept'; text: string },
  { kind: 'piece'; text: string; square: SquareId },
  { kind: 'destination'; text: string; move: string },
];

export interface PuzzleDecisionContent {
  /** Exact normalised FEN, including counters, for this decision. */
  fen: string;
  hints: PuzzleHints;
}

export interface PuzzleRecord {
  schemaVersion: 1;
  id: string;
  contentVersion: string;
  startFen: string;
  player: PlayerColour;
  objective: PuzzleObjective;
  /** Optional source position BEFORE its opponent setup move. */
  source?: { fen: string; setupMove: string };
  /** Display line only. Complete acceptance data is independently prepared. */
  displayLine: readonly string[];
  decisions: readonly PuzzleDecisionContent[];
  completionText: string;
}

export type PuzzlePhase = 'invalid-content' | 'player-turn' | 'opponent-turn' |
  'attempt-unsuccessful' | 'complete';

export interface PuzzleCompletion {
  puzzleId: string;
  contentVersion: string;
}

export interface PuzzleSnapshot {
  phase: PuzzlePhase;
  /** Live accepted position. Unsuccessful projections never mutate this. */
  position: GameStateSnapshot | null;
  attemptedPosition: GameStateSnapshot | null;
  checkpoint: GameStateSnapshot | null;
  hints: readonly PuzzleHints[number][];
  feedback: string | null;
  contentError: string | null;
  /** Ephemeral capability. Invalid after retry/restart/load/close/advance. */
  replyToken: symbol | null;
}
