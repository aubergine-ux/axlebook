import { expect, test } from '@playwright/test';
import { RESTORE_PORT } from '../playwright.config';
import { ADMIN, signIn } from './auth';

// One fresh instance for the whole run: setup happens once, then each test signs in.
test.describe.configure({ mode: 'serial' });

test('first run: create the admin account', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'setup runs once');
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Confirm password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();
});

test('add a vehicle, log fuel, and see it in the records', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Add vehicle' }).click();
  await page.getByRole('textbox', { name: 'Year' }).fill('2015');
  await page.getByRole('textbox', { name: 'Make' }).fill('Toyota');
  await page.getByRole('textbox', { name: 'Model' }).fill(`Tacoma ${test.info().project.name}`);
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Tacoma/ })).toBeVisible();
  const vehicleUrl = page.url();

  await page.getByRole('link', { name: 'Log fuel' }).first().click();
  await page.getByRole('textbox', { name: /Odometer/ }).fill('84217');
  await page.getByRole('textbox', { name: /Fuel \(gal\)/ }).fill('10.82');
  await page.getByRole('textbox', { name: /Price per gal/ }).fill('3.499');
  await expect(page.getByRole('textbox', { name: /Total/ })).toHaveValue('37.86');
  await page.getByRole('button', { name: 'Log fuel' }).click();
  await expect(page.getByText('Fill-up logged.')).toBeVisible();

  await page.goto(`${vehicleUrl}/records`);
  await expect(page.getByRole('link', { name: /Fuel fill-up · 10\.82 gal/ })).toBeVisible();
  await expect(page.getByText('$37.86').first()).toBeVisible();
});

test('a fill-up logged offline syncs when the connection returns', async ({ page, context }) => {
  await signIn(page);
  await page.goto('/log');
  await expect(page.getByRole('textbox', { name: /Odometer/ })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('textbox', { name: /Odometer/ }).fill('84555');
  await page.getByRole('textbox', { name: /Fuel \(gal\)/ }).fill('9.4');
  await page.getByRole('button', { name: 'Log fuel' }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
  await expect(page.getByText(/1 fill-up waiting to sync/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/waiting to sync/)).toBeHidden({ timeout: 10_000 });
});

test('reminders show status in words and can be marked done', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
  await signIn(page);
  await page.getByRole('link', { name: /Tacoma desktop/ }).click();
  await page
    .getByRole('navigation', { name: 'Details' })
    .getByRole('link', { name: 'Reminders' })
    .click();
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('textbox', { name: 'Reminder' }).fill('Oil change');
  await page.getByRole('radio', { name: 'Distance' }).click({ force: true });
  await page.getByRole('textbox', { name: /Due at/ }).fill('84000');
  await page.getByRole('textbox', { name: /Repeat every \(mi\)/ }).fill('5000');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(page.getByText('Overdue').first()).toBeVisible();
  await expect(page.getByText(/555 mi overdue/)).toBeVisible();
  await page.getByRole('button', { name: 'Mark done' }).click();
  await page.getByRole('button', { name: 'Mark done' }).last().click();
  await expect(page.getByText(/4,445 mi to go|Upcoming/).first()).toBeVisible();
});

test('the API docs and a backup are available', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
  await signIn(page);
  const docs = await page.request.get('/api/openapi.json');
  expect((await docs.json()).paths).toHaveProperty('/api/v1/vehicles/{vehicleId}/records');
  const backup = await page.request.get('/api/v1/backup');
  expect(backup.headers()['content-type']).toBe('application/zip');
  // Deep links get the app; a missing file is a plain 404, not the app page.
  expect((await page.request.get('/vehicles/1/fuel')).headers()['content-type']).toMatch(/html/);
  expect((await page.request.get('/assets/gone-1234.js')).status()).toBe(404);
});

