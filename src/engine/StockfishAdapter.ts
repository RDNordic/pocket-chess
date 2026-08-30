import type { ChessEngine } from './ChessEngine';
import { EngineError } from './engineTypes';
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

interface PendingHandshake {
  resolve(): void;
  reject(error: Error): void;
}

interface PendingSearch {
  token: number;
  fen: string;
  limits: SearchLimits;
  resolve(move: EngineMove): void;
  reject(error: Error): void;
}

/**
 * Owns every interaction with the Stockfish Worker: spawning it, the UCI
 * handshake, command transmission, one active search at a time, stale
 * response rejection, cancellation, and disposal. The rest of the app only
 * ever sees the `ChessEngine` interface.
 *
 * Stale-response protection: only one `go` is ever outstanding at the
 * engine. Calling `findBestMove` while a search is in flight stops it and
 * queues the new request; a `bestmove` for a search that has since been
 * stopped/superseded is identified via `PendingSearch#token` and discarded
 * rather than resolving/rejecting anything - so a delayed reply from an
 * old, no-longer-wanted search can never affect the current game.
 */
export class StockfishAdapter implements ChessEngine {
  private worker: EngineWorkerLike | null = null;
  private lifecycleState: EngineLifecycleState = 'uninitialised';
  private uciokPending: PendingHandshake | null = null;
  private readyokPending: PendingHandshake | null = null;
  /** The search whose `go` is currently outstanding at the engine, if any -
   * `wanted: false` once it has been stopped/superseded but its `bestmove`
   * hasn't arrived yet (still discarded when it does). */
  private outstanding: (PendingSearch & { wanted: boolean }) | null = null;
  /** At most one queued search, dispatched once the outstanding one's
   * `bestmove` (wanted or not) arrives - matches "only one active search at
   * a time" without ever sending `position`/`go` while another is still in
   * flight at the engine. */
  private queued: PendingSearch | null = null;
  private nextSearchToken = 0;

  constructor(private readonly workerFactory: () => EngineWorkerLike = defaultWorkerFactory) {}

  get state(): EngineLifecycleState {
    return this.lifecycleState;
  }

  async start(): Promise<void> {
    if (this.lifecycleState !== 'uninitialised') {
      throw new EngineError(`cannot start engine from state "${this.lifecycleState}"`);
    }
    this.lifecycleState = 'starting';
    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = (event) => this.handleWorkerError(event);
      await this.handshake('uci', (pending) => (this.uciokPending = pending));
      await this.waitUntilReady();
      this.lifecycleState = 'ready';
    } catch (error) {
      this.lifecycleState = 'error';
      throw error;
    }
  }

  async waitUntilReady(): Promise<void> {
    this.assertUsable();
    await this.handshake('isready', (pending) => (this.readyokPending = pending));
  }

  private handshake(command: string, register: (pending: PendingHandshake) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      register({ resolve, reject });
      this.postCommand(command);
    });
  }

  async findBestMove(fen: string, limits: SearchLimits): Promise<EngineMove> {
    this.assertUsable();
    if (
      this.lifecycleState !== 'ready' &&
      this.lifecycleState !== 'searching'
    ) {
      throw new EngineError(`cannot search from state "${this.lifecycleState}"`);
    }
    if (typeof fen !== 'string' || fen.trim() === '') {
      throw new EngineError('findBestMove requires a non-empty FEN string');
    }

    const token = ++this.nextSearchToken;
    return new Promise<EngineMove>((resolve, reject) => {
      const request: PendingSearch = { token, fen, limits, resolve, reject };

      // A previously queued (not yet dispatched) request is now itself
      // superseded by this newer one - only the latest queued request
      // matters.
      this.queued?.reject(new EngineError('superseded by a newer search request'));

      if (this.outstanding) {
        if (this.outstanding.wanted) {
          this.outstanding.reject(new EngineError('superseded by a newer search request'));
          this.outstanding.wanted = false;
          this.postCommand('stop');
        }
        this.queued = request;
        // Stays 'searching' - the engine still has an outstanding `go` in
        // flight, we're just waiting for its (now-discarded) bestmove
        // before we can dispatch this one.
      } else {
        this.outstanding = { ...request, wanted: true };
        this.lifecycleState = 'searching';
        this.dispatchSearch(request.fen, request.limits);
      }
    });
  }

  private dispatchSearch(fen: string, limits: SearchLimits): void {
    this.postCommand(`position fen ${fen}`);
    this.postCommand(`go movetime ${Math.max(1, Math.floor(limits.movetimeMs))}`);
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
    if (this.outstanding?.wanted) {
      this.outstanding.reject(new EngineError('search stopped'));
      this.outstanding.wanted = false;
      this.postCommand('stop');
    }
    if (!this.outstanding) {
      this.lifecycleState = 'ready';
    }
  }

  dispose(): void {
    if (this.lifecycleState === 'disposed') {
      return;
    }
    const disposedError = new EngineError('engine has been disposed');
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
    this.worker?.terminate();
    this.worker = null;
    this.lifecycleState = 'disposed';
  }

  private postCommand(command: string): void {
    if (!this.worker) {
      throw new EngineError('engine worker is not available');
    }
    this.worker.postMessage(command);
  }

  private handleMessage(data: unknown): void {
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
    this.outstanding = null;

    if (finished?.wanted) {
      if (move === null) {
        finished.reject(new EngineError('engine reported no legal move for this position'));
      } else {
        finished.resolve({ uci: move, ponder });
      }
    }
    // Otherwise this is a discarded reply to a `stop` we issued for a
    // superseded search - deliberately not surfaced to anyone.

    if (this.queued) {
      const next = this.queued;
      this.queued = null;
      this.outstanding = { ...next, wanted: true };
      this.lifecycleState = 'searching';
      this.dispatchSearch(next.fen, next.limits);
    } else {
      this.lifecycleState = 'ready';
    }
  }

  private handleWorkerError(event: unknown): void {
    const error = new EngineError('engine worker error', { cause: event });
    this.lifecycleState = 'error';
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
