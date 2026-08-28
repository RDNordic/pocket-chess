import { test, expect } from '@playwright/test';

test('promotion dialog offers all four choices and applies the selection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play \(local two-player\)/i }).click();

  // A short, legal, deterministic move sequence (verified against chess.js
  // directly) that reaches a promotion *capture* for White without any
  // test-only seam: White's h-pawn marches down, captures on g7, then
  // captures Black's h8 rook while promoting. Black's replies are chosen
  // only to stay out of the way; none of them affect the outcome under
  // test.
  const moves: Array<[string, string]> = [
    ['h2', 'h4'],
    ['a7', 'a5'],
    ['h4', 'h5'],
    ['a5', 'a4'],
    ['h5', 'h6'],
    ['a4', 'a3'],
    ['h6', 'g7'],
    ['a3', 'b2'],
  ];
  for (const [from, to] of moves) {
    await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${to}(,|$)`) }).click();
  }

  // Final move: White's pawn on g7 captures Black's rook on h8, which
  // requires a promotion choice - this is what opens the dialog.
  await page.getByRole('gridcell', { name: /^g7,/ }).click();
  await page.getByRole('gridcell', { name: /^h8,/ }).click();

  const dialog = page.getByRole('dialog', { name: /choose promotion piece/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  await expect(page.getByRole('button', { name: /promote to queen/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to rook/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to bishop/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to knight/i })).toBeVisible();

  await page.getByRole('button', { name: /promote to rook/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('gridcell', { name: /^h8,.*white rook/i })).toBeVisible();
});
