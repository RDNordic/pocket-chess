import { describe, expect, it, vi } from 'vitest';
import { StockfishAdapter, type EngineWorkerLike } from '../StockfishAdapter';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

// Ample enough that no test relying on normal (non-timeout) behaviour ever
// trips it, but short enough that a genuinely-broken test still fails
// promptly instead of hanging for the production default (10s/5s).
const AMPLE_TIMEOUT_MS = 2_000;
// Deliberately short, used only by tests that want a timeout to actually
// fire - those tests never emit the reply that would prevent it. Comfortably
// above vi.waitFor's default 50ms polling interval so a test isn't racing
// its own "did the command get sent yet" check against the timeout it's
// trying to observe.
const FAST_TIMEOUT_MS = 300;

/**
 * Fake in place of a real `Worker`: real Web Workers/WASM aren't available
 * under Vitest's jsdom environment (see the separate browser-based
 * integration test for that), so lifecycle/stale-response behaviour is
 * tested against this instead - it exercises exactly the same
 * `EngineWorkerLike` seam `StockfishAdapter` uses in production.
 */
class FakeWorker implements EngineWorkerLike {
  readonly sent: string[] = [];
  terminated = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  postMessage(message: string): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulates a line of engine output arriving from the worker. */
  emit(line: string): void {
    this.onmessage?.({ data: line });
  }

  emitError(error: unknown): void {
    this.onerror?.(error);
  }
}

async function waitForSent(worker: FakeWorker, command: string): Promise<void> {
  await vi.waitFor(() => {
    if (!worker.sent.includes(command)) {
      throw new Error(`expected worker to have been sent "${command}", got: ${worker.sent.join(', ')}`);
    }
  });
}

/** Emits the two `option` lines a real Stockfish 18 Lite build sends in
 * response to `uci`, before its own `uciok` - `Skill Level` (spin, 0-20)
 * and `UCI_LimitStrength` (check). Every test below that drives a full
 * handshake to a healthy `ready` adapter needs these advertised, or
 * `validateCapabilities()` (see StockfishAdapter.ts) rejects `start()`
 * before it ever reaches `isready` - tests that specifically exercise that
 * rejection (see "StockfishAdapter engine capability validation" below)
 * omit or alter these lines on purpose instead of calling this helper. */
function emitCapabilityAdvertisement(worker: FakeWorker): void {
  worker.emit('option name Skill Level type spin default 20 min 0 max 20');
  worker.emit('option name UCI_LimitStrength type check default false');
}

/** Spawns an adapter against a fake worker and drives it through the full
 * uci/isready handshake, as every other test needs a `ready` adapter to
 * start from. Ample timeouts by default so normal-flow tests never race a
 * timer; override for tests that specifically want to exercise one. */
async function startedAdapter(
  overrides: {
    handshakeTimeoutMs?: number;
    stopTimeoutMs?: number;
    searchWatchdogOverheadMs?: number;
  } = {},
): Promise<{ worker: FakeWorker; adapter: StockfishAdapter }> {
  const worker = new FakeWorker();
  const adapter = new StockfishAdapter({
    workerFactory: () => worker,
    handshakeTimeoutMs: overrides.handshakeTimeoutMs ?? AMPLE_TIMEOUT_MS,
    stopTimeoutMs: overrides.stopTimeoutMs ?? AMPLE_TIMEOUT_MS,
    searchWatchdogOverheadMs: overrides.searchWatchdogOverheadMs ?? AMPLE_TIMEOUT_MS,
  });
  const startPromise = adapter.start();

  await waitForSent(worker, 'uci');
  worker.emit('id name Stockfish 18');
  emitCapabilityAdvertisement(worker);
  worker.emit('uciok');
  await waitForSent(worker, 'isready');
  worker.emit('readyok');
  await startPromise;

  return { worker, adapter };
}

/** Tracks every `FakeWorker` a `workerFactory` produces, in creation order -
 * needed by every test below that drives the adapter through one or more
 * Worker restarts, since each restart spawns a brand new worker that the
 * test must then drive its own handshake for. */
function trackedWorkerFactory(): { workerFactory: () => FakeWorker; spawned: FakeWorker[] } {
  const spawned: FakeWorker[] = [];
  const workerFactory = () => {
    const worker = new FakeWorker();
    spawned.push(worker);
    return worker;
  };
  return { workerFactory, spawned };
}

/** Drives one worker through a full, successful uci/isready handshake. */
async function driveHandshake(worker: FakeWorker): Promise<void> {
  await waitForSent(worker, 'uci');
  emitCapabilityAdvertisement(worker);
  worker.emit('uciok');
  await waitForSent(worker, 'isready');
  worker.emit('readyok');
}

