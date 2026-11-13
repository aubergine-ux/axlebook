import { expect, test } from '@playwright/test';
import { SUBPATH_URL } from '../playwright.config';
import { ADMIN } from './auth';

/**
 * The same build served under /garage: pages, deep links, assets, the API and installable-app
 * files all have to resolve against the mount path.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page: _ }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
});

test('runs under a subpath: setup, deep links, reload, assets and API', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/v1/')) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => failed.push(`error ${e.message}`));

  await page.goto(`${SUBPATH_URL}/`);
  await expect(page).toHaveURL(`${SUBPATH_URL}/setup`);
  await page.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Confirm password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();
  await expect(page).toHaveURL(`${SUBPATH_URL}/`);
  // The header logo is one of the files that used to be addressed from the root.
  const logo = page.locator('header img').first();
  await expect(logo).toHaveJSProperty('complete', true);
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Add vehicle' }).click();
  await expect(page).toHaveURL(`${SUBPATH_URL}/vehicles/new`);
  await page.getByRole('textbox', { name: 'Year' }).fill('2012');
  await page.getByRole('textbox', { name: 'Make' }).fill('Volvo');
  await page.getByRole('textbox', { name: 'Model' }).fill('V70');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /V70/ })).toBeVisible();
  expect(page.url()).toMatch(new RegExp(`^${SUBPATH_URL}/vehicles/\\d+$`));

  // A deep link survives a reload: the page and its assets load from under the mount path.
  await page.getByRole('link', { name: 'Fuel', exact: true }).click();
  await expect(page).toHaveURL(/\/garage\/vehicles\/\d+\/fuel$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /V70/ })).toBeVisible();
  await expect(page.getByText(/No fill-ups yet/)).toBeVisible();

  // Links the app builds for downloads and docs carry the prefix too.
  await page.goto(`${SUBPATH_URL}/settings`);
  await expect(page.getByRole('link', { name: 'Download backup' })).toHaveAttribute(
    'href',
    '/garage/api/v1/backup',
  );
  const docs = await page.request.get(`${SUBPATH_URL}/api/docs`);
  expect(docs.status()).toBe(200);
  for (const file of ['manifest.webmanifest', 'sw.js', 'favicon.svg'])
    expect((await page.request.get(`${SUBPATH_URL}/${file}`)).status(), file).toBe(200);
  const manifest = await (await page.request.get(`${SUBPATH_URL}/manifest.webmanifest`)).json();
  expect(manifest).toMatchObject({ start_url: '.', scope: '.' });

  expect(failed).toEqual([]);
});

test('a shared history link works under the subpath without signing in', async ({
  page,
  browser,
}) => {
  await page.goto(`${SUBPATH_URL}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();
  const origin = { origin: new URL(SUBPATH_URL).origin };
  const [vehicle] = await (await page.request.get(`${SUBPATH_URL}/api/v1/vehicles`)).json();
  await page.request.post(`${SUBPATH_URL}/api/v1/vehicles/${vehicle.id}/records`, {
    data: { kind: 'service', date: '2026-02-01', odometer: 120_000, title: 'Timing belt', cost: 0 },
    headers: origin,
  });
  const link = await (
    await page.request.post(`${SUBPATH_URL}/api/v1/vehicles/${vehicle.id}/history-links`, {
      data: {},
      headers: origin,
    })
  ).json();
  expect(link.url).toMatch(new RegExp(`^${SUBPATH_URL}/h/`));

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(link.url);
  await expect(visitor.getByRole('heading', { name: '2012 Volvo V70' })).toBeVisible();
  await expect(visitor.getByText('Timing belt')).toBeVisible();
  await visitor.close();
});
