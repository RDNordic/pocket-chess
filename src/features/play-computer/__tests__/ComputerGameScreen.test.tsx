import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
        onNewGame={() => {}}
        onRematch={() => {}}
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
        onNewGame={() => {}}
        onRematch={() => {}}
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
        onNewGame={() => {}}
        onRematch={() => {}}
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
        onNewGame={() => {}}
        onRematch={() => {}}
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
        onNewGame={() => {}}
        onRematch={() => {}}
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
        onNewGame={() => {}}
        onRematch={() => {}}
        engineOptions={{ createEngine: () => new RecordingFakeEngine('e7e5') }}
      />,
    );

    await screen.findByText(/white to move/i);
    expect(receivedConfig).toEqual({ difficulty: 'casual' });
  });

  describe('Phase 3B: resign', () => {
    it('cancelling the confirmation leaves the game untouched', async () => {
      const user = userEvent.setup();
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {}}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);

      const resignButton = screen.getByRole('button', { name: /^resign$/i });
      await user.click(resignButton);
      const dialog = await screen.findByRole('alertdialog', { name: /resign this game/i });
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText(/white to move/i)).toBeInTheDocument();
      // Focus must return to the button that opened the dialog, not fall
      // through to document.body.
      expect(resignButton).toHaveFocus();
    });

    it('closing the confirmation with Escape also returns focus to the Resign button', async () => {
      const user = userEvent.setup();
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {}}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);

      const resignButton = screen.getByRole('button', { name: /^resign$/i });
      await user.click(resignButton);
      await screen.findByRole('alertdialog', { name: /resign this game/i });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(resignButton).toHaveFocus();
    });

    it('confirming ends the game with an explicit resignation result', async () => {
      const user = userEvent.setup();
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {}}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);

      await user.click(screen.getByRole('button', { name: /^resign$/i }));
      const dialog = await screen.findByRole('alertdialog', { name: /resign this game/i });
      await user.click(within(dialog).getByRole('button', { name: /^resign$/i }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(await screen.findByText(/black wins by resignation/i)).toBeInTheDocument();
      // The board is disabled once the game has ended, same as any other
      // terminal state.
      expect(screen.getByRole('gridcell', { name: /^e2,/i })).toBeDisabled();
    });
  });

  describe('Phase 3B: new game / rematch', () => {
    it('New game confirms before abandoning an in-progress game', async () => {
      const user = userEvent.setup();
      let newGameCalls = 0;
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {
            newGameCalls += 1;
          }}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);

      const newGameButton = screen.getByRole('button', { name: /new game/i });
      await user.click(newGameButton);
      const dialog = await screen.findByRole('alertdialog', { name: /start a new game/i });
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
      expect(newGameCalls).toBe(0);
      expect(newGameButton).toHaveFocus();

      await user.click(screen.getByRole('button', { name: /new game/i }));
      const secondDialog = await screen.findByRole('alertdialog', { name: /start a new game/i });
      await user.click(within(secondDialog).getByRole('button', { name: /new game/i }));
      expect(newGameCalls).toBe(1);
    });

    it('New game skips confirmation once the game has already ended', async () => {
      const user = userEvent.setup();
      let newGameCalls = 0;
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {
            newGameCalls += 1;
          }}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);
      await user.click(screen.getByRole('button', { name: /^resign$/i }));
      const dialog = await screen.findByRole('alertdialog', { name: /resign this game/i });
      await user.click(within(dialog).getByRole('button', { name: /^resign$/i }));
      await screen.findByText(/black wins by resignation/i);

      await user.click(screen.getByRole('button', { name: /new game/i }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(newGameCalls).toBe(1);
    });

    it('Rematch is offered once the game ends and calls onRematch', async () => {
      const user = userEvent.setup();
      let rematchCalls = 0;
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {}}
          onRematch={() => {
            rematchCalls += 1;
          }}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);
      expect(screen.queryByRole('button', { name: /rematch/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^resign$/i }));
      const dialog = await screen.findByRole('alertdialog', { name: /resign this game/i });
      await user.click(within(dialog).getByRole('button', { name: /^resign$/i }));

      const rematchButton = await screen.findByRole('button', { name: /rematch/i });
      await user.click(rematchButton);
      expect(rematchCalls).toBe(1);
    });
  });

  describe('Phase 3B: take back', () => {
    it('is disabled until a move exists to take back, then restores the position on click', async () => {
      const user = userEvent.setup();
      render(
        <ComputerGameScreen
          playerColour="white"
          difficulty="gentle"
          onExit={() => {}}
          onNewGame={() => {}}
          onRematch={() => {}}
          engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
        />,
      );
      await screen.findByText(/white to move/i);
      expect(screen.getByRole('button', { name: /take back/i })).toBeDisabled();

      await user.click(screen.getByRole('gridcell', { name: /^e2,/i }));
      await user.click(screen.getByRole('gridcell', { name: /^e4(,|$)/i }));
      await screen.findByRole('gridcell', { name: /^e5,.*black pawn/i });

      const takebackButton = await screen.findByRole('button', { name: /^take back$/i });
      await waitFor(() => expect(takebackButton).toBeEnabled());
      await user.click(takebackButton);

      await waitFor(() => expect(screen.getByRole('button', { name: /take back/i })).toBeDisabled());
      expect(screen.queryByRole('gridcell', { name: /^e5,.*black pawn/i })).not.toBeInTheDocument();
      expect(await screen.findByText(/white to move/i)).toBeInTheDocument();
    });
  });
});
