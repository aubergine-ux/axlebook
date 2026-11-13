import { expect, test } from '@playwright/test';
import { signIn } from './auth';

/**
 * The features added after 1.0, used the way a person would. Runs after smoke.spec.ts
 * (alphabetical), so the instance is set up; each test makes the vehicle it needs.
 */
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page: _ }, info) => {
  test.skip(info.project.name !== 'desktop', 'covered once');
});

let vehicleUrl = '';
let vehicleId = 0;

test('a business vehicle gets a trip log and a mileage report', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Add vehicle' }).click();
  await page.getByRole('textbox', { name: 'Year' }).fill('2019');
  await page.getByRole('textbox', { name: 'Make' }).fill('Ford');
  await page.getByRole('textbox', { name: 'Model' }).fill('Transit');
  await page.getByLabel('Used for').selectOption('business');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Transit/ })).toBeVisible();
  vehicleUrl = page.url();
  vehicleId = Number(vehicleUrl.split('/').pop());

  await page.getByRole('link', { name: 'Trips', exact: true }).click();
  await expect(page.getByText('No trips logged for this year.')).toBeVisible();
  await page.getByRole('button', { name: 'Log a trip' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Start/ }).fill('52000');
  await dialog.getByRole('textbox', { name: /^End/ }).fill('52140');
  await dialog.getByRole('textbox', { name: 'Purpose' }).fill('Site visit');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: /Site visit/ })).toContainText('140 mi');
  // The trip's end reading became the vehicle's odometer.
  await expect(page.getByText('52,140').first()).toBeVisible();
  const csv = await page.request.get(`/api/v1/vehicles/${vehicleId}/mileage.csv`);
  expect(await csv.text()).toContain('business_distance,140');
});

test('a document close to expiry shows up as needing attention', async ({ page }) => {
  await signIn(page);
  await page.goto(`${vehicleUrl}/documents`);
  await expect(page.getByText('No documents yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a document' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type').selectOption('insurance');
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel('Expires').fill(soon);
  await dialog.getByLabel('Number').fill('PN-2026-88');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const item = page.getByRole('listitem').filter({ hasText: 'PN-2026-88' });
  await expect(item.getByText('Expires soon')).toBeVisible();
  await expect(item.getByText(/Expires in [45] days/)).toBeVisible();

  await page.goto('/reminders');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: /^Documents/ }),
  });
  await expect(section.getByText('PN-2026-88')).toBeVisible();
});

test('the cost of ownership adds depreciation to what was spent', async ({ page }) => {
  await signIn(page);
  const origin = { origin: new URL(page.url()).origin };
  await page.request.patch(`/api/v1/vehicles/${vehicleId}`, {
    data: { purchasePrice: 30_000_000, currentValue: 24_000_000, purchaseDate: '2024-01-10' },
    headers: origin,
  });
  for (const r of [
    { kind: 'service', date: '2025-03-01', odometer: 51_000, title: 'Brakes', cost: 450_000 },
    {
      kind: 'expense',
      date: '2025-01-05',
      title: 'Policy',
      cost: 1_200_000,
      expenseCategory: 'insurance',
    },
  ])
    expect(
      (
        await page.request.post(`/api/v1/vehicles/${vehicleId}/records`, {
          data: r,
          headers: origin,
        })
      ).status(),
    ).toBe(201);
  await page.goto(`${vehicleUrl}/costs`);
  await expect(page.getByText('$7,650.00')).toBeVisible();
  const lines = page.locator('section', {
    has: page.getByRole('heading', { name: 'Where it went' }),
  });
  await expect(lines.getByRole('listitem').first()).toContainText('Depreciation');
  await expect(lines.getByRole('listitem').first()).toContainText('$6,000.00');
});

test('the service history can be shared with a link, and switched off again', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto(`${vehicleUrl}/history`);
  await expect(page.getByRole('heading', { name: '2019 Ford Transit' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Brakes/ })).toBeVisible();
  // Expenses aren't service history.
  await expect(page.getByText('Policy')).toHaveCount(0);

  await page.getByRole('textbox', { name: "Who it's for" }).fill('Buyer');
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = (await page.locator('code').filter({ hasText: '/h/' }).textContent()) ?? '';

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { name: '2019 Ford Transit' })).toBeVisible();
  await expect(visitor.getByRole('cell', { name: /Brakes/ })).toBeVisible();
  // Costs were off when the link was made, and the visitor can't get into the app.
  await expect(visitor.getByText('$450.00')).toHaveCount(0);
  await visitor.goto(new URL('/vehicles/1', url).toString());
  await expect(visitor).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Switch off' }).click();
  await expect(page.getByText('Switched off')).toBeVisible();
  await visitor.goto(url);
  await expect(
    visitor.getByRole('heading', { name: "This link doesn't work any more" }),
  ).toBeVisible();
  await visitor.close();
});

test('the parts-and-fluids sheet is saved from the vehicle page', async ({ page }) => {
  await signIn(page);
  await page.goto(vehicleUrl);
  const card = page.locator('section', {
    has: page.getByRole('heading', { name: 'Parts and fluids' }),
  });
  await card.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Engine oil' }).fill('5W-30');
  await dialog.getByRole('textbox', { name: 'Tire size' }).fill('235/65R16C');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByText('5W-30')).toBeVisible();
  await page.reload();
  await expect(card.getByText('235/65R16C')).toBeVisible();
  // Lookups are off unless an admin allows them, so nothing here offers to go online.
  await expect(page.getByRole('heading', { name: 'Safety recalls' })).toHaveCount(0);
});

test('a Fuelly export imports into one vehicle', async ({ page }) => {
  await signIn(page);
  await page.goto(`${vehicleUrl}/import`);
  const csv = [
    'car_name,odometer,gallons,price,fuelup_date,partial_fuelup,missed_fuelup,brand',
    'Transit,52300,18.2,3.459,2026-03-01,0,0,Costco',
    'Transit,52650,17.9,3.519,2026-03-15,0,0,Shell',
  ].join('\n');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'fuelups.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('Detected format: Fuelly')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 records' }).click();
  await expect(page.getByText(/2 imported/)).toBeVisible();
  await page.goto(`${vehicleUrl}/fuel`);
  await expect(page.getByRole('heading', { name: 'Where you fill up' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Costco' })).toBeVisible();
});

test('a backup is made on the server and listed', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText(/axlebook-backup-\d{8}-\d{6}-manual\.zip/)).toBeVisible();
});
