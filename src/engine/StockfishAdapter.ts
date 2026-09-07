import type { ChessEngine } from './ChessEngine';
import { EngineError, assertValidSearchLimits } from './engineTypes';
import type {
  EngineLifecycleState,
  EngineMove,
  EngineSessionConfig,
  SearchLimits,
} from './engineTypes';
import { skillLevelForDifficulty } from './engineDifficulty';
import { parseUciLine } from './UciParser';

/**
 * The minimal slice of the `Worker` API this adapter needs. Real usage
 * passes a genuine `Worker`; unit tests inject a fake that implements just
 * this shape, so lifecycle/stale-response behaviour can be tested without a
 * real Worker/WASM runtime (not available under Vitest's jsdom
 * environment - see `src/engine/__tests__/StockfishAdapter.test.ts`).
 */
export interface EngineWorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** Resolves the vendored engine script under the app's configured base path
 * (see vite.config.ts's `VITE_BASE_PATH`) so it works both at `/` and under
 * a sub-path deployment - the same pattern already used for the licence
 * links in `AboutScreen.tsx`. `public/engine/` is copied verbatim into
 * `dist/` by Vite, so this is a plain runtime path, not a bundled import. */
export function resolveEngineScriptUrl(): string {
  return `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`;
}

/** Wraps a real `Worker` so its DOM `MessageEvent`/`ErrorEvent` shapes never
 * leak into `EngineWorkerLike` (which intentionally only needs `.data`) -
 * keeping the interface simple enough for `FakeWorker` in tests to satisfy
 * without depending on lib.dom event constructors. */
function defaultWorkerFactory(): EngineWorkerLike {
  const worker = new Worker(resolveEngineScriptUrl());
  const wrapper: EngineWorkerLike = {
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
    onmessage: null,
    onerror: null,
  };
  worker.onmessage = (event) => wrapper.onmessage?.({ data: event.data });
  worker.onerror = (event) => wrapper.onerror?.(event);
  return wrapper;
}

/** How long to wait for `uciok`/`readyok` before treating the engine as
 * unresponsive and moving to `error`. Generous: Stockfish's own startup
 * (WASM instantiation) can legitimately take a moment on a slow device. */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

/** How long to wait for the (to-be-discarded) `bestmove` of a search we've
 * sent `stop` for, before giving up on that UCI session and recovering by
 * restarting the Worker. Short: a healthy engine replies to `stop` almost
 * immediately per the UCI protocol, so a long wait here only delays
 * detecting a genuinely wedged engine. */
const DEFAULT_STOP_TIMEOUT_MS = 5_000;

/** Fixed overhead added on top of a search's own `movetimeMs` before its
 * watchdog gives up on it. `movetimeMs` is UCI input, not a runtime
 * guarantee - a wedged Worker might never call back at all - so every
 * ordinary search is bounded independently of whether Stockfish honours
 * it. 5s comfortably covers WASM/message-passing scheduling jitter and a
 * healthy engine's own small overshoot past the requested budget. */
const DEFAULT_SEARCH_WATCHDOG_OVERHEAD_MS = 5_000;

export interface StockfishAdapterOptions {
  workerFactory?: () => EngineWorkerLike;
  /** Overrides `DEFAULT_HANDSHAKE_TIMEOUT_MS`. Exposed for tests. */
  handshakeTimeoutMs?: number;
  /** Overrides `DEFAULT_STOP_TIMEOUT_MS`. Exposed for tests. */
  stopTimeoutMs?: number;
  /** Overrides `DEFAULT_SEARCH_WATCHDOG_OVERHEAD_MS`. Exposed for tests. */
  searchWatchdogOverheadMs?: number;
}

interface PendingHandshake {
  resolve(): void;
  reject(error: Error): void;
}

/** The subset of an advertised UCI `option` this adapter needs to validate
 * capability support - see `validateCapabilities`. */
interface EngineCapability {
  optionType: string;
  min?: number;
  max?: number;
}

/** `start()`'s default when no `EngineSessionConfig` is supplied - Skill
 * Level 20 (Stockfish's own default), so omitting a config is behaviourally
 * identical to the pre-Phase-3A adapter, which never sent `setoption` at
 * all. */
const DEFAULT_SESSION_CONFIG: EngineSessionConfig = { difficulty: 'strongest' };

interface PendingSearch {
  fen: string;
  limits: SearchLimits;
  resolve(move: EngineMove): void;
  reject(error: Error): void;
}

/**
 * Owns every interaction with the Stockfish Worker: spawning it, the UCI
 * handshake, command transmission, one active search at a time, stale
 * response rejection, cancellation, timeouts/recovery, and disposal. The
 * rest of the app only ever sees the `ChessEngine` interface.
 *
 * One-active-search model: only one `go` is ever outstanding at the engine.
 * `outstanding` is that search (if any); `queued` is at most one pending
 * replacement, dispatched once `outstanding`'s terminal `bestmove` -
 * wanted or not - arrives. Superseding a search rejects it immediately
 * (`wanted: false`) and sends `stop`; when its `bestmove` eventually
 * arrives, `wanted` is checked and a stale result is discarded rather than
 * settling anything. That single-outstanding/single-queued design, not any
 * per-request identifier, is what makes a deep supersession chain
 * (A superseded by B superseded by C, ...) safe: whichever request is
 * queued when a `bestmove` finally arrives is the only one ever dispatched,
 * and every earlier one was already rejected synchronously when it was
 * superseded.
 *
 * Bounded waits, all with independent timers cleared on every path that
 * makes them moot (success, supersession, Worker error, restart,
 * disposal):
 *  - `uciok`/`readyok` are each bounded by `handshakeTimeoutMs`;
 *  - a search's own `bestmove` is bounded by `movetimeMs` *plus*
 *    `searchWatchdogOverheadMs` - `movetimeMs` is UCI input, not a runtime
 *    guarantee, so this adapter never simply trusts the engine to honour
 *    it (see `armSearchWatchdog`);
 *  - a stale `bestmove` for a search we've told the engine to `stop` is
 *    bounded by `stopTimeoutMs`.
 * Either of the latter two timing out is treated as "this Worker's UCI
 * session can no longer be trusted" and recovered the same way: tear the
 * Worker down and start a fresh one (simpler and more reliable than trying
 * to resynchronise a possibly-wedged session) - see `abandonAndRestart`/
 * `restartWorker`. Any queued search resumes once the new Worker's
 * handshake completes; if the restart's own handshake also fails, the
 * adapter moves to `error`.
 *
 * Worker generations: every restart creates a new Worker "generation"
 * (`workerGeneration`, incremented in `spawnWorker`). No asynchronous
 * handshake/search state is allowed to survive across a generation change
 * unless it's explicitly tied to the new one - `restartWorker` proactively
 * invalidates (rejects and clears) any leftover readiness state from the
 * old generation *before* the new Worker's own handshake begins, and every
 * timer (`handshake`'s own, `stopRecoveryTimer`, `searchWatchdogTimer`)
 * captures the generation it was armed for and checks it's still current
 * before mutating shared state when it fires - so a stale timer or
 * leftover promise from an old, discarded Worker can never corrupt a
 * healthy replacement's session.
 *
 * Terminal states: once `disposed` or `error`, incoming Worker
 * messages/errors are ignored outright (see `handleMessage`/
 * `handleWorkerError`) - nothing can flip the adapter back to `ready`
 * except an explicit, supported call. `dispose()` additionally detaches the
 * Worker's own `onmessage`/`onerror` callbacks as defence in depth, which
 * is also what makes generation-tagging unnecessary for message handling
 * specifically: an old Worker's callbacks are always detached before a
 * replacement is created, so a message from it can never reach
 * `handleMessage`/`handleWorkerError` at all, regardless of generation.
 */
export class StockfishAdapter implements ChessEngine {
  private readonly workerFactory: () => EngineWorkerLike;
  private readonly handshakeTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private readonly searchWatchdogOverheadMs: number;

  private worker: EngineWorkerLike | null = null;
  private lifecycleState: EngineLifecycleState = 'uninitialised';
  /** Bumped every time a new Worker is created (`spawnWorker`). See the
   * class doc comment's "Worker generations" section. */
  private workerGeneration = 0;
  private uciokPending: PendingHandshake | null = null;
  private readyokPending: PendingHandshake | null = null;
  /** Shared by every concurrent `waitUntilReady()` caller currently
   * in-flight, so a second call before the first settles never overwrites
   * `readyokPending` and orphans the first caller. Cleared once settled, so
   * the next call after that starts a fresh round trip. Always explicitly
   * invalidated (not just left to be overwritten) at the start of a
   * restart, so a new generation can never inherit an old one's in-flight
   * readiness promise. */
  private readyPromise: Promise<void> | null = null;

  /** The `Skill Level` value snapshotted from `start()`'s `config`
   * argument - validated and set exactly once (`start()` can only be
   * called once, from `uninitialised`), then resent verbatim by every
   * `performHandshake()` call for this adapter's lifetime, including every
   * Worker-restart recovery path. */
  private skillLevel = skillLevelForDifficulty(DEFAULT_SESSION_CONFIG.difficulty);

  /** Advertised UCI options collected from the current Worker generation's
   * `uci` -> `uciok` banner, keyed by option name. Cleared at the start of
   * every `spawnWorker()` call (see the class doc comment's "Worker
   * generations" section) so a restarted engine is validated purely against
   * what it itself just advertised, never a stale prior generation's. */
  private capabilities = new Map<string, EngineCapability>();

  /** The search whose `go` is currently outstanding at the engine, if any -
   * `wanted: false` once it has been stopped/superseded but its `bestmove`
   * hasn't arrived yet (still discarded when it does). */
  private outstanding: (PendingSearch & { wanted: boolean }) | null = null;
  /** At most one queued search - see the class doc comment. */
  private queued: PendingSearch | null = null;
  /** Set for the duration of a Worker restart (see `restartWorker`) -
   * `outstanding` is cleared before a restart begins, so `findBestMove`
   * also checks this flag to know a new request must queue rather than
   * dispatch straight into a Worker that hasn't handshaken yet. */
  private restarting = false;
  private stopRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private searchWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: StockfishAdapterOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    this.searchWatchdogOverheadMs =
      options.searchWatchdogOverheadMs ?? DEFAULT_SEARCH_WATCHDOG_OVERHEAD_MS;
  }

  get state(): EngineLifecycleState {
    return this.lifecycleState;
  }

  /** Re-reads `lifecycleState` through a method call rather than a direct
   * property access. TypeScript narrows `this.lifecycleState` across
   * `await` points as if nothing else could change it in between - untrue
   * here, since `dispose()` (called from elsewhere while e.g. `start()` is
   * mid-handshake) does exactly that. Routing the re-check through a call
   * defeats that stale narrowing so the "did a concurrent dispose() happen"
   * guards below actually see a fresh read. */
  private currentLifecycleState(): EngineLifecycleState {
    return this.lifecycleState;
  }

  async start(config: EngineSessionConfig = DEFAULT_SESSION_CONFIG): Promise<void> {
    if (this.lifecycleState !== 'uninitialised') {
      throw new EngineError(`cannot start engine from state "${this.lifecycleState}"`);
    }
    // Validated and snapshotted before any state transition - an invalid
    // config must leave the adapter exactly where a bad `start()` call
    // always leaves it (moved to 'error' by the catch block below), never
    // silently fall back to a default strength.
    this.lifecycleState = 'starting';
    try {
      this.skillLevel = skillLevelForDifficulty(config.difficulty);
      this.spawnWorker();
      await this.performHandshake();
      // A concurrent dispose() during the handshake already moved this to
      // 'disposed' and rejected the promise we just awaited - if we got
      // here, no such race happened.
      this.lifecycleState = 'ready';
    } catch (error) {
      if (this.currentLifecycleState() !== 'disposed') {
        this.lifecycleState = 'error';
      }
      throw error;
    }
  }

  async waitUntilReady(): Promise<void> {
    this.assertUsable();
    if (!this.readyPromise) {
      this.readyPromise = this.handshake(
        'isready',
        (pending) => {
          this.readyokPending = pending;
        },
        () => {
          this.readyokPending = null;
        },
      ).finally(() => {
        this.readyPromise = null;
      });
    }
    return this.readyPromise;
  }

  /** `uci` -> `uciok` (collecting the option lines Stockfish sends along
   * the way into `capabilities`), then validate those capabilities support
   * the snapshotted `skillLevel`, then send the two `setoption` commands
   * this adapter ever sends, then `isready` -> `readyok`. Used by both
   * `start()` and `restartWorker()`, so every recovery path re-applies the
   * same configured strength with no separate code path (build spec
   * section 13: "do not change engine options during search" - this only
   * ever runs while the adapter is not yet `ready`/`searching`). */
  private async performHandshake(): Promise<void> {
    await this.handshake(
      'uci',
      (pending) => {
        this.uciokPending = pending;
      },
      () => {
        this.uciokPending = null;
      },
    );
    this.validateCapabilities();
    this.postCommand('setoption name UCI_LimitStrength value false');
    this.postCommand(`setoption name Skill Level value ${this.skillLevel}`);
    await this.waitUntilReady();
  }

  /** Throws `EngineError` if the current Worker generation's advertised
   * capabilities (collected via `handleLine`'s `option` case since the
   * `uci` command was sent) can't support the snapshotted `skillLevel` -
   * `Skill Level` must be an advertised `spin` option whose range includes
   * `skillLevel`, and `UCI_LimitStrength` must be an advertised `check`
   * option. Thrown from inside `performHandshake`, so this fails through
   * the exact same `error`-state path as a handshake timeout or any other
   * startup failure (see `start()`/`restartWorker()`'s `catch` blocks). */
  private validateCapabilities(): void {
    const skillLevelOption = this.capabilities.get('Skill Level');
    if (!skillLevelOption || skillLevelOption.optionType !== 'spin') {
      throw new EngineError('engine does not advertise the required "Skill Level" spin option');
    }
    const { min, max } = skillLevelOption;
    if (min === undefined || max === undefined || this.skillLevel < min || this.skillLevel > max) {
      throw new EngineError(
        `engine's advertised "Skill Level" range [${min}, ${max}] does not include ${this.skillLevel}`,
      );
    }

    const limitStrengthOption = this.capabilities.get('UCI_LimitStrength');
    if (!limitStrengthOption || limitStrengthOption.optionType !== 'check') {
      throw new EngineError(
        'engine does not advertise the required "UCI_LimitStrength" check option',
      );
    }
  }

  /** Sends `command` and resolves/rejects once `registerPending`'s slot is
   * settled by an incoming reply (see `handleLine`), a Worker error, or
   * `handshakeTimeoutMs` elapsing - whichever happens first. `command`
   * is only sent once the promise executor is guaranteed to run to
   * completion, so a synchronous `postCommand` failure (no Worker) never
   * leaves an orphan timer or a dangling pending slot behind.
   *
   * Captures the Worker generation this call was made for. If the timeout
   * fires after a *different* generation has since become current (a
   * restart happened for some other reason in the meantime), `clearPending`
   * and the `error` transition are skipped - that pending slot and
   * lifecycle state now legitimately belong to the new generation, and this
   * stale timer must not touch either. The original caller's promise still
   * rejects either way; only the shared, generation-scoped side effects are
   * guarded. */
  private handshake(
    command: string,
    registerPending: (pending: PendingHandshake) => void,
    clearPending: () => void,
  ): Promise<void> {
    const generation = this.workerGeneration;
    return new Promise<void>((resolve, reject) => {
      this.postCommand(command);

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.workerGeneration === generation) {
          clearPending();
          if (this.lifecycleState !== 'disposed') {
            this.lifecycleState = 'error';
          }
        }
        reject(
          new EngineError(
            `timed out waiting for a response to "${command}" after ${this.handshakeTimeoutMs}ms`,
          ),
        );
      }, this.handshakeTimeoutMs);

      registerPending({
        resolve: () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  async findBestMove(fen: string, limits: SearchLimits): Promise<EngineMove> {
    this.assertUsable();
    if (this.lifecycleState !== 'ready' && this.lifecycleState !== 'searching') {
      throw new EngineError(`cannot search from state "${this.lifecycleState}"`);
    }
    if (typeof fen !== 'string' || fen.trim() === '') {
      throw new EngineError('findBestMove requires a non-empty FEN string');
    }
    assertValidSearchLimits(limits);

    return new Promise<EngineMove>((resolve, reject) => {
      const request: PendingSearch = { fen, limits, resolve, reject };

      // A previously queued (not yet dispatched) request is now itself
      // superseded by this newer one - only the latest queued request
      // matters.
      this.queued?.reject(new EngineError('superseded by a newer search request'));

      if (this.outstanding !== null || this.restarting) {
        this.cancelOutstandingSearch(new EngineError('superseded by a newer search request'));
        this.queued = request;
        // Stays 'searching' - the engine still has an outstanding `go` (or
        // a Worker restart) in flight; this request will dispatch once
        // that settles.
      } else {
        this.outstanding = { ...request, wanted: true };
        this.lifecycleState = 'searching';
        this.dispatchSearch(request.fen, request.limits);
      }
    });
  }

  private dispatchSearch(fen: string, limits: SearchLimits): void {
    this.postCommand(`position fen ${fen}`);
    this.postCommand(`go movetime ${limits.movetimeMs}`);
    this.armSearchWatchdog(limits);
  }

  /** Rejects and stops `outstanding` if it's still wanted, arming the
   * stop-recovery timeout. A no-op if there's nothing wanted to cancel
   * (e.g. it was already stopped by an earlier call). */
  private cancelOutstandingSearch(reason: Error): void {
    if (!this.outstanding?.wanted) {
      return;
    }
    // This search's own "did it finish in time" question is moot now that
    // it's being stopped - `stopRecoveryTimer` (armed below) takes over
    // watching for the engine to actually confirm the stop.
    this.clearSearchWatchdog();
    this.outstanding.reject(reason);
    this.outstanding.wanted = false;
    this.postCommand('stop');
    this.armStopRecoveryTimer();
  }

  /** Bounds an ordinary (not superseded/stopped) search: `movetimeMs` is
   * UCI input, not a runtime guarantee, so a Worker that silently wedges
   * after `go` (no `bestmove`, no error) would otherwise hang the caller
   * and leave the adapter `searching` forever. Captures the Worker
   * generation this search was dispatched to, and no-ops if a *different*
   * generation is current by the time it fires - a restart already
   * happened for some other reason, so this watchdog's job is already
   * done (or moot). */
  private armSearchWatchdog(limits: SearchLimits): void {
    this.clearSearchWatchdog();
    const generation = this.workerGeneration;
    const timeoutMs = limits.movetimeMs + this.searchWatchdogOverheadMs;
    this.searchWatchdogTimer = setTimeout(() => {
      this.searchWatchdogTimer = null;
      if (this.workerGeneration !== generation) {
        return;
      }
      this.abandonAndRestart(
        new EngineError(
          `search watchdog expired after ${timeoutMs}ms with no response from the engine`,
        ),
      );
    }, timeoutMs);
  }

  private clearSearchWatchdog(): void {
    if (this.searchWatchdogTimer !== null) {
      clearTimeout(this.searchWatchdogTimer);
      this.searchWatchdogTimer = null;
    }
  }

  /** Arms the "did the engine ever confirm this stop" timeout. Like
   * `armSearchWatchdog`, captures its Worker generation and no-ops on fire
   * if a different generation is already current. */
  private armStopRecoveryTimer(): void {
    this.clearStopRecoveryTimer();
    const generation = this.workerGeneration;
    this.stopRecoveryTimer = setTimeout(() => {
      this.stopRecoveryTimer = null;
      if (this.workerGeneration !== generation) {
        return;
      }
      this.abandonAndRestart(
        new EngineError('engine did not confirm it stopped searching in time'),
      );
    }, this.stopTimeoutMs);
  }

  private clearStopRecoveryTimer(): void {
    if (this.stopRecoveryTimer !== null) {
      clearTimeout(this.stopRecoveryTimer);
      this.stopRecoveryTimer = null;
    }
  }

  /** Entry point for "this Worker's UCI session can no longer be trusted",
   * reached either from the stop-recovery timeout (a stopped search never
   * got confirmed) or the search watchdog (an ordinary search never got a
   * reply at all). Rejects whatever's still genuinely outstanding, then
   * hands off to `restartWorker`. A no-op once the adapter is already
   * terminal. */
  private abandonAndRestart(reason: Error): void {
    if (this.currentLifecycleState() === 'disposed' || this.currentLifecycleState() === 'error') {
      return;
    }
    this.clearSearchWatchdog();
    this.clearStopRecoveryTimer();
    if (this.outstanding?.wanted) {
      this.outstanding.reject(reason);
    }
    this.outstanding = null;
    void this.restartWorker();
  }

  /** Tears the current Worker down and starts a fresh one - a new UCI
   * session is simpler and more reliable than trying to resynchronise a
   * possibly-desynchronised one. Proactively invalidates any leftover
   * readiness state from the old generation *before* the new Worker's own
   * handshake begins (see the class doc comment), then resumes whatever
   * was queued once the new handshake completes, or moves to `ready` if
   * nothing was queued. Moves to `error` (and rejects anything queued) if
   * the restart's own handshake also fails. */
  private async restartWorker(): Promise<void> {
    this.restarting = true;
    this.detachAndTerminateWorker();
    this.invalidateReadinessState(new EngineError('engine worker was restarted'));

    try {
      this.spawnWorker();
      await this.performHandshake();
    } catch (error) {
      this.restarting = false;
      if (this.currentLifecycleState() !== 'disposed') {
        this.lifecycleState = 'error';
        const failure = new EngineError('engine restart failed after an unresponsive search', {
          cause: error,
        });
        this.queued?.reject(failure);
        this.queued = null;
      }
      return;
    }

    this.restarting = false;
    if (this.currentLifecycleState() === 'disposed') {
      // dispose() ran while the restart's handshake was in flight - it has
      // already torn everything down; there is nothing left to resume.
      return;
    }

    const next = this.queued;
    this.queued = null;
    if (next) {
      this.outstanding = { ...next, wanted: true };
      this.lifecycleState = 'searching';
      this.dispatchSearch(next.fen, next.limits);
    } else {
      this.lifecycleState = 'ready';
    }
  }

  async stop(): Promise<void> {
    this.assertUsable();
    if (this.lifecycleState !== 'ready' && this.lifecycleState !== 'searching') {
      throw new EngineError(`cannot stop from state "${this.lifecycleState}"`);
    }
    if (this.queued) {
      this.queued.reject(new EngineError('search stopped'));
      this.queued = null;
    }
    this.cancelOutstandingSearch(new EngineError('search stopped'));
    if (!this.outstanding && !this.restarting) {
      this.lifecycleState = 'ready';
    }
  }

  dispose(): void {
    if (this.lifecycleState === 'disposed') {
      return;
    }
    const disposedError = new EngineError('engine has been disposed');
    this.clearStopRecoveryTimer();
    this.clearSearchWatchdog();
    this.restarting = false;
    this.queued?.reject(disposedError);
    this.queued = null;
    if (this.outstanding?.wanted) {
      this.outstanding.reject(disposedError);
    }
    this.outstanding = null;
    this.invalidateReadinessState(disposedError);
    this.detachAndTerminateWorker();
    this.lifecycleState = 'disposed';
  }

  /** Rejects and clears any in-flight `uci`/`isready` handshake state and
   * the shared `readyPromise` coalescing slot. Used both by `dispose()` and
   * by `restartWorker()` (there, called *before* the new Worker's own
   * handshake begins) - the shared mechanism that guarantees a new Worker
   * generation never inherits a promise/pending-slot that belongs to an
   * old one. */
  private invalidateReadinessState(reason: Error): void {
    this.readyPromise = null;
    this.uciokPending?.reject(reason);
    this.uciokPending = null;
    this.readyokPending?.reject(reason);
    this.readyokPending = null;
  }

  /** Creates a new Worker and bumps `workerGeneration` - the sole point
   * where a new Worker generation begins. */
  private spawnWorker(): void {
    this.workerGeneration += 1;
    // A new generation is validated purely against what it itself
    // advertises - see the `capabilities` field doc comment.
    this.capabilities.clear();
    this.worker = this.workerFactory();
    this.attachWorkerCallbacks();
  }

  private attachWorkerCallbacks(): void {
    if (!this.worker) {
      return;
    }
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => this.handleWorkerError(event);
  }

  /** Detaches the Worker's callbacks before terminating it - defence in
   * depth alongside the `disposed`/`error` guards in `handleMessage`/
   * `handleWorkerError`, so a message that somehow still fires from a
   * terminated Worker can't reach the adapter at all. This is also what
   * makes generation-tagging unnecessary for message handling: an old
   * Worker's callbacks are always gone before a replacement exists. */
  private detachAndTerminateWorker(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
  }

  private postCommand(command: string): void {
    if (!this.worker) {
      throw new EngineError('engine worker is not available');
    }
    this.worker.postMessage(command);
  }

  private handleMessage(data: unknown): void {
    if (this.lifecycleState === 'disposed' || this.lifecycleState === 'error') {
      // Terminal - nothing a late message says can change that.
      return;
    }
    if (typeof data !== 'string') {
      // Defensive: the vendored engine only ever posts plain UCI text
      // lines, but a malformed/unexpected payload must not crash the app.
      return;
    }
    for (const rawLine of data.split('\n')) {
      const line = rawLine.trim();
      if (line !== '') {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    const event = parseUciLine(line);
    switch (event.type) {
      case 'uciok': {
        const pending = this.uciokPending;
        this.uciokPending = null;
        pending?.resolve();
        return;
      }
      case 'readyok': {
        const pending = this.readyokPending;
        this.readyokPending = null;
        pending?.resolve();
        return;
      }
      case 'bestmove': {
        this.handleBestMove(event.move, event.ponder);
        return;
      }
      case 'option': {
        // Only the two option names this adapter ever validates/sets are
        // worth keeping - everything else the engine advertises is simply
        // not recorded (see `validateCapabilities`).
        if (event.name === 'Skill Level' || event.name === 'UCI_LimitStrength') {
          this.capabilities.set(event.name, {
            optionType: event.optionType,
            min: event.min,
            max: event.max,
          });
        }
        return;
      }
      case 'unknown':
        return;
    }
  }

  private handleBestMove(move: string | null, ponder: string | undefined): void {
    const finished = this.outstanding;
    if (!finished) {
      // Unsolicited/duplicate bestmove - nothing was outstanding to settle.
      // Deliberately does not touch lifecycle state.
      return;
    }
    this.outstanding = null;
    this.clearSearchWatchdog();
    this.clearStopRecoveryTimer();

    if (finished.wanted) {
      if (move === null) {
        finished.reject(new EngineError('engine reported no legal move for this position'));
      } else {
        finished.resolve({ uci: move, ponder });
      }
    }
    // Otherwise this is a discarded reply to a `stop` we issued for a
    // superseded/cancelled search - deliberately not surfaced to anyone.

    const next = this.queued;
    if (next) {
      this.queued = null;
      this.outstanding = { ...next, wanted: true };
      this.lifecycleState = 'searching';
      this.dispatchSearch(next.fen, next.limits);
    } else {
      this.lifecycleState = 'ready';
    }
  }

  private handleWorkerError(event: unknown): void {
    if (this.lifecycleState === 'disposed' || this.lifecycleState === 'error') {
      // Terminal - already handled (or being handled); ignore further
      // errors rather than re-processing/re-rejecting anything.
      return;
    }
    const error = new EngineError('engine worker error', { cause: event });
    this.lifecycleState = 'error';
    this.clearStopRecoveryTimer();
    this.clearSearchWatchdog();
    this.uciokPending?.reject(error);
    this.uciokPending = null;
    this.readyokPending?.reject(error);
    this.readyokPending = null;
    if (this.outstanding?.wanted) {
      this.outstanding.reject(error);
    }
    this.outstanding = null;
    this.queued?.reject(error);
    this.queued = null;
  }

  private assertUsable(): void {
    if (this.lifecycleState === 'disposed') {
      throw new EngineError('engine has been disposed');
    }
    if (this.lifecycleState === 'error') {
      throw new EngineError('engine is in an error state');
    }
  }
}
