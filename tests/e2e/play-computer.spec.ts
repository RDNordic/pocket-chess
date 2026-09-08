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

test('offline regression (hotfix/play-computer-offline-regression): Play Computer works with the service worker fully offline', async ({
  page,
  context,
}) => {
  // Reproduces the physical-iPhone Airplane Mode scenario end to end: load
  // the app once online so the service worker installs and precaches the
  // engine's .js/.wasm (and every other precached asset), reload so the
  // page is actually controlled by it, then go fully offline and reload
  // again before ever touching Play Computer - nothing below this point
  // may depend on the network in any way.
  await page.goto('/');
  // The very first load is never itself controlled by the service worker
  // it registers (per spec) - wait for the registration to be fully
  // active, then reload so *this* navigation is controlled and the
  // install-time precache (engine .js/.wasm included) has actually run.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });

  await context.setOffline(true);
  try {
    await page.reload();

    await page.getByRole('button', { name: /play computer/i }).click();
    await page
      .getByRole('radiogroup', { name: /computer difficulty/i })
      .getByText('Casual', { exact: true })
      .click();
    await page.getByRole('button', { name: /play as white/i }).click();

    // The real, offline-served Stockfish Worker/WASM must still complete
    // its handshake and reply - generous timeout for the same reason as
    // the online test (WASM start-up), plus this hotfix's own widened
    // handshake budget for a cold, cache-served start-up.
    await expect(page.getByText(/white to move/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Casual')).toBeVisible();

    await page.getByRole('gridcell', { name: /^e2,/ }).click();
    await page.getByRole('gridcell', { name: /^e4(,|$)/ }).click();
    await expect(page.getByText(/computer thinking/i)).toBeVisible();
    await expect(page.getByText(/white to move/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('gridcell', { name: /^e2(,|$)/ })).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }
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
