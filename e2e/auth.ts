import { expect, type Page } from '@playwright/test';

export const ADMIN = { username: 'smoke', password: 'smoke-test-password' };

export async function signIn(page: Page) {
  await page.goto('/login');
  if (
    await page
      .getByRole('heading', { name: 'Set up Axlebook' })
      .isVisible()
      .catch(() => false)
  )
    return;
  await page.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();
}
