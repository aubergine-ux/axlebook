import { expect, type Page, test } from '@playwright/test';

// One fresh instance for the whole run: setup happens once, then each test signs in.
test.describe.configure({ mode: 'serial' });

const ADMIN = { username: 'smoke', password: 'smoke-test-password' };

async function signIn(page: Page) {
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
  await expect(page.getByText(/1 fill-ups waiting to sync/)).toBeVisible();
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
});
