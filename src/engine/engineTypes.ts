/**
 * Explicit engine lifecycle. Mirrors the build spec's state diagram:
 * uninitialised -> starting -> ready -> searching -> ready, plus the
 * terminal `error`/`disposed` states. `StockfishAdapter` is the only thing
 * that transitions this - callers only ever observe it.
 */
export type EngineLifecycleState =
  | 'uninitialised'
  | 'starting'
  | 'ready'
  | 'searching'
  | 'error'
  | 'disposed';

/**
 * Bounded search limits for a single `findBestMove` call. Only bounded
 * time-based search is needed for this phase (mapped to UCI `go movetime`);
 * depth-based/infinite search and multi-PV analysis are later-phase
 * concerns (post-game analysis, difficulty tuning) and are deliberately not
 * modelled here yet.
 */
export interface SearchLimits {
  /** Search time budget in milliseconds. */
  movetimeMs: number;
}

/**
 * A move proposed by the engine, in raw UCI form. This is not authoritative
 * - callers must validate it through `ChessGame` (chess.js) before it may
 * affect a game, per the project's architectural boundary.
 */
export interface EngineMove {
  /** UCI move, e.g. "e2e4" or "e7e8q". */
  uci: string;
  /** UCI ponder move, if the engine offered one. */
  ponder?: string;
}

/** Thrown for any engine adapter failure: bad lifecycle transitions, a
 * cancelled/superseded search, a worker error, or an engine response that
 * cannot be turned into a usable move. */
export class EngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EngineError';
  }
}