describe('StockfishAdapter lifecycle', () => {
  it('starts up through the full uci/isready handshake', async () => {
    const { adapter, worker } = await startedAdapter();
    expect(adapter.state).toBe('ready');
    expect(worker.sent).toEqual([
      'uci',
      'setoption name UCI_LimitStrength value false',
      'setoption name Skill Level value 20',
      'isready',
    ]);
  });

  it('rejects starting an already-started engine', async () => {
    const { adapter } = await startedAdapter();
    await expect(adapter.start()).rejects.toThrow(/cannot start/);
  });

  it('rejects requesting a move before the engine has started', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    await expect(adapter.findBestMove(START_FEN, { movetimeMs: 100 })).rejects.toThrow(
      /cannot search/,
    );
  });

  it('waitUntilReady() can be re-issued after startup', async () => {
    const { adapter, worker } = await startedAdapter();
    const readyPromise = adapter.waitUntilReady();
    await waitForSent(worker, 'isready');
    expect(worker.sent.filter((c) => c === 'isready')).toHaveLength(2);
    worker.emit('readyok');
    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('coalesces concurrent waitUntilReady() calls onto a single in-flight request', async () => {
    const { adapter, worker } = await startedAdapter();
    const first = adapter.waitUntilReady();
    const second = adapter.waitUntilReady();
    const third = adapter.waitUntilReady();

    await waitForSent(worker, 'isready');
    // One 'isready' from startup, plus exactly one more shared by all three
    // concurrent calls - never one per call.
    expect(worker.sent.filter((c) => c === 'isready')).toHaveLength(2);

    worker.emit('readyok');
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    await expect(third).resolves.toBeUndefined();

    // A later call, after the shared one has settled, starts a fresh round
    // trip rather than reusing the settled promise.
    const fourth = adapter.waitUntilReady();
    await waitForSent(worker, 'isready');
    expect(worker.sent.filter((c) => c === 'isready')).toHaveLength(3);
    worker.emit('readyok');
    await expect(fourth).resolves.toBeUndefined();
  });

  it('rejects every concurrent waitUntilReady() caller on the same timeout', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({
      workerFactory: () => worker,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
    });
    // .catch(() => {}) on the raw start() promise: it's also awaited below
    // via allSettled, but that construction happens after this line, so
    // without this Node can flag the interim window as an unhandled
    // rejection.
    const startPromise = adapter.start();
    startPromise.catch(() => {});
    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    // The isready round trip from start() itself never gets a reply, so all
    // three concurrent calls below coalesce onto it and share its timeout.
    await waitForSent(worker, 'isready');

    const [startOutcome, firstOutcome, secondOutcome] = await Promise.allSettled([
      startPromise,
      adapter.waitUntilReady(),
      adapter.waitUntilReady(),
    ]);

    for (const outcome of [startOutcome, firstOutcome, secondOutcome]) {
      expect(outcome.status).toBe('rejected');
      if (outcome.status === 'rejected') {
        expect((outcome.reason as Error).message).toMatch(/timed out waiting.*"isready"/);
      }
    }
    expect(adapter.state).toBe('error');
    // Only the one 'isready' from start() was ever sent - the two
    // concurrent calls above coalesced onto it rather than each sending
    // their own.
    expect(worker.sent.filter((c) => c === 'isready')).toHaveLength(1);
  });
});

