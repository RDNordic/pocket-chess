import { test, expect } from '@playwright/test';

test('two humans can play a legal opening on one board', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /play \(local two-player\)/i }).click();
  await expect(page.getByText(/white to move/i)).toBeVisible();

  await page.getByRole('gridcell', { name: /^e2,/ }).click();
  await page.getByRole('gridcell', { name: /^e4$/ }).click();

  await expect(page.getByText(/black to move/i)).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /^e4,.*white pawn/ })).toBeVisible();
});
