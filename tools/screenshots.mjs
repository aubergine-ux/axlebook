// Regenerates the README screenshots and hero animation from the real build.
//
//   npm run build && node tools/screenshots.mjs
//
// Starts the built server on a throwaway data directory with the demo garage, adds a semi, a
// snowmobile and a dirt bike through the API, then photographs the app in light and dark.
// Needs Playwright's Chromium (`npx playwright install chromium`) and ffmpeg for the animation.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/screenshots');
const PORT = 18_790;
const URL_BASE = `http://localhost:${PORT}`;
const ADMIN = { username: 'demo', password: 'screenshots-only-password' };
const DESKTOP = { width: 1280, height: 760 };
const PHONE = { width: 390, height: 844 };

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axlebook-shots-'));
const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'axlebook-frames-'));
const server = spawn(process.execPath, ['apps/server/dist/server.js'], {
  cwd: root,
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: dataDir,
    NODE_ENV: 'production',
    LOG_LEVEL: 'silent',
    SEED_DEMO_DATA: 'true',
    ADMIN_USERNAME: ADMIN.username,
    ADMIN_PASSWORD: ADMIN.password,
    TZ: 'UTC',
  },
});
const cleanup = () => {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(frames, { recursive: true, force: true });
};
process.on('exit', cleanup);

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${URL_BASE}/api/v1/vehicles`);
      // 401 means the server is up and the demo account exists.
      if (res.status === 401) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** The rest of the garage: machines the demo seed doesn't include. */
async function addFleet(api) {
  const post = async (url, data) => {
    const res = await api.post(`${URL_BASE}/api/v1${url}`, { data, headers: { origin: URL_BASE } });
    if (!res.ok()) throw new Error(`${url}: ${res.status()} ${await res.text()}`);
    return res.json();
  };
  const semi = await post('/vehicles', {
    category: 'semi',
    year: 2021,
    make: 'Kenworth',
    model: 'T680',
    nickname: 'Big Red',
    unitNumber: '12',
    odometerUnit: 'mi',
    fuelUnit: 'gal_us',
    fuelType: 'diesel',
    usage: 'business',
    engine: 'PACCAR MX-13',
  });
  let odo = 412_300;
  for (let i = 9; i >= 0; i--) {
    odo += 1150 + ((i * 37) % 160);
    await post(`/vehicles/${semi.id}/records`, {
      kind: 'fuel',
      date: day(-i * 6 - 2),
      odometer: odo,
      cost: Math.round(148 * 3.899 * 1000),
      fuel: {
        volume: 148_000 + i * 900,
        pricePerUnit: 3899,
        isFull: true,
        station: i % 2 ? "Love's" : 'Pilot',
        jurisdiction: ['TX', 'OK', 'KS', 'MO'][i % 4],
      },
    });
  }
  await post(`/vehicles/${semi.id}/records`, {
    kind: 'service',
    date: day(-48),
    odometer: 414_900,
    title: 'PM service: oil, filters, grease',
    cost: 612_000,
    tags: ['pm'],
  });
  await post(`/vehicles/${semi.id}/reminders`, {
    title: 'PM service',
    dueMode: 'either',
    dueDate: day(40),
    dueOdometer: odo + 2_400,
    intervalMonths: 3,
    intervalDistance: 15_000,
  });
  await post(`/vehicles/${semi.id}/documents`, {
    type: 'dot_inspection',
    title: 'DOT annual inspection',
    number: 'INSP-2291',
    expiresOn: day(12),
  });
  await post(`/vehicles/${semi.id}/documents`, {
    type: 'permit',
    title: 'IFTA license',
    number: 'TX-448812',
    expiresOn: day(48),
  });
  await post(`/vehicles/${semi.id}/documents`, {
    type: 'insurance',
    title: 'Cargo and liability',
    number: 'CL-90-11873',
    expiresOn: day(203),
  });
  await post(`/vehicles/${semi.id}/inspections`, {
    type: 'pre_trip',
    date: day(0),
    odometer: odo,
    inspector: 'R. Alvarez',
    items: [
      { item: 'lights', ok: false, note: 'Left marker light out' },
      { item: 'tires', ok: true },
      { item: 'service_brakes', ok: true },
      { item: 'coupling', ok: true },
      { item: 'mirrors', ok: true },
    ],
  });

  const sled = await post('/vehicles', {
    category: 'snowmobile',
    year: 2019,
    make: 'Ski-Doo',
    model: 'Summit 850',
    odometerUnit: 'hr',
    fuelUnit: 'gal_us',
    fuelType: 'gasoline',
  });
  await post(`/vehicles/${sled.id}/records`, {
    kind: 'service',
    date: day(-210),
    odometer: 96,
    title: 'Storage prep',
    cost: 42_000,
  });
  await post(`/vehicles/${sled.id}/records`, {
    kind: 'service',
    date: day(-20),
    odometer: 96,
    title: 'Pre-season check',
    cost: 135_000,
  });
  await post(`/vehicles/${sled.id}/reminders`, {
    title: 'Chaincase oil',
    dueMode: 'distance',
    dueOdometer: 120,
    soonDistance: 10,
  });

  const bike = await post('/vehicles', {
    category: 'dirtbike',
    year: 2022,
    make: 'KTM',
    model: '250 SX-F',
    odometerUnit: 'hr',
    fuelUnit: 'gal_us',
    fuelType: 'gasoline',
  });
  await post(`/vehicles/${bike.id}/records`, {
    kind: 'service',
    date: day(-9),
    odometer: 41,
    title: 'Oil, filter and air filter',
    cost: 38_500,
  });
  await post(`/vehicles/${bike.id}/reminders`, {
    title: 'Oil and filter',
    dueMode: 'distance',
    dueOdometer: 51,
    intervalDistance: 10,
    soonDistance: 2,
  });
  return { semi, sled, bike };
}

async function signedInContext(browser, { viewport, scheme, scale = 1.5 }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: scheme,
    baseURL: URL_BASE,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  });
  await context.addInitScript((theme) => localStorage.setItem('axlebook.theme', theme), scheme);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Garage' }).waitFor();
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function shoot(page, url, file, prepare) {
  await page.goto(url);
  await settle(page);
  if (prepare) await prepare(page);
  await page.screenshot({ path: file });
}

await waitForServer();
const browser = await chromium.launch();
fs.mkdirSync(out, { recursive: true });

// Find the demo vehicles and add the rest once.
const setup = await signedInContext(browser, { viewport: DESKTOP, scheme: 'light' });
const fleet = await addFleet(setup.context.request);
const garage = await (await setup.context.request.get(`${URL_BASE}/api/v1/vehicles`)).json();
const taco = garage.find((v) => v.model === 'Tacoma').id;
// A share link, so the history page shows one.
await setup.context.request.post(`${URL_BASE}/api/v1/vehicles/${taco}/history-links`, {
  data: { label: 'For the buyer', showCosts: true },
  headers: { origin: URL_BASE },
});
// Without photos the compact layout shows the most: every vehicle and what's due, in one view.
await setup.context.request.patch(`${URL_BASE}/api/v1/me`, {
  data: {
    garage: {
      sort: 'custom',
      layout: 'compact',
      fields: ['odometer', 'nextReminder', 'cost'],
      order: [],
    },
  },
  headers: { origin: URL_BASE },
});
await setup.context.close();

for (const scheme of ['light', 'dark']) {
  const { context, page } = await signedInContext(browser, { viewport: DESKTOP, scheme });
  const file = (name) => path.join(out, `${name}-${scheme}.png`);
  await shoot(page, '/', file('garage'));
  await shoot(page, `/vehicles/${taco}`, file('vehicle'));
  await shoot(page, `/vehicles/${taco}/costs`, file('costs'));
  await shoot(page, `/vehicles/${taco}/history`, file('history'), (p) =>
    p
      .locator('label', { hasText: /^Costs$/ })
      .click()
      .then(() => settle(p)),
  );
  await shoot(page, `/vehicles/${taco}/trips`, file('trips'));
  await shoot(page, `/vehicles/${fleet.semi.id}/documents`, file('documents'));
  await shoot(page, '/reports', file('reports'));
  await shoot(page, `/vehicles/${fleet.semi.id}/reminders`, file('schedule'), async (p) => {
    await p.getByRole('button', { name: 'Suggest a maintenance schedule' }).click();
    await p.getByRole('dialog').waitFor();
    await settle(p);
  });
  await shoot(page, '/import', file('import'), async (p) => {
    const csv = [
      'Date,Vehicle,Odometer,Gallons,Total,Work',
      '1/5/2024,2016 Ford F-150,40100,19.2,61.20,',
      '2/9/2024,2016 Ford F-150,40400,,89.99,Oil change',
      '2/20/2024,2016 Ford F-150,40810,21.4,68.05,',
      '3/1/2024,2020 Polaris RMK 850,,,120.00,Pre-season check',
    ].join('\n');
    await p
      .locator('input[type="file"]')
      .setInputFiles({ name: 'garage.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.getByRole('button', { name: 'Preview' }).click();
    await p.getByText(/rows are ready to import/).waitFor();
    await settle(p);
  });

  // Frames for the hero animation: the newest features, in the order someone would meet them.
  const tour = [
    ['/', 2.6],
    [`/vehicles/${taco}`, 2.6],
    [`/vehicles/${taco}/costs`, 3],
    [`/vehicles/${taco}/trips`, 2.6],
    [`/vehicles/${fleet.semi.id}/documents`, 2.6],
    [`/vehicles/${taco}/history`, 3.2],
  ];
  const list = [];
  for (const [i, [url, seconds]] of tour.entries()) {
    const frame = path.join(frames, `${scheme}-${i}.png`);
    await shoot(page, url, frame);
    list.push(`file '${frame}'`, `duration ${seconds}`);
  }
  // ffmpeg's concat needs the last file repeated for its duration to count.
  list.push(`file '${path.join(frames, `${scheme}-${tour.length - 1}.png`)}'`);
  const concat = path.join(frames, `${scheme}.txt`);
  fs.writeFileSync(concat, list.join('\n'));
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concat,
      '-vf',
      'fps=5,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none',
      path.join(out, `tour-${scheme}.gif`),
    ],
    { stdio: 'inherit' },
  );
  await context.close();
}

// Phone shots, one theme each way so the row shows both.
{
  const { context, page } = await signedInContext(browser, {
    viewport: PHONE,
    scheme: 'light',
    scale: 2,
  });
  await shoot(page, `/log?vehicle=${taco}`, path.join(out, 'phone-log.png'), async (p) => {
    await p.getByRole('textbox', { name: /Odometer/ }).fill('86120');
    await p.getByRole('textbox', { name: /Fuel \(gal\)/ }).fill('15.84');
    await p.getByRole('textbox', { name: /Price per gal/ }).fill('3.459');
    await p.getByRole('textbox', { name: 'Station' }).fill('Costco');
    await p.getByRole('textbox', { name: /Odometer/ }).blur();
  });
  await shoot(page, `/vehicles/${taco}/fuel`, path.join(out, 'phone-fuel.png'));
  await context.close();
}
{
  const { context, page } = await signedInContext(browser, {
    viewport: PHONE,
    scheme: 'dark',
    scale: 2,
  });
  await shoot(page, '/reminders', path.join(out, 'phone-reminders.png'));
  await shoot(
    page,
    `/vehicles/${fleet.semi.id}/inspections`,
    path.join(out, 'phone-inspections.png'),
  );
  await context.close();
}

await browser.close();
console.log(`wrote screenshots and tour animations to ${path.relative(root, out)}`);
process.exit(0);