describe('StockfishAdapter bounded waits / timeouts', () => {
  it('rejects start() and moves to error if uciok never arrives', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({
      workerFactory: () => worker,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
    });
    await expect(adapter.start()).rejects.toThrow(/timed out waiting.*"uci"/);
    expect(adapter.state).toBe('error');
  });

  it('rejects start() and moves to error if readyok never arrives', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({
      workerFactory: () => worker,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    await expect(startPromise).rejects.toThrow(/timed out waiting.*"isready"/);
    expect(adapter.state).toBe('error');
  });

  it('rejects a standalone waitUntilReady() call and moves to error on timeout', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({
      workerFactory: () => worker,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    await waitForSent(worker, 'isready');
    worker.emit('readyok');
    await startPromise;

    // Force a fast timeout for a later, standalone readiness check by
    // reaching for a fresh adapter with a fast handshake timeout instead of
    // mutating the started one (timeouts are fixed per adapter instance).
    const worker2 = new FakeWorker();
    const adapter2 = new StockfishAdapter({
      workerFactory: () => worker2,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
    });
    const start2 = adapter2.start();
    await waitForSent(worker2, 'uci');
    emitCapabilityAdvertisement(worker2);
    worker2.emit('uciok');
    await waitForSent(worker2, 'isready');
    worker2.emit('readyok');
    await start2;

    await expect(adapter2.waitUntilReady()).rejects.toThrow(/timed out waiting.*"isready"/);
    expect(adapter2.state).toBe('error');
  });

  it('recovers by restarting the Worker when a stopped search never produces a bestmove', async () => {
    const spawned: FakeWorker[] = [];
    const workerFactory = () => {
      const worker = new FakeWorker();
      spawned.push(worker);
      return worker;
    };
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });

    const startPromise = adapter.start();
    await waitForSent(spawned[0], 'uci');
    emitCapabilityAdvertisement(spawned[0]);
    spawned[0].emit('uciok');
    await waitForSent(spawned[0], 'isready');
    spawned[0].emit('readyok');
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');

    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);
    await waitForSent(spawned[0], 'stop');

    // spawned[0] never replies to `stop` - the stop-recovery timeout should
    // fire, tear it down, and bring up a replacement.
    await vi.waitFor(() => expect(spawned[0].terminated).toBe(true), { timeout: 2_000 });
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });
    expect(adapter.state).toBe('searching');

    const restarted = spawned[1];
    await waitForSent(restarted, 'uci');
    emitCapabilityAdvertisement(restarted);
    restarted.emit('uciok');
    await waitForSent(restarted, 'isready');
    restarted.emit('readyok');
    await waitForSent(restarted, 'go movetime 200');
    restarted.emit('bestmove e7e5');

    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');

    // The old worker's callbacks were detached - a late message from it
    // must not be able to affect the (now-recovered) adapter.
    expect(() => spawned[0].emit('bestmove d2d4')).not.toThrow();
    expect(adapter.state).toBe('ready');
  });

  it('moves to error and rejects a queued request if the post-restart handshake itself times out', async () => {
    const spawned: FakeWorker[] = [];
    const workerFactory = () => {
      const worker = new FakeWorker();
      spawned.push(worker);
      return worker;
    };
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });

    const startPromise = adapter.start();
    await waitForSent(spawned[0], 'uci');
    emitCapabilityAdvertisement(spawned[0]);
    spawned[0].emit('uciok');
    await waitForSent(spawned[0], 'isready');
    spawned[0].emit('readyok');
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);

    // spawned[0] never replies to `stop` -> restart -> spawned[1] never
    // replies to `uci` either -> restart itself fails.
    await expect(second).rejects.toThrow(/engine restart failed/);
    await vi.waitFor(() => expect(adapter.state).toBe('error'), { timeout: 2_000 });
  });
});

