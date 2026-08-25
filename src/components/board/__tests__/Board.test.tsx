import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChessGame } from '../../../chess/ChessGame';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../../chess/chessTypes';
import { Board } from '../Board';

/**
 * Minimal harness mirroring useLocalGame's shape, but seeded from a fixed
 * FEN so tests can reach a promotion position deterministically without
 * replaying a long move sequence from the starting position. This harness
 * lives only in test code - production code has no way to load an
 * arbitrary FEN yet.
 */
function PromotionHarness({ fen }: { fen: string }) {
  const [game] = useState(() => new ChessGame(fen));
  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(() => game.getSnapshot());
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);

  const legalTargets = selectedSquare ? game.legalDestinations(selectedSquare) : [];

  function selectSquare(square: SquareId) {
    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }
    setSelectedSquare(square);
  }

  function move(from: SquareId, to: SquareId, promotion?: PromotionPiece) {
    const applied = game.applyMove({ from, to, promotion });
    if (applied) {
      setSnapshot(game.getSnapshot());
    }
    setSelectedSquare(null);
  }

  return (
    <Board
      snapshot={snapshot}
      orientation="white"
      legalTargets={legalTargets}
      selectedSquare={selectedSquare}
      onSelectSquare={selectSquare}
      onMove={move}
      requiresPromotion={(from, to) => game.requiresPromotion(from, to)}
    />
  );
}

const ONE_STEP_FROM_PROMOTION_FEN = '7k/4P3/8/8/8/8/8/K7 w - - 0 1';

describe('Board promotion flow', () => {
  it('asks the domain layer whether promotion is required, not the rank directly', async () => {
    const user = userEvent.setup();
    render(<PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} />);

    await user.click(screen.getByRole('gridcell', { name: /^e7,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e8(,|$)/i }));

    expect(await screen.findByRole('dialog', { name: /choose promotion piece/i })).toBeInTheDocument();
  });

  it('is an accessible modal exposing all four promotion choices', async () => {
    const user = userEvent.setup();
    render(<PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} />);

    await user.click(screen.getByRole('gridcell', { name: /^e7,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e8(,|$)/i }));

    const dialog = await screen.findByRole('dialog', { name: /choose promotion piece/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const queen = screen.getByRole('button', { name: /promote to queen/i });
    const rook = screen.getByRole('button', { name: /promote to rook/i });
    const bishop = screen.getByRole('button', { name: /promote to bishop/i });
    const knight = screen.getByRole('button', { name: /promote to knight/i });
    expect(queen).toBeInTheDocument();
    expect(rook).toBeInTheDocument();
    expect(bishop).toBeInTheDocument();
    expect(knight).toBeInTheDocument();

    // Initial focus lands on the first option (queen).
    expect(queen).toHaveFocus();
  });

  it('applies the chosen underpromotion piece and closes the dialog', async () => {
    const user = userEvent.setup();
    render(<PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} />);

    await user.click(screen.getByRole('gridcell', { name: /^e7,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e8(,|$)/i }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: /promote to knight/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e8,.*white knight/i })).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the square that opened the dialog', async () => {
    const user = userEvent.setup();
    render(<PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} />);

    await user.click(screen.getByRole('gridcell', { name: /^e7,/i }));
    // Clicking the destination square is what actually opens the dialog,
    // so focus should return there - not to the source square.
    const destinationSquare = screen.getByRole('gridcell', { name: /^e8(,|$)/i });
    await user.click(destinationSquare);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The pawn never moved - promotion was cancelled.
    expect(screen.getByRole('gridcell', { name: /^e7,.*white pawn/i })).toBeInTheDocument();
    expect(destinationSquare).toHaveFocus();
  });
});
