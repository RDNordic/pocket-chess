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
  /** Search time budget in milliseconds. Must be a positive integer - see
   * `assertValidSearchLimits`, which every `findBestMove` call runs this
   * through before it can generate any UCI. */
  movetimeMs: number;
}

/**
 * Throws `EngineError` unless `limits` is safe to turn into UCI (`go
 * movetime <ms>`). Rejects `NaN`, `Infinity`/`-Infinity`, non-integers, and
 * zero/negative values - any of those would either produce malformed UCI or
 * a degenerate (instant/never-ending) search.
 */
export function assertValidSearchLimits(limits: SearchLimits): void {
  const { movetimeMs } = limits;
  if (!Number.isInteger(movetimeMs) || movetimeMs < 1) {
    throw new EngineError(
      `invalid search limits: movetimeMs must be a positive integer number of milliseconds, got ${movetimeMs}`,
    );
  }
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
