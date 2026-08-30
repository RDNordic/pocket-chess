import { describe, expect, it, vi } from 'vitest';
import { StockfishAdapter, type EngineWorkerLike } from '../StockfishAdapter';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

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
 * start from. */
async function startedAdapter(): Promise<{ worker: FakeWorker; adapter: StockfishAdapter }> {
  const worker = new FakeWorker();
  const adapter = new StockfishAdapter(() => worker);
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
    const adapter = new StockfishAdapter(() => worker);
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

  it('drops a queued search that is itself superseded before ever being dispatched', async () => {
    const { adapter, worker } = await startedAdapter();

    const first = adapter.findBestMove(START_FEN, { movetimeMs: 1000 });
    await waitForSent(worker, 'go movetime 1000');
    const second = adapter.findBestMove(AFTER_E4_FEN, { movetimeMs: 500 });
    const third = adapter.findBestMove(START_FEN, { movetimeMs: 200 });

    await expect(first).rejects.toThrow(/superseded/);
    await expect(second).rejects.toThrow(/superseded/);

    // Only one `stop` should ever have been sent for the still-outstanding
    // first search - the second request never reached the engine.
    expect(worker.sent.filter((c) => c === 'stop')).toHaveLength(1);

    worker.emit('bestmove d2d4');
    await waitForSent(worker, 'go movetime 200');
    worker.emit('bestmove d7d5');
    await expect(third).resolves.toEqual({ uci: 'd7d5', ponder: undefined });
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

  it('dispose() is idempotent', async () => {
    const { adapter } = await startedAdapter();
    adapter.dispose();
    expect(() => adapter.dispose()).not.toThrow();
    expect(adapter.state).toBe('disposed');
  });
});