describe('StockfishAdapter search', () => {
  it('requests a move for a FEN and resolves once bestmove arrives', async () => {
    const { adapter, worker } = await startedAdapter();

    const movePromise = adapter.findBestMove(START_FEN, { movetimeMs: 100 });
    expect(adapter.state).toBe('searching');
    await waitForSent(worker, 'go movetime 100');
    expect(worker.sent).toContain(`position fen ${START_FEN}`);

    worker.emit('bestmove e2e4 ponder e7e5');

    await expect(movePromise).resolves.toEqual({ uci: 'e2e4', ponder: 'e7e5' });
    expect(adapter.state).toBe('ready');
  });

  it('parses a promotion bestmove', async () => {
    const { adapter, worker } = await startedAdapter();
    const movePromise = adapter.findBestMove(START_FEN, { movetimeMs: 100 });
    await waitForSent(worker, 'go movetime 100');
    worker.emit('bestmove e7e8q');
    await expect(movePromise).resolves.toEqual({ uci: 'e7e8q', ponder: undefined });
  });

  it('rejects when the engine reports no legal move', async () => {
    const { adapter, worker } = await startedAdapter();
    const movePromise = adapter.findBestMove(START_FEN, { movetimeMs: 100 });
    await waitForSent(worker, 'go movetime 100');
    worker.emit('bestmove (none)');
    await expect(movePromise).rejects.toThrow(/no legal move/);
  });

  it('only allows one active search: a new request stops and supersedes an in-flight one', async () => {
    const { adapter, worker } = await startedAdapter();

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);
    await waitForSent(worker, 'stop');

    // The engine is still entitled to reply to the search it was told to
    // stop - that reply must be discarded, not mistaken for the new
    // search's result.
    worker.emit('bestmove d2d4');
    expect(adapter.state).toBe('searching');
    await waitForSent(worker, 'go movetime 200');

    worker.emit('bestmove e7e5');
    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');
  });

  it('A superseded by B superseded by C before A terminates: only C ever resolves', async () => {
    const { adapter, worker } = await startedAdapter();

    const a = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');
    const b = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 500 });
    const c = adapter.findBestMove(START_FEN, { movetimeMs: 200 });

    await expect(a).rejects.toThrow(/superseded/);
    await expect(b).rejects.toThrow(/superseded/);

    // Only one `stop` should ever have been sent for the still-outstanding
    // A - B never reached the engine at all.
    expect(worker.sent.filter((cmd) => cmd === 'stop')).toHaveLength(1);

    // A's (discarded) bestmove finally arrives.
    worker.emit('bestmove d2d4');
    await waitForSent(worker, 'go movetime 200');
    expect(worker.sent).toContain(`position fen ${START_FEN}`);

    worker.emit('bestmove d7d5');
    await expect(c).resolves.toEqual({ uci: 'd7d5', ponder: undefined });
    expect(adapter.state).toBe('ready');
  });

  it('drops a queued search that is itself superseded before ever being dispatched', async () => {
    const { adapter, worker } = await startedAdapter();

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 500 });
    const third = adapter.findBestMove(START_FEN, { movetimeMs: 200 });

    await expect(first).rejects.toThrow(/superseded/);
    await expect(second).rejects.toThrow(/superseded/);

    expect(worker.sent.filter((c) => c === 'stop')).toHaveLength(1);

    worker.emit('bestmove d2d4');
    await waitForSent(worker, 'go movetime 200');
    worker.emit('bestmove d7d5');
    await expect(third).resolves.toEqual({ uci: 'd7d5', ponder: undefined });
  });

  it('ignores a duplicate bestmove for a search that has already settled', async () => {
    const { adapter, worker } = await startedAdapter();
    const movePromise = adapter.findBestMove(START_FEN, { movetimeMs: 100 });
    await waitForSent(worker, 'go movetime 100');
    worker.emit('bestmove e2e4');
    await expect(movePromise).resolves.toEqual({ uci: 'e2e4', ponder: undefined });

    expect(() => worker.emit('bestmove d2d4')).not.toThrow();
    expect(adapter.state).toBe('ready');
  });

  it('ignores a wholly unsolicited bestmove with nothing outstanding', async () => {
    const { adapter, worker } = await startedAdapter();
    expect(() => worker.emit('bestmove e2e4')).not.toThrow();
    expect(adapter.state).toBe('ready');
  });

  it('rejects the queued replacement too when the worker errors mid-supersession', async () => {
    const { adapter, worker } = await startedAdapter();
    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);

    worker.emitError(new Error('boom'));

    await expect(second).rejects.toThrow(/engine worker error/);
    expect(adapter.state).toBe('error');
  });

  it('stop() cancels the active search and ignores its eventual stale reply', async () => {
    const { adapter, worker } = await startedAdapter();

    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    await adapter.stop();
    await expect(search).rejects.toThrow(/search stopped/);
    expect(worker.sent).toContain('stop');
    // The engine hasn't confirmed it actually stopped yet.
    expect(adapter.state).toBe('searching');

    worker.emit('bestmove d2d4');
    expect(adapter.state).toBe('ready');
  });

  it('stop() with nothing in flight is a harmless no-op', async () => {
    const { adapter, worker } = await startedAdapter();
    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(worker.sent).not.toContain('stop');
    expect(adapter.state).toBe('ready');
  });
});

describe('StockfishAdapter search limits validation', () => {
  it.each([NaN, Infinity, -Infinity, 0, -5, 1.5, -0.5])(
    'rejects an invalid movetimeMs (%p) without sending anything to the worker',
    async (movetimeMs) => {
      const { adapter, worker } = await startedAdapter();
      await expect(adapter.findBestMove(START_FEN, { movetimeMs })).rejects.toThrow(
        /movetimeMs/,
      );
      expect(worker.sent.some((c) => c.startsWith('go '))).toBe(false);
      expect(adapter.state).toBe('ready');
    },
  );

  it('accepts a positive integer movetimeMs', async () => {
    const { adapter, worker } = await startedAdapter();
    const movePromise = adapter.findBestMove(START_FEN, { movetimeMs: 250 });
    await waitForSent(worker, 'go movetime 250');
    worker.emit('bestmove e2e4');
    await expect(movePromise).resolves.toEqual({ uci: 'e2e4', ponder: undefined });
  });
});

