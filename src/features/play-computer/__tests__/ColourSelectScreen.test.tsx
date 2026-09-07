import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerColour } from '../../../chess/chessTypes';
import type { EngineDifficulty } from '../../../engine/engineTypes';
import { ColourSelectScreen } from '../ColourSelectScreen';

function renderScreen() {
  const selections: Array<{ colour: PlayerColour; difficulty: EngineDifficulty }> = [];
  render(
    <ColourSelectScreen
      onBack={() => {}}
      onSelect={(colour, difficulty) => selections.push({ colour, difficulty })}
    />,
  );
  return selections;
}

describe('ColourSelectScreen', () => {
  it('defaults to Gentle and picking White without touching the selector uses it', async () => {
    const user = userEvent.setup();
    const selections = renderScreen();

    expect(screen.getByRole('radio', { name: 'Gentle' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: /play as white/i }));
    expect(selections).toEqual([{ colour: 'white', difficulty: 'gentle' }]);
  });

  it('picking Black without touching the selector also defaults to Gentle', async () => {
    const user = userEvent.setup();
    const selections = renderScreen();

    await user.click(screen.getByRole('button', { name: /play as black/i }));
    expect(selections).toEqual([{ colour: 'black', difficulty: 'gentle' }]);
  });

  it('selecting a different difficulty then a colour passes that pair through', async () => {
    const user = userEvent.setup();
    const selections = renderScreen();

    await user.click(screen.getByRole('radio', { name: 'Challenging' }));
    expect(screen.getByRole('radio', { name: 'Challenging' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Gentle' })).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: /play as white/i }));
    expect(selections).toEqual([{ colour: 'white', difficulty: 'challenging' }]);
  });

  it('exposes all four difficulty options in an accessible radiogroup', () => {
    renderScreen();
    expect(screen.getByRole('radiogroup', { name: /computer difficulty/i })).toBeInTheDocument();
    for (const label of ['Gentle', 'Casual', 'Challenging', 'Strongest']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });
});
