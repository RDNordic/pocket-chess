import { PuzzleSession } from '../puzzles/PuzzleSession';
import type { PreparedPuzzle } from '../puzzles/validatePuzzle';
import type { SquareId } from '../chess/chessTypes';
import { ChessGame } from '../chess/ChessGame';
import { LocalRecordError } from './storageTypes';
import type { CheckpointRecord } from './storageTypes';
import { reconstructGame, validateRecord } from './validateRecords';

const sessionIds = new WeakMap<PuzzleSession, string>();

export type CheckpointRecovery =
  | { status: 'resumed'; session: PuzzleSession }
  | { status: 'selection'; reason: 'removed' }
  | { status: 'restart'; reason: 'content-changed' | 'corrupt' | 'unsupported' };

/** Available content is the caller's deliberately activated content snapshot.
 * Never use branch indexes, saved board objects, timers or old reply tokens. */
export function recoverCheckpoint(input: unknown, available: PreparedPuzzle | null): CheckpointRecovery {
  let checkpoint: CheckpointRecord;
  try {
    const validated = validateRecord('checkpoints', input);
    if (!('kind' in validated)) return { status: 'restart', reason: 'corrupt' };
    checkpoint = validated;
  } catch (error) {
    return { status: 'restart', reason: error instanceof LocalRecordError && error.code === 'unsupported' ? 'unsupported' : 'corrupt' };
  }
  if (!available || available.record.id !== checkpoint.contentId) return { status: 'selection', reason: 'removed' };
  if (available.record.contentVersion !== checkpoint.contentVersion) return { status: 'restart', reason: 'content-changed' };
  if (reconstructGame({ startFen: checkpoint.startFen, moves: [] }).fen !== available.root.fen) return { status: 'restart', reason: 'content-changed' };
  // Scenarios need their M5 branch validator; never silently apply puzzle rules.
  if (checkpoint.kind === 'scenario') return { status: 'restart', reason: 'unsupported' };
  const session = new PuzzleSession(available.record);
  sessionIds.set(session, checkpoint.sessionId);
  for (const move of checkpoint.acceptedMoves) {
    const snapshot = session.getSnapshot();
    if (snapshot.phase === 'player-turn') {
      const result = session.submitMove({ from: move.slice(0, 2) as SquareId, to: move.slice(2, 4) as SquareId,
        ...(move.length === 5 ? { promotion: move[4] as 'q' | 'r' | 'b' | 'n' } : {}) });
      if (result !== 'accepted') return { status: 'restart', reason: 'corrupt' };
    } else if (snapshot.phase !== 'opponent-turn' || !session.advanceOpponentReply(snapshot.replyToken!, move)) {
      return { status: 'restart', reason: 'corrupt' };
    }
  }
  const snapshot = session.getSnapshot();
  if (snapshot.checkpoint?.history.length !== checkpoint.decisionPly ||
    (snapshot.phase === 'opponent-turn' && checkpoint.hintCount !== 0)) return { status: 'restart', reason: 'corrupt' };
  for (let i = 0; i < checkpoint.hintCount; i++) if (!session.requestHint()) return { status: 'restart', reason: 'corrupt' };
  return { status: 'resumed', session };
}

/** Scenario content arrives in M5. M2 defines its recovery contract without
 * implementing a scenario domain or guessing opening correctness. The trusted
 * adapter must verify the branch/decision boundary, in addition to legal replay. */
export interface ScenarioCheckpointContent {
  id: string; contentVersion: string; startFen: string;
  validateBranch: (checkpoint: CheckpointRecord, game: ChessGame) => boolean;
}
export function recoverScenarioCheckpoint(input: unknown, content: ScenarioCheckpointContent | null):
  { status: 'resumed'; game: ChessGame; checkpoint: CheckpointRecord } |
  Exclude<CheckpointRecovery, { status: 'resumed' }> {
  let checkpoint: CheckpointRecord;
  try {
    const record = validateRecord('checkpoints', input);
    if (!('kind' in record) || record.kind !== 'scenario') return { status: 'restart', reason: 'corrupt' };
    checkpoint = record;
  } catch (error) {
    return { status: 'restart', reason: error instanceof LocalRecordError && error.code === 'unsupported' ? 'unsupported' : 'corrupt' };
  }
  if (!content || content.id !== checkpoint.contentId) return { status: 'selection', reason: 'removed' };
  if (content.contentVersion !== checkpoint.contentVersion) return { status: 'restart', reason: 'content-changed' };
  try {
    // Use the shared position boundary before any chess.js evaluation.
    if (reconstructGame({ startFen: checkpoint.startFen, moves: [] }).fen !== reconstructGame({ startFen: content.startFen, moves: [] }).fen) {
      return { status: 'restart', reason: 'content-changed' };
    }
    const game = reconstructGame({ startFen: content.startFen, moves: checkpoint.acceptedMoves });
    if (game.isGameOver || !content.validateBranch(structuredClone(checkpoint), ChessGame.fromPgn(game.pgn))) {
      return { status: 'restart', reason: 'corrupt' };
    }
    return { status: 'resumed', game, checkpoint };
  } catch { return { status: 'restart', reason: 'corrupt' }; }
}

/** Failed attempt projections are not persisted; resume returns to the accepted
 * decision. A pending accepted move is replayed with a new opponent capability. */
export function captureCheckpoint(session: PuzzleSession, content: PreparedPuzzle, revision: number): CheckpointRecord {
  const snapshot = session.getSnapshot();
  if (!snapshot.position || !snapshot.checkpoint || snapshot.phase === 'complete' || snapshot.phase === 'invalid-content') {
    throw new Error('No unfinished puzzle to checkpoint');
  }
  const checkpoint: CheckpointRecord = {
    schemaVersion: 2, kind: 'puzzle', contentId: content.record.id, contentVersion: content.record.contentVersion,
    sessionId: sessionIds.get(session) ?? globalThis.crypto.randomUUID(), startFen: content.root.fen,
    revision, acceptedMoves: snapshot.position.history.map(move => move.uci),
    decisionPly: snapshot.checkpoint.history.length,
    hintCount: snapshot.phase === 'player-turn' ? snapshot.hints.length : 0,
  };
  sessionIds.set(session, checkpoint.sessionId);
  if (recoverCheckpoint(checkpoint, content).status !== 'resumed') throw new Error('Session does not match checkpoint content');
  return checkpoint;
}