describe('StockfishAdapter malformed input and errors', () => {
  it('ignores malformed, irrelevant, or non-string worker messages without crashing', async () => {
    const { adapter, worker } = await startedAdapter();
    expect(() => worker.emit('')).not.toThrow();
    expect(() => worker.emit('info depth 3 currmove e2e4 currmovenumber 1')).not.toThrow();
    expect(() => worker.onmessage?.({ data: 12345 })).not.toThrow();
    expect(() => worker.onmessage?.({ data: null })).not.toThrow();
    expect(adapter.state).toBe('ready');
  });

  it('transitions to error and rejects pending work on a worker error', async () => {
    const { adapter, worker } = await startedAdapter();
    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    worker.emitError(new Error('worker crashed'));

    await expect(search).rejects.toThrow(/engine worker error/);
    expect(adapter.state).toBe('error');
    await expect(adapter.findBestMove(START_FEN, { movetimeMs: 100 })).rejects.toThrow(
      /error state/,
    );
  });

  it('ignores late worker messages after an unrecovered error - state is not restored', async () => {
    const { adapter, worker } = await startedAdapter();
    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    worker.emitError(new Error('boom'));
    await expect(search).rejects.toThrow(/engine worker error/);
    expect(adapter.state).toBe('error');

    expect(() => worker.emit('bestmove e2e4')).not.toThrow();
    expect(adapter.state).toBe('error');

    expect(() => worker.emitError(new Error('again'))).not.toThrow();
    expect(adapter.state).toBe('error');
  });
});

describe('StockfishAdapter disposal', () => {
  it('dispose() rejects pending work, terminates the worker, and disables further use', async () => {
    const { adapter, worker } = await startedAdapter();
    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    adapter.dispose();

    await expect(search).rejects.toThrow(/disposed/);
    expect(worker.terminated).toBe(true);
    expect(adapter.state).toBe('disposed');
    await expect(adapter.stop()).rejects.toThrow(/disposed/);
    await expect(adapter.findBestMove(START_FEN, { movetimeMs: 100 })).rejects.toThrow(
      /disposed/,
    );
  });

  it('dispose() rejects both an active and a queued search', async () => {
    const { adapter, worker } = await startedAdapter();
    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);

    adapter.dispose();

    await expect(second).rejects.toThrow(/disposed/);
    expect(worker.terminated).toBe(true);
    expect(adapter.state).toBe('disposed');
  });

  it('dispose() is idempotent', async () => {
    const { adapter } = await startedAdapter();
    adapter.dispose();
    expect(() => adapter.dispose()).not.toThrow();
    expect(adapter.state).toBe('disposed');
  });

  it('ignores a late bestmove that arrives after dispose() - state is not restored to ready', async () => {
    const { adapter, worker } = await startedAdapter();
    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');

    adapter.dispose();
    await expect(search).rejects.toThrow(/disposed/);

    expect(() => worker.emit('bestmove e2e4')).not.toThrow();
    expect(adapter.state).toBe('disposed');

    expect(() => worker.emitError(new Error('late error'))).not.toThrow();
    expect(adapter.state).toBe('disposed');
  });

  it('detaches the worker callbacks on dispose()', async () => {
    const { adapter, worker } = await startedAdapter();
    adapter.dispose();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });

  it('a dispose() that races an in-flight start() leaves the adapter disposed, not errored', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start();
    await waitForSent(worker, 'uci');

    adapter.dispose();

    await expect(startPromise).rejects.toThrow(/disposed/);
    expect(adapter.state).toBe('disposed');
  });
});

