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

/** Spawns an adapter against a fake worker and drives it through the full
 * uci/isready handshake, as every other test needs a `ready` adapter to
 * start from. Ample timeouts by default so normal-flow tests never race a
 * timer; override for tests that specifically want to exercise one. */
async function startedAdapter(
  overrides: { handshakeTimeoutMs?: number; stopTimeoutMs?: number } = {},
): Promise<{ worker: FakeWorker; adapter: StockfishAdapter }> {
  const worker = new FakeWorker();
  const adapter = new StockfishAdapter({
    workerFactory: () => worker,
    handshakeTimeoutMs: overrides.handshakeTimeoutMs ?? AMPLE_TIMEOUT_MS,
    stopTimeoutMs: overrides.stopTimeoutMs ?? AMPLE_TIMEOUT_MS,
  });
  const startPromise = adapter.start();

  await waitForSent(worker, 'uci');
  worker.emit('id name Stockfish 18');
  worker.emit('uciok');
  await waitForSent(worker, 'isready');
  worker.emit('readyok');
  await startPromise;

  return { worker, adapter };
}

describe('StockfishAdapter lifecycle', () => {
  it('starts up through the full uci/isready handshake', async () => {
    const { adapter, worker } = await startedAdapter();
    expect(adapter.state).toBe('ready');
    expect(worker.sent).toEqual(['uci', 'isready']);
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
