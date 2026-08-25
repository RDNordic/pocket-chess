import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayLocalScreen } from '../PlayLocalScreen';

describe('PlayLocalScreen', () => {
  it('lets two local players complete legal moves on one board', async () => {
    const user = userEvent.setup();
    render(<PlayLocalScreen onExit={() => {}} />);

    expect(screen.getByText(/white to move/i)).toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: /^e2,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e4,/i }));

    expect(screen.getByText(/black to move/i)).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e4,.*white pawn/i })).toBeInTheDocument();
  });

  it('rejects an illegal destination and keeps the piece in place', async () => {
    const user = userEvent.setup();
    render(<PlayLocalScreen onExit={() => {}} />);

    await user.click(screen.getByRole('gridcell', { name: /^e2,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e5$/i }));

    expect(screen.getByText(/white to move/i)).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e2,.*white pawn/i })).toBeInTheDocument();
  });

  it('undo restores the previous position', async () => {
    const user = userEvent.setup();
    render(<PlayLocalScreen onExit={() => {}} />);

    await user.click(screen.getByRole('gridcell', { name: /^e2,/i }));
    await user.click(screen.getByRole('gridcell', { name: /^e4,/i }));
    expect(screen.getByText(/black to move/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(screen.getByText(/white to move/i)).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e2,.*white pawn/i })).toBeInTheDocument();
  });

  it('shows the winner and blocks the board after checkmate (Fool\'s Mate)', async () => {
    const user = userEvent.setup();
    render(<PlayLocalScreen onExit={() => {}} />);

    const moves: Array<[string, string]> = [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ];
    for (const [from, to] of moves) {
      await user.click(screen.getByRole('gridcell', { name: new RegExp(`^${from},`, 'i') }));
      await user.click(
        screen.getByRole('gridcell', { name: new RegExp(`^${to}(,|$)`, 'i') }),
      );
    }

    expect(screen.getByText(/black wins by checkmate/i)).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e2,/i })).toBeDisabled();
  });

});