describe('StockfishAdapter engine difficulty / capability validation', () => {
  it.each([
    ['gentle', 0],
    ['casual', 5],
    ['challenging', 10],
    ['strongest', 20],
  ] as const)('sends the mapped Skill Level for difficulty "%s"', async (difficulty, skillLevel) => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty });

    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    await waitForSent(worker, `setoption name Skill Level value ${skillLevel}`);
    await waitForSent(worker, 'isready');
    worker.emit('readyok');
    await startPromise;

    expect(adapter.state).toBe('ready');
  });

  it('start() with no config defaults to "strongest" (Skill Level 20) - identical to pre-Phase-3A behaviour', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start();

    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    await waitForSent(worker, 'setoption name Skill Level value 20');
    await waitForSent(worker, 'isready');
    worker.emit('readyok');
    await expect(startPromise).resolves.toBeUndefined();
  });

  it('sends UCI_LimitStrength=false and the selected Skill Level strictly after uciok and strictly before isready', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty: 'casual' });

    await waitForSent(worker, 'uci');
    emitCapabilityAdvertisement(worker);
    worker.emit('uciok');
    await waitForSent(worker, 'isready');
    worker.emit('readyok');
    await startPromise;

    const uciokIndex = worker.sent.indexOf('uci');
    const limitStrengthIndex = worker.sent.indexOf('setoption name UCI_LimitStrength value false');
    const skillLevelIndex = worker.sent.indexOf('setoption name Skill Level value 5');
    const isreadyIndex = worker.sent.indexOf('isready');

    expect(uciokIndex).toBeGreaterThanOrEqual(0);
    expect(limitStrengthIndex).toBeGreaterThan(uciokIndex);
    expect(skillLevelIndex).toBeGreaterThan(limitStrengthIndex);
    expect(isreadyIndex).toBeGreaterThan(skillLevelIndex);
  });

  it('rejects start() and moves to error when the engine does not advertise "Skill Level" at all', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty: 'gentle' });

    await waitForSent(worker, 'uci');
    worker.emit('option name UCI_LimitStrength type check default false');
    worker.emit('uciok');

    await expect(startPromise).rejects.toThrow(/does not advertise the required "Skill Level"/);
    expect(adapter.state).toBe('error');
    expect(worker.sent).not.toContain('isready');
  });

  it('rejects start() and moves to error when "Skill Level" is advertised with the wrong option type', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty: 'gentle' });

    await waitForSent(worker, 'uci');
    worker.emit('option name Skill Level type check default true');
    worker.emit('option name UCI_LimitStrength type check default false');
    worker.emit('uciok');

    await expect(startPromise).rejects.toThrow(/does not advertise the required "Skill Level"/);
    expect(adapter.state).toBe('error');
  });

  it('rejects start() when the advertised "Skill Level" range does not include the requested value', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    // Advertises a narrower range than "strongest" (20) needs.
    const startPromise = adapter.start({ difficulty: 'strongest' });

    await waitForSent(worker, 'uci');
    worker.emit('option name Skill Level type spin default 15 min 0 max 15');
    worker.emit('option name UCI_LimitStrength type check default false');
    worker.emit('uciok');

    await expect(startPromise).rejects.toThrow(/advertised "Skill Level" range \[0, 15\]/);
    expect(adapter.state).toBe('error');
  });

  it('rejects start() and moves to error when the engine does not advertise "UCI_LimitStrength"', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty: 'gentle' });

    await waitForSent(worker, 'uci');
    worker.emit('option name Skill Level type spin default 20 min 0 max 20');
    worker.emit('uciok');

    await expect(startPromise).rejects.toThrow(/does not advertise the required "UCI_LimitStrength"/);
    expect(adapter.state).toBe('error');
  });

  it('rejects start() synchronously through the error-state path for an invalid difficulty, without ever touching the worker', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });

    await expect(adapter.start({ difficulty: 'bogus' as never })).rejects.toThrow(
      /invalid engine difficulty/,
    );
    expect(adapter.state).toBe('error');
    expect(worker.sent).toEqual([]);
  });

  it('capability collection does not leak across Worker generations: generation 2 is validated purely against its own advertisement', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start({ difficulty: 'strongest' });
    await driveHandshake(spawned[0]);
    await startPromise;

    // Force a restart via the stop-recovery path.
    const search = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    await adapter.stop();
    await expect(search).rejects.toThrow(/search stopped/);
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    // Generation 2 advertises a narrower "Skill Level" range than
    // generation 1 did - if generation 1's wider range had leaked into
    // generation 2's validation, this would wrongly succeed.
    await waitForSent(spawned[1], 'uci');
    spawned[1].emit('option name Skill Level type spin default 10 min 0 max 10');
    spawned[1].emit('option name UCI_LimitStrength type check default false');
    spawned[1].emit('uciok');

    await vi.waitFor(() => expect(adapter.state).toBe('error'), { timeout: 2_000 });
  });

  it('reapplies the same selected Skill Level after a stop-recovery-timeout restart', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start({ difficulty: 'challenging' });
    await driveHandshake(spawned[0]);
    await startPromise;
    expect(spawned[0].sent).toContain('setoption name Skill Level value 10');

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);
    // spawned[0] never replies to `stop` - stop-recovery timeout restarts it.
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    await driveHandshake(spawned[1]);
    expect(spawned[1].sent).toContain('setoption name Skill Level value 10');
    expect(spawned[1].sent).toContain('setoption name UCI_LimitStrength value false');

    await waitForSent(spawned[1], 'go movetime 200');
    spawned[1].emit('bestmove e7e5');
    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
  });

  it('reapplies the same selected Skill Level after a search-watchdog restart', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      searchWatchdogOverheadMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start({ difficulty: 'casual' });
    await driveHandshake(spawned[0]);
    await startPromise;

    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1 });
    await waitForSent(spawned[0], 'go movetime 1');
    // spawned[0] never replies at all - the watchdog fires and restarts.
    await expect(search).rejects.toThrow(/watchdog/);
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    await driveHandshake(spawned[1]);
    expect(spawned[1].sent).toContain('setoption name Skill Level value 5');
    expect(spawned[1].sent).toContain('setoption name UCI_LimitStrength value false');
  });

  it('does not dispatch a queued search until the restarted generation completes its own setoption/isready sequence', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start({ difficulty: 'gentle' });
    await driveHandshake(spawned[0]);
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    await waitForSent(spawned[1], 'uci');
    emitCapabilityAdvertisement(spawned[1]);
    spawned[1].emit('uciok');
    await waitForSent(spawned[1], 'setoption name Skill Level value 0');

    // The queued search must not have been dispatched yet - isready/readyok
    // for the new generation has not completed.
    expect(spawned[1].sent).not.toContain(`position fen ${AFTER_E4_FEN}`);
    expect(spawned[1].sent.some((c) => c.startsWith('go '))).toBe(false);

    await waitForSent(spawned[1], 'isready');
    spawned[1].emit('readyok');

    await waitForSent(spawned[1], 'go movetime 200');
    spawned[1].emit('bestmove e7e5');
    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
  });

  it('dispose() during capability validation leaves the adapter disposed, not errored', async () => {
    const worker = new FakeWorker();
    const adapter = new StockfishAdapter({ workerFactory: () => worker });
    const startPromise = adapter.start({ difficulty: 'gentle' });

    await waitForSent(worker, 'uci');
    // No capabilities advertised at all - validateCapabilities would throw
    // once 'uciok' arrives, but dispose() races ahead of that.
    adapter.dispose();
    worker.emit('uciok');

    await expect(startPromise).rejects.toThrow(/disposed/);
    expect(adapter.state).toBe('disposed');
  });

  it("a stale generation's late option/uciok lines cannot affect a current generation's validation or lifecycle", async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start({ difficulty: 'strongest' });
    await driveHandshake(spawned[0]);
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    await adapter.stop();
    await expect(first).rejects.toThrow(/search stopped/);
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });
    await driveHandshake(spawned[1]);
    await vi.waitFor(() => expect(adapter.state).toBe('ready'), { timeout: 2_000 });

    // The old (generation 1) worker's callbacks were detached on restart -
    // a late, incompatible option/uciok pair from it must have no effect.
    expect(() =>
      spawned[0].emit('option name Skill Level type spin default 20 min 0 max 0'),
    ).not.toThrow();
    expect(() => spawned[0].emit('uciok')).not.toThrow();
    expect(adapter.state).toBe('ready');
  });
});

