import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChessGame } from '../../../chess/ChessGame';
import type { GameStateSnapshot, PromotionPiece, SquareId } from '../../../chess/chessTypes';
import { Board } from '../Board';
import { pieceAssetUrl } from '../pieceAssets';

/**
 * Minimal harness mirroring useLocalGame's shape, but seeded from a fixed
 * FEN so tests can reach a promotion position deterministically without
 * replaying a long move sequence from the starting position. This harness
 * lives only in test code - production code has no way to load an
 * arbitrary FEN yet.
 */
function PromotionHarness({ fen, resetSignal }: { fen: string; resetSignal?: number }) {
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
      resetSignal={resetSignal}
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

    // Each option's decorative image is mapped to the correct piece - the
    // promoting side here is White (see ONE_STEP_FROM_PROMOTION_FEN).
    expect(queen.querySelector('img')).toHaveAttribute('src', pieceAssetUrl('q', 'white'));
    expect(rook.querySelector('img')).toHaveAttribute('src', pieceAssetUrl('r', 'white'));
    expect(bishop.querySelector('img')).toHaveAttribute('src', pieceAssetUrl('b', 'white'));
    expect(knight.querySelector('img')).toHaveAttribute('src', pieceAssetUrl('n', 'white'));
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

  it('a bumped resetSignal (e.g. a takeback) force-closes an open promotion dialog', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} resetSignal={0} />,
    );

    await user.click(screen.getByRole('gridcell', { name: /^e7,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e8(,|$)/i }));
    await screen.findByRole('dialog');

    rerender(<PromotionHarness fen={ONE_STEP_FROM_PROMOTION_FEN} resetSignal={1} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Board last-computer-move highlight', () => {
  const lastComputerMove = { from: 'e7', to: 'e5' } as const;

  function snapshotAfterE4E5(): GameStateSnapshot {
    const game = new ChessGame();
    game.applyMove({ from: 'e2', to: 'e4' });
    game.applyMove({ from: 'e7', to: 'e5' });
    return game.getSnapshot();
  }

  it('marks exactly the from/to squares of the given move, not other occupied squares', () => {
    render(
      <Board
        snapshot={snapshotAfterE4E5()}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        lastComputerMove={lastComputerMove}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );

    expect(
      screen.getByRole('gridcell', { name: /^e7,.*computer's last move/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: /^e5,.*computer's last move/i }),
    ).toBeInTheDocument();
    // e4 (the player's own move destination) has a piece but is not part of
    // the computer's move, so it must not carry the highlight.
    expect(screen.getByRole('gridcell', { name: /^e4,/i })).not.toHaveAccessibleName(
      /computer's last move/i,
    );
  });

  it('does not render the highlight when no computer move has happened yet', () => {
    render(
      <Board
        snapshot={snapshotAfterE4E5()}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        lastComputerMove={null}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );

    // "computer's last move" only ever appears inside a gridcell's
    // aria-label, never as rendered text content - queryByText would never
    // find it regardless of whether the highlight were (incorrectly)
    // present, making that assertion vacuously true. queryByRole's `name`
    // matches the computed accessible name (aria-label included), so this
    // genuinely fails if any square is ever mislabelled as the computer's
    // last move here.
    expect(
      screen.queryByRole('gridcell', { name: /computer's last move/i }),
    ).not.toBeInTheDocument();
  });

  it('highlights the same logical squares regardless of board orientation (flip-invariant)', () => {
    const snapshot = snapshotAfterE4E5();
    const { rerender } = render(
      <Board
        snapshot={snapshot}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        lastComputerMove={lastComputerMove}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );
    expect(
      screen.getByRole('gridcell', { name: /^e7,.*computer's last move/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: /^e5,.*computer's last move/i }),
    ).toBeInTheDocument();

    rerender(
      <Board
        snapshot={snapshot}
        orientation="black"
        legalTargets={[]}
        selectedSquare={null}
        lastComputerMove={lastComputerMove}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );
    // Same logical squares (e7/e5) still carry the highlight after flipping
    // - only their position within the rendered grid changed.
    expect(
      screen.getByRole('gridcell', { name: /^e7,.*computer's last move/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: /^e5,.*computer's last move/i }),
    ).toBeInTheDocument();
  });

  it('a highlighted square remains clickable/selectable', async () => {
    const user = userEvent.setup();
    const onSelectSquare = vi.fn();
    render(
      <Board
        snapshot={snapshotAfterE4E5()}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        lastComputerMove={lastComputerMove}
        onSelectSquare={onSelectSquare}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );

    await user.click(screen.getByRole('gridcell', { name: /^e5,.*computer's last move/i }));
    expect(onSelectSquare).toHaveBeenCalledWith('e5');
  });
});

describe('Board piece rendering (board-piece-theme-v1)', () => {
  it('renders each occupied square with the correctly mapped, decorative piece image', () => {
    render(
      <Board
        snapshot={new ChessGame().getSnapshot()}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );

    const whiteKingSquare = screen.getByRole('gridcell', { name: /^e1,.*white king/i });
    const image = whiteKingSquare.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', pieceAssetUrl('k', 'white'));
    // Decorative only - the gridcell's own aria-label already carries the
    // piece name, so the image must never be independently announced.
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveAttribute('alt', '');
  });

  it('maps every starting-position piece to its own colour/type asset, not a shared fallback', () => {
    render(
      <Board
        snapshot={new ChessGame().getSnapshot()}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );

    const cases: Array<[square: string, type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p', colour: 'white' | 'black']> = [
      ['e1', 'k', 'white'],
      ['d1', 'q', 'white'],
      ['a1', 'r', 'white'],
      ['c1', 'b', 'white'],
      ['b1', 'n', 'white'],
      ['e2', 'p', 'white'],
      ['e8', 'k', 'black'],
      ['d8', 'q', 'black'],
      ['a8', 'r', 'black'],
      ['c8', 'b', 'black'],
      ['b8', 'n', 'black'],
      ['e7', 'p', 'black'],
    ];

    for (const [square, type, colour] of cases) {
      const cell = screen.getByRole('gridcell', { name: new RegExp(`^${square},`, 'i') });
      const image = cell.querySelector('img');
      expect(image).toHaveAttribute('src', pieceAssetUrl(type, colour));
    }
  });

  it('flipping the board keeps every piece mapped to its correct logical square', () => {
    const snapshot = new ChessGame().getSnapshot();
    const { rerender } = render(
      <Board
        snapshot={snapshot}
        orientation="white"
        legalTargets={[]}
        selectedSquare={null}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );
    expect(
      screen.getByRole('gridcell', { name: /^e1,.*white king/i }).querySelector('img'),
    ).toHaveAttribute('src', pieceAssetUrl('k', 'white'));

    rerender(
      <Board
        snapshot={snapshot}
        orientation="black"
        legalTargets={[]}
        selectedSquare={null}
        onSelectSquare={() => {}}
        onMove={() => {}}
        requiresPromotion={() => false}
      />,
    );
    // Same logical square (e1), still the white king, after flipping.
    expect(
      screen.getByRole('gridcell', { name: /^e1,.*white king/i }).querySelector('img'),
    ).toHaveAttribute('src', pieceAssetUrl('k', 'white'));
  });
});
