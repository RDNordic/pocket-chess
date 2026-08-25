import { test, expect } from '@playwright/test';

test('a complete Fool\'s Mate reports the winner and locks the board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play \(local two-player\)/i }).click();

  const moves: Array<[string, string]> = [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ];
  for (const [from, to] of moves) {
    await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${to}(,|$)`) }).click();
  }

  await expect(page.getByText(/black wins by checkmate/i)).toBeVisible();

  // Board interaction is blocked after the game ends.
  await expect(page.getByRole('gridcell', { name: /^e2,/ })).toBeDisabled();
});
