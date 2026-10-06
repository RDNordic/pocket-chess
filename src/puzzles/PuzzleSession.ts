import { ChessGame } from '../chess/ChessGame';
import type { GameStateSnapshot, MoveRequest } from '../chess/chessTypes';
import type { PuzzleCompletion, PuzzleHints, PuzzlePhase, PuzzleSnapshot } from './puzzleTypes';
import { PuzzleContentError, validatePuzzle } from './validatePuzzle';
import type { PreparedDecision, PreparedPuzzle, PuzzleChoice } from './validatePuzzle';

/** Headless use case. No UI, timers, engine, storage or award implementation. */
export class PuzzleSession {
  private prepared: PreparedPuzzle | null = null;
  private game: ChessGame | null = null;
  private decision: PreparedDecision | null = null;
  private checkpointPgn = '';
  private phase: PuzzlePhase = 'invalid-content';
  private error: string | null = 'No puzzle loaded';
  private attempted: ChessGame | null = null;
  private refutation: string | null = null;
  private hintCount = 0;
  private pending: { token: symbol; choice: PuzzleChoice } | null = null;
  private completedOnce = false;
  private completion: PuzzleCompletion | null = null;

  constructor(record?: unknown) { if (record !== undefined) this.load(record); }

  load(record: unknown): boolean {
    this.clear();
    this.completedOnce = false;
    this.completion = null;
    try { this.prepared = validatePuzzle(record); } catch (error) {
      if (!(error instanceof PuzzleContentError)) throw error;
      this.error = error.message; return false;
    }
    this.game = new ChessGame(this.prepared.root.fen);
    this.decision = this.prepared.root;
    this.checkpointPgn = this.game.pgn;
    this.error = null;
    this.phase = 'player-turn';
    return true;
  }

  private clear(): void {
    this.prepared = null; this.game = null; this.decision = null;
    this.checkpointPgn = ''; this.attempted = null; this.refutation = null;
    this.hintCount = 0; this.pending = null; this.phase = 'invalid-content';
  }

  /** Cancels session work; a captured opponent capability can no longer apply. */
  close(): void { this.clear(); this.completion = null; this.error = 'Session closed'; }

  submitMove(request: MoveRequest): 'illegal' | 'blocked' | 'unsuccessful' | 'accepted' | 'complete' {
    if (this.phase !== 'player-turn' || !this.game || !this.decision) return 'blocked';
    const projected = this.game.projectMove(request);
    if (!projected) return 'illegal';
    const applied = projected.history.at(-1)!;
    const choice = this.decision.choices.get(applied.uci);
    if (!choice) {
      const failure = this.decision.failures.get(applied.uci);
      if (!failure) throw new Error('Validated decision is missing a legal move');
      this.attempted = projected;
      this.refutation = failure.reply;
      this.phase = 'attempt-unsuccessful';
      return 'unsuccessful';
    }
    // Projection validated the intent; the sole accepted live game applies it.
    if (!this.game.applyMove(request)) throw new Error('Validated player move failed');
    this.hintCount = 0;
    if (choice.complete) {
      this.phase = 'complete';
      if (!this.completedOnce) {
        this.completedOnce = true;
        this.completion = { puzzleId: this.prepared!.record.id, contentVersion: this.prepared!.record.contentVersion };
      }
      return 'complete';
    }
    this.pending = { token: Symbol('puzzle reply'), choice };
    this.phase = 'opponent-turn';
    return 'accepted';
  }

  /** The future UI schedules this; stale capabilities are harmless no-ops.
   * Optional move lets tests/review exercise every prepared legal defence. */
  advanceOpponentReply(token: symbol, move?: string): boolean {
    if (this.phase !== 'opponent-turn' || !this.pending || token !== this.pending.token || !this.game) return false;
    const ply = this.game.history.length;
    const display = this.prepared!.record.displayLine;
    const followsDisplay = this.game.history.every((m, i) => m.uci === display[i]);
    const selected = move ?? (followsDisplay ? display[ply] : undefined) ?? this.pending.choice.replies.keys().next().value;
    if (!selected) return false;
    const next = this.pending.choice.replies.get(selected);
    if (!next) return false;
    if (!this.game.applyUciMove(selected)) throw new Error('Validated defence failed');
    this.pending = null;
    this.decision = next;
    this.checkpointPgn = this.game.pgn;
    this.hintCount = 0;
    this.phase = 'player-turn';
    return true;
  }

  requestHint(): PuzzleHints[number] | null {
    if (this.phase !== 'player-turn' || !this.decision || this.hintCount >= 3) return null;
    if (!this.decision.content) throw new Error('Validated decision is missing hints');
    const hint = this.decision.content.hints[this.hintCount++];
    return { ...hint };
  }

  /** Optional verified escape demonstration; never alters accepted history. */
  showRefutation(): GameStateSnapshot | null {
    if (this.phase !== 'attempt-unsuccessful' || !this.attempted || !this.refutation) return null;
    const demo = ChessGame.fromPgn(this.attempted.pgn);
    if (!demo.applyUciMove(this.refutation)) throw new Error('Validated refutation failed');
    return demo.getSnapshot();
  }

  retry(): boolean {
    if (!this.game || !this.decision || this.phase === 'complete') return false;
    this.game = ChessGame.fromPgn(this.checkpointPgn);
    this.attempted = null; this.refutation = null; this.pending = null;
    this.hintCount = 0; this.phase = 'player-turn';
    return true;
  }

  restart(): boolean {
    if (!this.prepared) return false;
    this.game = new ChessGame(this.prepared.root.fen);
    this.decision = this.prepared.root;
    this.checkpointPgn = this.game.pgn;
    this.attempted = null; this.refutation = null; this.pending = null;
    this.hintCount = 0; this.phase = 'player-turn';
    // Restart/re-solving does not re-emit a consumed completion for this load.
    return true;
  }

  /** Single-consumer completion intent, not a persistent achievement award. */
  takeCompletion(): PuzzleCompletion | null {
    const result = this.completion;
    this.completion = null;
    return result ? { ...result } : null;
  }

  getSnapshot(): PuzzleSnapshot {
    const hints = this.decision?.content?.hints.slice(0, this.hintCount).map(h => ({ ...h })) ?? [];
    const feedback = this.phase === 'complete' ? this.prepared!.record.completionText :
      this.phase === 'attempt-unsuccessful' ? (this.prepared!.record.objective.kind === 'mate'
        ? 'This move does not force checkmate within the remaining moves.'
        : 'This move does not capture the specified target.') : null;
    return {
      phase: this.phase, position: this.game?.getSnapshot() ?? null,
      attemptedPosition: this.attempted?.getSnapshot() ?? null,
      checkpoint: this.game ? ChessGame.fromPgn(this.checkpointPgn).getSnapshot() : null,
      hints, feedback, contentError: this.error, replyToken: this.pending?.token ?? null,
    };
  }

  /** Replay of the actual accepted path, available only at completion. Copies
   * are detached; replay has no phase/cursor mutation and emits no events. */
  replaySnapshot(ply: number): GameStateSnapshot | null {
    if (this.phase !== 'complete' || !this.game || !this.prepared || !Number.isInteger(ply) ||
      ply < 0 || ply > this.game.history.length) return null;
    const replay = new ChessGame(this.prepared.root.fen);
    for (const move of this.game.history.slice(0, ply)) {
      if (!replay.applyUciMove(move.uci)) throw new Error('Accepted replay move failed');
    }
    return replay.getSnapshot();
  }
}
