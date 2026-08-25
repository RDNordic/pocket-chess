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
    await user.click(screen.getByRole('gridcell', { name: /^e4$/i }));

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
    await user.click(screen.getByRole('gridcell', { name: /^e4$/i }));
    expect(screen.getByText(/black to move/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /undo/i }));

    expect(screen.getByText(/white to move/i)).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e2,.*white pawn/i })).toBeInTheDocument();
  });
});
