import type { ChessEngine } from './ChessEngine';
import { EngineError, assertValidSearchLimits } from './engineTypes';
import type { EngineLifecycleState, EngineMove, SearchLimits } from './engineTypes';
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

export interface StockfishAdapterOptions {
  workerFactory?: () => EngineWorkerLike;
  /** Overrides `DEFAULT_HANDSHAKE_TIMEOUT_MS`. Exposed for tests. */
  handshakeTimeoutMs?: number;
  /** Overrides `DEFAULT_STOP_TIMEOUT_MS`. Exposed for tests. */
  stopTimeoutMs?: number;
}

interface PendingHandshake {
  resolve(): void;
  reject(error: Error): void;
}

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
 * Bounded waits: `uciok`/`readyok` are each bounded by `handshakeTimeoutMs`
 * (timing out moves the adapter to `error` and rejects the caller). A
 * search's own `bestmove` is bounded by its own `movetimeMs` (a healthy
 * engine honours that itself - see engineTypes.assertValidSearchLimits).
 * The one wait with no caller-supplied bound - a stale `bestmove` for a
 * search we've told the engine to `stop` - is bounded by `stopTimeoutMs`;
 * on timeout the Worker is torn down and recreated (a fresh UCI session is
 * simpler and more reliable than trying to recover a potentially
 * desynchronised one), and any queued search is resumed once the new
 * Worker's handshake completes.
 *
 * Terminal states: once `disposed` or `error`, incoming Worker
 * messages/errors are ignored outright (see `handleMessage`/
 * `handleWorkerError`) - nothing can flip the adapter back to `ready`
 * except an explicit, supported call. `dispose()` additionally detaches the
 * Worker's own `onmessage`/`onerror` callbacks as defence in depth.
 */
export class StockfishAdapter implements ChessEngine {
  private readonly workerFactory: () => EngineWorkerLike;
  private readonly handshakeTimeoutMs: number;
  private readonly stopTimeoutMs: number;

  private worker: EngineWorkerLike | null = null;
  private lifecycleState: EngineLifecycleState = 'uninitialised';
  private uciokPending: PendingHandshake | null = null;
  private readyokPending: PendingHandshake | null = null;
  /** Shared by every concurrent `waitUntilReady()` caller currently
   * in-flight, so a second call before the first settles never overwrites
   * `readyokPending` and orphans the first caller. Cleared once settled, so
   * the next call after that starts a fresh round trip. */
  private readyPromise: Promise<void> | null = null;

  /** The search whose `go` is currently outstanding at the engine, if any -
   * `wanted: false` once it has been stopped/superseded but its `bestmove`
   * hasn't arrived yet (still discarded when it does). */
  private outstanding: (PendingSearch & { wanted: boolean }) | null = null;
  /** At most one queued search - see the class doc comment. */
  private queued: PendingSearch | null = null;
  /** Set for the duration of a Worker restart (see `recoverFromUnresponsiveStop`) -
   * `outstanding` is cleared before a restart begins, so `findBestMove`
   * also checks this flag to know a new request must queue rather than
   * dispatch straight into a Worker that hasn't handshaken yet. */
  private restarting = false;
  private stopRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: StockfishAdapterOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
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

  async start(): Promise<void> {
    if (this.lifecycleState !== 'uninitialised') {
      throw new EngineError(`cannot start engine from state "${this.lifecycleState}"`);
    }
    this.lifecycleState = 'starting';
    try {
      this.worker = this.workerFactory();
      this.attachWorkerCallbacks();
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
    await this.waitUntilReady();
  }

  /** Sends `command` and resolves/rejects once `registerPending`'s slot is
   * settled by an incoming reply (see `handleLine`), a Worker error, or
   * `handshakeTimeoutMs` elapsing - whichever happens first. A timeout
   * clears the slot, moves the adapter to `error`, and rejects. `command`
   * is only sent once the promise executor is guaranteed to run to
   * completion, so a synchronous `postCommand` failure (no Worker) never
   * leaves an orphan timer or a dangling pending slot behind. */
  private handshake(
    command: string,
    registerPending: (pending: PendingHandshake) => void,
    clearPending: () => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.postCommand(command);

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearPending();
        if (this.lifecycleState !== 'disposed') {
          this.lifecycleState = 'error';
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
  }

  /** Rejects and stops `outstanding` if it's still wanted, arming the
   * stop-recovery timeout. A no-op if there's nothing wanted to cancel
   * (e.g. it was already stopped by an earlier call). */
  private cancelOutstandingSearch(reason: Error): void {
    if (!this.outstanding?.wanted) {
      return;
    }
    this.outstanding.reject(reason);
    this.outstanding.wanted = false;
    this.postCommand('stop');
    this.armStopRecoveryTimer();
  }

  private armStopRecoveryTimer(): void {
    this.clearStopRecoveryTimer();
    this.stopRecoveryTimer = setTimeout(() => {
      this.stopRecoveryTimer = null;
      void this.recoverFromUnresponsiveStop();
    }, this.stopTimeoutMs);
  }

  private clearStopRecoveryTimer(): void {
    if (this.stopRecoveryTimer !== null) {
      clearTimeout(this.stopRecoveryTimer);
      this.stopRecoveryTimer = null;
    }
  }

  /** The stop-recovery timeout fired: the engine never sent a `bestmove`
   * for the search we told it to stop, so its UCI session can no longer be
   * trusted. Recovers by tearing down the Worker and starting a fresh one
   * (simpler and more reliable than trying to resynchronise a
   * possibly-wedged session) - then resumes whatever was queued, if
   * anything. */
  private async recoverFromUnresponsiveStop(): Promise<void> {
    if (this.lifecycleState === 'disposed' || this.lifecycleState === 'error') {
      return;
    }
    this.restarting = true;
    this.outstanding = null;
    this.detachAndTerminateWorker();

    try {
      this.worker = this.workerFactory();
      this.attachWorkerCallbacks();
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
    this.restarting = false;
    this.queued?.reject(disposedError);
    this.queued = null;
    if (this.outstanding?.wanted) {
      this.outstanding.reject(disposedError);
    }
    this.outstanding = null;
    this.uciokPending?.reject(disposedError);
    this.uciokPending = null;
    this.readyokPending?.reject(disposedError);
    this.readyokPending = null;
    this.detachAndTerminateWorker();
    this.lifecycleState = 'disposed';
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
   * terminated Worker can't reach the adapter at all. */
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
