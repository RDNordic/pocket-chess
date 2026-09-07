import { test, expect } from '@playwright/test';

// Uses the actual vendored Stockfish Worker/WASM (see
// tests/engine-integration/ for the lower-level, adapter-only real-engine
// test this complements) - so these assertions never depend on exactly
// which move the engine picks, only that a legal reply arrives and control
// returns to the player.

test('play computer as White: player moves, the real engine replies, and control returns', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play computer/i }).click();

  // Picks a non-default difficulty before starting - confirms the
  // selector reaches the game session (build spec phase 3A), not just
  // that the default flow (covered by the Black test below) works.
  await page.getByRole('radio', { name: 'Casual' }).click();
  await page.getByRole('button', { name: /play as white/i }).click();
  await expect(page.getByText(/white to move/i)).toBeVisible();
  await expect(page.getByText('Casual')).toBeVisible();

  await page.getByRole('gridcell', { name: /^e2,/ }).click();
  await page.getByRole('gridcell', { name: /^e4(,|$)/ }).click();

  await expect(page.getByText(/computer thinking/i)).toBeVisible();
  // Board interaction is blocked while the engine searches.
  await expect(page.getByRole('gridcell', { name: /^d2,/ })).toBeDisabled();

  // The real Stockfish Worker/WASM returns a legal reply and control comes
  // back to the player - generous timeout to cover WASM start-up plus the
  // fixed search time, not just the search itself. Which exact move Black
  // (the engine) picked is deliberately not asserted.
  await expect(page.getByText(/white to move/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('gridcell', { name: /^e2(,|$)/ })).toBeEnabled();
});

test('play computer as Black: the real engine moves first automatically', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play computer/i }).click();
  // No difficulty selector interaction - the default (Gentle) applies.
  await page.getByRole('button', { name: /play as black/i }).click();

  await expect(page.getByText(/computer thinking/i)).toBeVisible();
  await expect(page.getByText('Gentle')).toBeVisible();

  // White (the engine) moves first without any player input.
  await expect(page.getByText(/black to move/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('gridcell', { name: /^e7,/ })).toBeEnabled();
});