describe('StockfishAdapter search watchdog', () => {
  it('bounds an ordinary search that gets neither a bestmove nor a worker error', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      searchWatchdogOverheadMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1 });
    await waitForSent(spawned[0], 'go movetime 1');

    // spawned[0] never replies at all - no bestmove, no error - so the
    // watchdog (movetimeMs=1 + FAST_TIMEOUT_MS overhead) must still reject
    // the caller within bounded time rather than hanging forever.
    await expect(search).rejects.toThrow(/watchdog/);
  });

  it('recovers after a watchdog timeout and can complete a later search', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      searchWatchdogOverheadMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1 });
    await waitForSent(spawned[0], 'go movetime 1');
    await expect(search).rejects.toThrow(/watchdog/);

    await vi.waitFor(() => expect(spawned[0].terminated).toBe(true), { timeout: 2_000 });
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    await driveHandshake(spawned[1]);
    await vi.waitFor(() => expect(adapter.state).toBe('ready'), { timeout: 2_000 });

    const laterSearch = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 100 });
    await waitForSent(spawned[1], 'go movetime 100');
    spawned[1].emit('bestmove e7e5');
    await expect(laterSearch).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');
  });

  it('clears the watchdog on a normal bestmove - no restart happens', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      searchWatchdogOverheadMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const search = adapter.findBestMove(START_FEN, { movetimeMs: 1 });
    await waitForSent(spawned[0], 'go movetime 1');
    spawned[0].emit('bestmove e2e4');
    await expect(search).resolves.toEqual({ uci: 'e2e4', ponder: undefined });

    // Give the watchdog's original deadline time to pass - it must not
    // fire/restart anything, since the search already settled normally and
    // its watchdog was cleared.
    await new Promise((resolve) => setTimeout(resolve, FAST_TIMEOUT_MS + 100));
    expect(spawned).toHaveLength(1);
    expect(adapter.state).toBe('ready');
  });

  it('does not double-restart when a watched search is instead superseded', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: AMPLE_TIMEOUT_MS,
      searchWatchdogOverheadMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1 });
    await waitForSent(spawned[0], 'go movetime 1');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);

    // The first search's own watchdog must have been cleared the moment it
    // was superseded - only stopTimeoutMs (AMPLE here) governs recovery
    // now, so waiting past what would have been the watchdog's deadline
    // must not trigger a restart on its own.
    await new Promise((resolve) => setTimeout(resolve, FAST_TIMEOUT_MS + 100));
    expect(spawned).toHaveLength(1);
    expect(adapter.state).toBe('searching');

    spawned[0].emit('bestmove d2d4');
    await waitForSent(spawned[0], 'go movetime 200');
    spawned[0].emit('bestmove e7e5');
    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
  });
});

