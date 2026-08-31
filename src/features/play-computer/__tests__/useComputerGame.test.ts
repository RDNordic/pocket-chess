import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChessEngine } from '../../../engine/ChessEngine';
import type { EngineMove, SearchLimits } from '../../../engine/engineTypes';
import { useComputerGame } from '../useComputerGame';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Fully controllable fake in place of a real `StockfishAdapter` - lets
 * tests deterministically drive exactly when `start()`/`findBestMove()`
 * settle, without any real Worker/WASM/timing involved. Mirrors the same
 * "inject a fake, control it precisely" approach already used for
 * `StockfishAdapter`'s own unit tests (there: a fake Worker; here: a fake
 * whole engine, one layer up).
 */
class FakeChessEngine implements ChessEngine {
  state: ChessEngine['state'] = 'uninitialised';
  startCallCount = 0;
  disposeCallCount = 0;
  findBestMoveCalls: Array<{ fen: string; limits: SearchLimits }> = [];

  private startDeferred: Deferred<void> | null = null;
  private moveDeferred: Deferred<EngineMove> | null = null;

  start(): Promise<void> {
    this.startCallCount += 1;
    this.state = 'starting';
    this.startDeferred = createDeferred<void>();
    return this.startDeferred.promise.then(() => {
      this.state = 'ready';
    });
  }

  resolveStart(): void {
    this.startDeferred?.resolve();
  }

  rejectStart(error: Error): void {
    this.startDeferred?.reject(error);
  }

  waitUntilReady(): Promise<void> {
    return Promise.resolve();
  }

  findBestMove(fen: string, limits: SearchLimits): Promise<EngineMove> {
    this.findBestMoveCalls.push({ fen, limits });
    this.state = 'searching';
    this.moveDeferred = createDeferred<EngineMove>();
    return this.moveDeferred.promise.then((move) => {
      this.state = 'ready';
      return move;
    });
  }

  resolveMove(uci: string): void {
    this.moveDeferred?.resolve({ uci });
  }

  rejectMove(error: Error): void {
    this.moveDeferred?.reject(error);
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {
    this.disposeCallCount += 1;
    this.state = 'disposed';
  }
}

function engineFactory(): { createEngine: () => FakeChessEngine; engines: FakeChessEngine[] } {
  const engines: FakeChessEngine[] = [];
  return {
    createEngine: () => {
      const engine = new FakeChessEngine();
      engines.push(engine);
      return engine;
    },
    engines,
  };
}

describe('useComputerGame', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('player as White: moves first, the engine receives the resulting FEN, and its legal reply is applied', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));

