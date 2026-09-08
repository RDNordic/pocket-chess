import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChessEngine } from '../../../engine/ChessEngine';
import type { EngineMove, SearchLimits } from '../../../engine/engineTypes';
import { ComputerGameScreen } from '../ComputerGameScreen';

/** Simple fake engine that responds immediately - this file only checks
 * that the screen wires `useComputerGame`'s output into rendered text and
 * board interaction correctly; orchestration semantics are covered
 * exhaustively in useComputerGame.test.ts against a fully controllable
 * fake. */
class ImmediateFakeEngine implements ChessEngine {
  state: ChessEngine['state'] = 'uninitialised';

  constructor(private readonly reply: string) {}

  async start(): Promise<void> {
    this.state = 'ready';
  }

  async waitUntilReady(): Promise<void> {}

  async findBestMove(_fen: string, _limits: SearchLimits): Promise<EngineMove> {
    return { uci: this.reply };
  }

  async stop(): Promise<void> {}

  dispose(): void {
    this.state = 'disposed';
  }
}

/** Engine whose `start()` rejects on its first two instances (so the
 * screen's automatic startup retry - see useComputerGame's
 * `STARTUP_ATTEMPT_LIMIT` - also fails, reaching `engine-error`) and never
 * settles on any later instance, so the test can observe the Retry button
 * staying disabled while a *manually retried* replacement starts - used
 * only for the Retry-button test below. */
class FailFirstThenHangEngine implements ChessEngine {
  state: ChessEngine['state'] = 'uninitialised';

  constructor(private readonly shouldFail: boolean) {}

  async start(): Promise<void> {
    if (this.shouldFail) throw new Error('boom');
    return new Promise(() => {});
  }

  async waitUntilReady(): Promise<void> {}

  async findBestMove(): Promise<EngineMove> {
    return new Promise(() => {});
  }

  async stop(): Promise<void> {}

  dispose(): void {
    this.state = 'disposed';
  }
}

function failThenHangEngineFactory(): { createEngine: () => ChessEngine } {
  let callCount = 0;
  return {
    // The first two instances (the initial attempt plus the hook's own
    // automatic retry) fail; every instance after that (the manual Retry
    // button click this test exercises) hangs forever.
    createEngine: () => new FailFirstThenHangEngine(++callCount <= 2),
  };
}

describe('ComputerGameScreen', () => {
  it('playing White: renders the board and applies the engine reply after a player move', async () => {
    const user = userEvent.setup();
    render(
      <ComputerGameScreen
        playerColour="white"
        difficulty="gentle"
        onExit={() => {}}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
      />,
    );

    expect(await screen.findByText(/white to move/i)).toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: /^e2,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e4(,|$)/i }));

    expect(await screen.findByText(/white to move/i)).toBeInTheDocument();
    expect(
      await screen.findByRole('gridcell', { name: /^e5,.*black pawn/i }),
    ).toBeInTheDocument();
  });

  it('playing Black: the computer moves first automatically', async () => {
    render(
      <ComputerGameScreen
        playerColour="black"
        difficulty="gentle"
        onExit={() => {}}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e2e4') }}
      />,
    );

    expect(
      await screen.findByRole('gridcell', { name: /^e4,.*white pawn/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/black to move/i)).toBeInTheDocument();
  });

  it('the Retry button is disabled while a replacement engine is starting', async () => {
    const user = userEvent.setup();
    const { createEngine } = failThenHangEngineFactory();
    render(
      <ComputerGameScreen
        playerColour="white"
        difficulty="gentle"
        onExit={() => {}}
        engineOptions={{ createEngine }}
      />,
    );

    const retryButton = await screen.findByRole('button', { name: /retry/i });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);

    const retryingButton = await screen.findByRole('button', { name: /retrying/i });
    expect(retryingButton).toBeDisabled();
  });

  it('Back button calls onExit', async () => {
    const user = userEvent.setup();
    let exited = false;
    render(
      <ComputerGameScreen
        playerColour="white"
        difficulty="gentle"
        onExit={() => {
          exited = true;
        }}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(exited).toBe(true);
  });

  it('renders a compact badge for the active difficulty', async () => {
    render(
      <ComputerGameScreen
        playerColour="white"
        difficulty="challenging"
        onExit={() => {}}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
      />,
    );

    expect(await screen.findByText('Challenging')).toBeInTheDocument();
  });

  it('passes the difficulty prop through to the engine as a sessionConfig, not a raw engineOptions override', async () => {
    let receivedConfig: unknown;
    class RecordingFakeEngine extends ImmediateFakeEngine {
      async start(config?: unknown): Promise<void> {
        receivedConfig = config;
        return super.start();
      }
    }

    render(
      <ComputerGameScreen
        playerColour="white"
        difficulty="casual"
        onExit={() => {}}
        engineOptions={{ createEngine: () => new RecordingFakeEngine('e7e5') }}
      />,
    );

    await screen.findByText(/white to move/i);
    expect(receivedConfig).toEqual({ difficulty: 'casual' });
  });
});
