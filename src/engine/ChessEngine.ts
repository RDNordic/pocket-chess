import type { EngineLifecycleState, EngineMove, SearchLimits } from './engineTypes';

/**
 * The only surface the rest of the application is allowed to depend on for
 * computer moves. Every UCI/Worker/Stockfish detail lives behind this -
 * callers send a FEN and get back an `EngineMove`, nothing else.
 *
 * Deliberately narrow for this phase: no `configure`/`analyse` yet (no
 * difficulty levels or post-game analysis exist yet - see build spec
 * phases 3 and 7). Extend this interface only when those phases start.
 */
export interface ChessEngine {
  /** Current lifecycle state (see `EngineLifecycleState`). */
  readonly state: EngineLifecycleState;

  /**
   * Starts the engine Worker and performs the full UCI handshake (`uci` ->
   * `uciok`, then `isready` -> `readyok`). Resolves once the engine is
   * `ready`. Can only be called once, from `uninitialised`. Rejects and
   * moves to `error` if the engine never responds (see
   * `StockfishAdapter`'s handshake timeout) - it never hangs forever.
   */
  start(): Promise<void>;

  /**
   * Sends `isready` and resolves on `readyok`. Safe to call at any point
   * after `start()` has resolved (including while a search is in flight,
   * per the UCI protocol), to confirm the engine is still responsive.
   * Bounded by the same handshake timeout as `start()`. Concurrent calls
   * share one in-flight request rather than each issuing their own
   * `isready`, so none of them can be left pending forever by a later call
   * overwriting an earlier one.
   */
  waitUntilReady(): Promise<void>;

  /**
   * Requests a bounded-time best move for `fen`. If a search is already in
   * flight, it is stopped (its own promise rejects) before this one is
   * issued - callers never need to call `stop()` themselves before
   * requesting a new move. The resolved move is not authoritative; it must
   * be validated through `ChessGame` before it can affect a game.
   */
  findBestMove(fen: string, limits: SearchLimits): Promise<EngineMove>;

  /** Cancels the current search (and any queued one), if any. */
  stop(): Promise<void>;

  /** Terminates the Worker and releases all resources. Idempotent. */
  dispose(): void;
}