test('import a spreadsheet covering two vehicles, then add a maintenance schedule', async ({
  page,
}) => {
  const p = test.info().project.name;
  await signIn(page);
  await page.goto('/import');
  const csv = [
    'Date,Vehicle,Odometer,Gallons,Total,Work',
    `1/5/2024,2018 Honda Civic ${p},40100,9.2,31.20,`,
    `2/9/2024,2018 Honda Civic ${p},40400,,89.99,Oil change`,
    `3/1/2024,2019 Ski-Doo Summit ${p},,,120.00,Pre-season check`,
  ].join('\n');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'garage.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  // The first import matches the columns; the second one, with the same headers, starts from
  // the mapping the first one saved.
  await expect(
    page.getByText(
      p === 'desktop'
        ? 'Columns matched automatically. Check them below.'
        : /Using the mapping you saved for this layout/,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('3 of 3 rows are ready to import.')).toBeVisible();
  await page.getByRole('button', { name: 'Import everything' }).click();
  await expect(page.getByText('Imported 3 records. Already here and skipped: 0.')).toBeVisible();

  await page.getByRole('link', { name: `2018 Honda Civic ${p}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Civic/ })).toBeVisible();
  await page.goto(`${page.url()}/reminders`);
  await page.getByRole('button', { name: 'Suggest a maintenance schedule' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Oil and filter change')).toBeVisible();
  await expect(dialog.getByText(/Last done/).first()).toBeVisible();
  await dialog.getByRole('button', { name: /^Add \d+ reminders?$/ }).click();
  await expect(page.getByText(/^Added \d+ reminders?\.$/)).toBeVisible();
  await expect(page.getByText('Oil and filter change')).toBeVisible();
});

test('a backup restores into a fresh instance', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
  await signIn(page);
  await page.goto('/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('link', { name: 'Download backup' })
      .or(page.getByRole('button', { name: 'Download backup' }))
      .click(),
  ]);
  const file = await download.path();

  // The second instance has never been set up. Same username, so the restored vehicles are this account's.
  const fresh = await browser.newPage({ baseURL: `http://localhost:${RESTORE_PORT}` });
  await fresh.goto('/');
  await fresh.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await fresh.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await fresh.getByLabel('Confirm password').fill(ADMIN.password);
  await fresh.getByRole('button', { name: 'Create account' }).click();
  await expect(fresh.getByRole('heading', { name: 'Garage' })).toBeVisible();
  await fresh.goto('/settings');
  const chooser = fresh.waitForEvent('filechooser');
  await fresh.getByRole('button', { name: 'Restore a backup' }).click();
  await (await chooser).setFiles(file);
  await expect(fresh.getByText('Backup restored.')).toBeVisible();
  await fresh.goto('/');
  await expect(fresh.getByText(/Tacoma desktop/).first()).toBeVisible();
  await fresh.close();
});

test('someone with view access can look but not change anything', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
  await signIn(page);
  const origin = { origin: new URL(page.url()).origin };
  const viewer = { username: 'viewer', password: 'viewer-password-1' };
  const created = await page.request.post('/api/v1/users', {
    data: { ...viewer, role: 'viewer' },
    headers: origin,
  });
  expect(created.status(), await created.text()).toBe(201);
  const users = await (await page.request.get('/api/v1/users/directory')).json();
  const id = users.find((u: { username: string }) => u.username === 'viewer').id;
  const vehicles = await (await page.request.get('/api/v1/vehicles')).json();
  const vid = vehicles[0].id;
  await page.request.put(`/api/v1/vehicles/${vid}/shares/${id}`, {
    data: { permission: 'edit' },
    headers: origin,
  });

  const ctx = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const v = await ctx.newPage();
  await v.goto('/login');
  await v.getByRole('textbox', { name: 'Username' }).fill(viewer.username);
  await v.getByLabel('Password').fill(viewer.password);
  await v.getByRole('button', { name: 'Sign in' }).click();
  await expect(v.getByRole('heading', { name: 'Garage' })).toBeVisible();
  await v.goto(`/vehicles/${vid}`);
  await expect(v.getByRole('heading', { level: 1 })).toBeVisible();
  // The viewer role is read-only even on an "edit" share.
  await expect(v.getByRole('button', { name: 'Add record' })).toHaveCount(0);
  await expect(v.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  const write = await v.request.post(`/api/v1/vehicles/${vid}/records`, {
    data: { kind: 'service', date: '2026-01-01', title: 'Sneaky', cost: 0 },
    headers: origin,
  });
  expect(write.status()).toBe(403);
  await ctx.close();
});
