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

describe('ComputerGameScreen', () => {
  it('playing White: renders the board and applies the engine reply after a player move', async () => {
    const user = userEvent.setup();
    render(
      <ComputerGameScreen
        playerColour="white"
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
        onExit={() => {}}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e2e4') }}
      />,
    );

    expect(
      await screen.findByRole('gridcell', { name: /^e4,.*white pawn/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/black to move/i)).toBeInTheDocument();
  });

  it('Back button calls onExit', async () => {
    const user = userEvent.setup();
    let exited = false;
    render(
      <ComputerGameScreen
        playerColour="white"
        onExit={() => {
          exited = true;
        }}
        engineOptions={{ createEngine: () => new ImmediateFakeEngine('e7e5') }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(exited).toBe(true);
  });
});