    expect(result.current.phase).toBe('player-turn');
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));
    expect(engines[0].findBestMoveCalls).toHaveLength(0);

    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(result.current.phase).toBe('computer-thinking'));
    expect(engines[0].findBestMoveCalls).toHaveLength(1);
    expect(engines[0].findBestMoveCalls[0].fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3')).toBe(true);

    act(() => engines[0].resolveMove('e7e5'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));
    expect(result.current.snapshot.history.map((m) => m.uci)).toEqual(['e2e4', 'e7e5']);
  });

  it('player as Black: the engine moves first automatically, then the player gets control', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('black', { createEngine }));

    expect(result.current.phase).toBe('computer-thinking');
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    expect(engines[0].findBestMoveCalls[0].fen).toBe(START_FEN);
    expect(result.current.phase).toBe('computer-thinking');

    act(() => engines[0].resolveMove('e2e4'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));
    expect(result.current.snapshot.history.map((m) => m.uci)).toEqual(['e2e4']);
    expect(result.current.snapshot.turn).toBe('black');
  });

  it('the player can never select or move the computer\'s pieces', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.selectSquare('e7'));
    expect(result.current.selectedSquare).toBeNull();

    act(() => result.current.move('e7', 'e5'));
    expect(result.current.snapshot.history).toHaveLength(0);
    expect(result.current.phase).toBe('player-turn');
  });

  it('the player cannot move while the engine is thinking', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(result.current.phase).toBe('computer-thinking'));

    act(() => result.current.move('d2', 'd4'));
    expect(result.current.snapshot.history.map((m) => m.uci)).toEqual(['e2e4']);
    expect(result.current.phase).toBe('computer-thinking');
  });

  it('rejects an illegal/malformed engine move safely, without corrupting game state', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    const fenBeforeBadReply = result.current.snapshot.fen;

    // Not even a legal square pair for this position - a knight cannot go
    // from b1 to b3.
    act(() => engines[0].resolveMove('b1b3'));

    await waitFor(() => expect(result.current.phase).toBe('engine-error'));
    expect(result.current.engineError).toMatch(/could not be applied/i);
    expect(result.current.snapshot.fen).toBe(fenBeforeBadReply);
    expect(result.current.snapshot.history).toHaveLength(1);
  });

  it('an engine search failure leaves the chess position intact and surfaces a recoverable error', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    const fenBeforeFailure = result.current.snapshot.fen;

    act(() => engines[0].rejectMove(new Error('engine worker error')));

    await waitFor(() => expect(result.current.phase).toBe('engine-error'));
    expect(result.current.engineError).toBeTruthy();
    expect(result.current.snapshot.fen).toBe(fenBeforeFailure);
    // The board must not accept moves while the error is unresolved.
    act(() => result.current.move('d2', 'd4'));
    expect(result.current.snapshot.fen).toBe(fenBeforeFailure);
  });

  it('an engine start-up failure surfaces a recoverable error without ever starting a game move', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('black', { createEngine }));

    act(() => engines[0].rejectStart(new Error('timed out waiting for a response to "uci"')));

    await waitFor(() => expect(result.current.phase).toBe('engine-error'));
    expect(result.current.snapshot.history).toHaveLength(0);
  });

  it('retry() disposes the failed engine, starts a fresh one, and can complete the pending move', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('black', { createEngine }));

    act(() => engines[0].rejectStart(new Error('boom')));
    await waitFor(() => expect(result.current.phase).toBe('engine-error'));

    act(() => result.current.retry());
    expect(engines[0].disposeCallCount).toBe(1);
    expect(engines).toHaveLength(2);

    act(() => engines[1].resolveStart());
    await waitFor(() => expect(engines[1].findBestMoveCalls).toHaveLength(1));

    act(() => engines[1].resolveMove('e2e4'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));
    expect(result.current.snapshot.history.map((m) => m.uci)).toEqual(['e2e4']);
  });

  it('a terminal player move does not trigger another engine search', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    // Scholar's mate: White delivers the final (4th) move, checkmating
    // Black - the engine (playing Black) only needs to move twice.
    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    act(() => engines[0].resolveMove('e7e5'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('d1', 'h5'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(2));
    act(() => engines[0].resolveMove('b8c6'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('f1', 'c4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(3));
    act(() => engines[0].resolveMove('g8f6'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('h5', 'f7'));
    await waitFor(() => expect(result.current.phase).toBe('game-over'));
    expect(result.current.snapshot.outcome).toEqual({ status: 'checkmate', winner: 'white' });
    // The engine is disposed immediately on the terminal transition, exactly
    // once - not left alive until unmount.
    expect(engines[0].disposeCallCount).toBe(1);
    // No further search was requested for the now-terminal position.
    expect(engines[0].findBestMoveCalls).toHaveLength(3);
  });

  it('an engine-delivered terminal move ends the game correctly and requests no further search', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    // Fool's mate: White plays badly, Black (the engine) delivers mate on
    // its second move.
    act(() => result.current.move('f2', 'f3'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    act(() => engines[0].resolveMove('e7e5'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('g2', 'g4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(2));
    act(() => engines[0].resolveMove('d8h4'));

    await waitFor(() => expect(result.current.phase).toBe('game-over'));
    expect(result.current.snapshot.outcome).toEqual({ status: 'checkmate', winner: 'black' });
    // The engine is disposed immediately on the terminal transition, exactly
    // once - not left alive until unmount.
    expect(engines[0].disposeCallCount).toBe(1);
    expect(engines[0].findBestMoveCalls).toHaveLength(2);
  });

  it('unmounting after a terminal-move disposal is safe and does not dispose the engine twice', async () => {
    const { createEngine, engines } = engineFactory();
    const { result, unmount } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    // Fool's mate again, purely to reach a terminal, already-disposed state
    // before unmounting.
    act(() => result.current.move('f2', 'f3'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));
    act(() => engines[0].resolveMove('e7e5'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('g2', 'g4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(2));
    act(() => engines[0].resolveMove('d8h4'));
    await waitFor(() => expect(result.current.phase).toBe('game-over'));
    expect(engines[0].disposeCallCount).toBe(1);

    expect(() => unmount()).not.toThrow();
    // The engine that was already disposed on the terminal transition must
    // not be disposed again by the unmount cleanup.
    expect(engines[0].disposeCallCount).toBe(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('rapid repeated retry() calls create only one replacement engine', async () => {
    const { createEngine, engines } = engineFactory();
    const { result } = renderHook(() => useComputerGame('black', { createEngine }));

    act(() => engines[0].rejectStart(new Error('boom')));
    await waitFor(() => expect(result.current.phase).toBe('engine-error'));

    // Two calls in the same tick, as a double-tap before React re-renders
    // with the button disabled would produce.
    act(() => {
      result.current.retry();
      result.current.retry();
    });

    expect(engines[0].disposeCallCount).toBe(1);
    expect(engines).toHaveLength(2);
    expect(result.current.isRetrying).toBe(true);

    act(() => engines[1].resolveStart());
    await waitFor(() => expect(engines[1].findBestMoveCalls).toHaveLength(1));
    expect(engines).toHaveLength(2);

    act(() => engines[1].resolveMove('e2e4'));
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));
    expect(result.current.isRetrying).toBe(false);
  });

  it('an abandoned/disposed game ignores a late engine outcome without error', async () => {
    const { createEngine, engines } = engineFactory();
    const { result, unmount } = renderHook(() => useComputerGame('white', { createEngine }));
    act(() => engines[0].resolveStart());
    await waitFor(() => expect(result.current.phase).toBe('player-turn'));

    act(() => result.current.move('e2', 'e4'));
    await waitFor(() => expect(engines[0].findBestMoveCalls).toHaveLength(1));

    unmount();
    expect(engines[0].disposeCallCount).toBe(1);

    // The abandoned engine's reply finally arrives after the game/session
    // was torn down - this must not throw, warn about updating an
    // unmounted component, or do anything observable.
    expect(() => engines[0].resolveMove('e7e5')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
