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
  // that the default flow (covered by the Black test below) works. Clicks
  // the visible label text (what a real pointer user clicks), not the
  // `role=radio` locator directly - the underlying `<input>` is visually
  // hidden by design (see ColourSelectScreen.module.css), so a literal
  // pointer click can only ever land on its label.
  await page
    .getByRole('radiogroup', { name: /computer difficulty/i })
    .getByText('Casual', { exact: true })
    .click();
  await expect(page.getByRole('radio', { name: 'Casual' })).toBeChecked();
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

test('difficulty selector: arrow-key selection reaches the game session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play computer/i }).click();

  // `locator.focus()` doesn't require visibility (unlike `.click()`) - the
  // radio input is intentionally visually hidden, so this is the right way
  // to move real keyboard focus onto it for this test, matching what a
  // Tab keypress from earlier in the page would land on.
  await page.getByRole('radio', { name: 'Gentle' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Challenging' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Gentle' })).not.toBeChecked();

  await page.getByRole('button', { name: /play as black/i }).click();
  await expect(page.getByText('Challenging')).toBeVisible();
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