describe('StockfishAdapter Worker generation safety', () => {
  it("Codex's race: a waitUntilReady() pending on the old Worker cannot corrupt the recovered one", async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    // A search gets superseded and stopped on Worker 1 - it will never
    // reply, so the stop-recovery timeout will eventually restart.
    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);
    await waitForSent(spawned[0], 'stop');

    // Meanwhile, and before Worker 1 is torn down, an unrelated caller
    // asks for readiness - this is exactly the promise/pending state
    // Codex found could otherwise survive into the recovered Worker's
    // generation and starve it of its own fresh 'isready'.
    const staleReadiness = adapter.waitUntilReady();
    await waitForSent(spawned[0], 'isready');

    // Worker 1 never replies to `stop` -> stop-recovery timeout fires ->
    // restart. The stale readiness caller must be rejected promptly, not
    // left hanging until its own (much longer) handshake timeout.
    await expect(staleReadiness).rejects.toThrow(/restarted/);
    await vi.waitFor(() => expect(spawned[0].terminated).toBe(true), { timeout: 2_000 });
    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });

    // Worker 2 must perform its own complete, fresh handshake - not reuse
    // (or be blocked by) whatever was pending for Worker 1.
    await waitForSent(spawned[1], 'uci');
    emitCapabilityAdvertisement(spawned[1]);
    spawned[1].emit('uciok');
    await waitForSent(spawned[1], 'isready');
    spawned[1].emit('readyok');
    await waitForSent(spawned[1], 'go movetime 200');
    spawned[1].emit('bestmove e7e5');

    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');
  });

  it('an old-generation readiness timeout cannot fire after the replacement Worker is already healthy', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: FAST_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 200 });
    await expect(first).rejects.toThrow(/superseded/);

    const staleReadiness = adapter.waitUntilReady();
    await expect(staleReadiness).rejects.toThrow(/restarted/);

    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });
    await waitForSent(spawned[1], 'uci');
    emitCapabilityAdvertisement(spawned[1]);
    spawned[1].emit('uciok');
    await waitForSent(spawned[1], 'isready');
    spawned[1].emit('readyok');
    await waitForSent(spawned[1], 'go movetime 200');
    spawned[1].emit('bestmove e7e5');
    await expect(second).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');

    // Wait comfortably past what would have been Worker 1's own handshake
    // timeout (FAST_TIMEOUT_MS). If that old timer were somehow still
    // live, it would now force the (perfectly healthy) adapter to
    // 'error' - it must not.
    await new Promise((resolve) => setTimeout(resolve, FAST_TIMEOUT_MS + 150));
    expect(adapter.state).toBe('ready');
  });

  it('a late readyok (or uciok, or bestmove) from the old Worker after restart has no effect', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
    await waitForSent(spawned[0], 'go movetime 10000');
    await adapter.stop();
    await expect(first).rejects.toThrow(/search stopped/);

    await vi.waitFor(() => expect(spawned).toHaveLength(2), { timeout: 2_000 });
    await driveHandshake(spawned[1]);
    await vi.waitFor(() => expect(adapter.state).toBe('ready'), { timeout: 2_000 });

    expect(() => spawned[0].emit('readyok')).not.toThrow();
    expect(() => spawned[0].emit('uciok')).not.toThrow();
    expect(() => spawned[0].emit('bestmove a2a3')).not.toThrow();
    expect(adapter.state).toBe('ready');
  });

  it('survives multiple sequential restarts, each with its own clean handshake', async () => {
    const { workerFactory, spawned } = trackedWorkerFactory();
    const adapter = new StockfishAdapter({
      workerFactory,
      handshakeTimeoutMs: AMPLE_TIMEOUT_MS,
      stopTimeoutMs: FAST_TIMEOUT_MS,
    });
    const startPromise = adapter.start();
    await driveHandshake(spawned[0]);
    await startPromise;

    for (let round = 0; round < 3; round += 1) {
      const search = adapter.findBestMove(START_FEN, { movetimeMs: 10_000 });
      await waitForSent(spawned[round], 'go movetime 10000');
      await adapter.stop();
      await expect(search).rejects.toThrow(/search stopped/);

      await vi.waitFor(() => expect(spawned).toHaveLength(round + 2), { timeout: 2_000 });
      await driveHandshake(spawned[round + 1]);
      await vi.waitFor(() => expect(adapter.state).toBe('ready'), { timeout: 2_000 });
    }

    expect(spawned).toHaveLength(4);
    const finalSearch = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 100 });
    await waitForSent(spawned[3], 'go movetime 100');
    spawned[3].emit('bestmove e7e5');
    await expect(finalSearch).resolves.toEqual({ uci: 'e7e5', ponder: undefined });
    expect(adapter.state).toBe('ready');
  });
});
