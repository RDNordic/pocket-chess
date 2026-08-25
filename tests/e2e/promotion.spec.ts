import { test, expect } from '@playwright/test';

// Seeds the local game one move from promotion via the test-only FEN seam
// (src/testing/testFenSeam.ts), rather than replaying dozens of legal
// moves from the start position just to reach the final rank.
const ONE_STEP_FROM_PROMOTION_FEN = '7k/4P3/8/8/8/8/8/K7 w - - 0 1';

test('promotion dialog offers all four choices and applies the selection', async ({ page }) => {
  await page.addInitScript((fen) => {
    window.__POCKET_CHESS_TEST_FEN__ = fen;
  }, ONE_STEP_FROM_PROMOTION_FEN);

  await page.goto('/');
  await page.getByRole('button', { name: /play \(local two-player\)/i }).click();

  await page.getByRole('gridcell', { name: /^e7,/ }).click();
  await page.getByRole('gridcell', { name: /^e8(,|$)/ }).click();

  const dialog = page.getByRole('dialog', { name: /choose promotion piece/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  await expect(page.getByRole('button', { name: /promote to queen/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to rook/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to bishop/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /promote to knight/i })).toBeVisible();

  await page.getByRole('button', { name: /promote to rook/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('gridcell', { name: /^e8,.*white rook/i })).toBeVisible();
});
