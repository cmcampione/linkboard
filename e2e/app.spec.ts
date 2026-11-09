import { expect, test } from '@playwright/test';

test('opens the main page directly at the app root', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Linkboard, pagina iniziale' })).toBeVisible();
});
