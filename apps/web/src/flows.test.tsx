import { emptySpecs } from '@axlebook/shared';
import 'fake-indexeddb/auto';
import type { Reminder, Vehicle } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discard, listOutbox } from './lib/outbox';
import { mockApi, renderApp, signedIn } from './test-utils';

const tacoma: Vehicle = {
  id: 3,
  ownerId: 1,
  category: 'car',
  unitNumber: null,
  year: 2015,
  make: 'Toyota',
  model: 'Tacoma',
  trim: null,
  nickname: 'Taco',
  vin: null,
  licensePlate: null,
  color: null,
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  purchaseDate: null,
  purchasePrice: null,
  currentValue: null,
  engine: null,
  usage: 'personal',
  specs: emptySpecs(),
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  access: 'owner',
};
const summary = { ...tacoma, currentOdometer: 84_100, costToDate: 0, nextReminder: null };

beforeEach(async () => {
  localStorage.clear();
  for (const e of await listOutbox()) await discard(e.clientId);
});
afterEach(() => vi.unstubAllGlobals());

describe('sign-in gate', () => {
  it('sends signed-out visitors to the login page', async () => {
    mockApi({ 'GET /api/v1/auth/status': { ...signedIn, user: null } });
    const router = renderApp('/vehicles/3');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends a fresh instance to first-run setup', async () => {
    mockApi({ 'GET /api/v1/auth/status': { ...signedIn, setupRequired: true, user: null } });
    const router = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Set up Axlebook' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/setup');
  });

  it('checks the setup form before sending it', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/status': { ...signedIn, setupRequired: true, user: null },
    });
    renderApp('/setup');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Username' }), 'casey');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows a translated error for bad credentials', async () => {
    mockApi({
      'GET /api/v1/auth/status': { ...signedIn, user: null },
      'POST /api/v1/auth/login': () => {
        throw new Error('unreachable');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/auth/status')
          ? Response.json({ ...signedIn, user: null })
          : Response.json({ error: { code: 'invalid_credentials' } }, { status: 401 }),
      ),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Username' }), 'casey');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText("That username and password don't match.")).toBeInTheDocument();
  });
});

describe('logging fuel', () => {
  it('works out the total from fuel and price, and sends milli-units with a client id', async () => {
    const calls = mockApi({
      'GET /api/v1/vehicles': [summary],
      'POST /api/v1/vehicles/3/records': ({ body }: { body: unknown }) => ({
        id: 9,
        ...(body as object),
      }),
    });
    renderApp('/log');
    const odo = await screen.findByRole('textbox', { name: /Odometer/ });
    expect(screen.getByText('Last reading 84,100 mi')).toBeInTheDocument();
    await userEvent.type(odo, '84417');
    await userEvent.type(screen.getByRole('textbox', { name: /Fuel \(gal\)/ }), '10.82');
    await userEvent.type(screen.getByRole('textbox', { name: /Price per gal/ }), '3.499');
    expect(screen.getByRole('textbox', { name: /Total/ })).toHaveValue('37.86');
    await userEvent.click(screen.getByRole('button', { name: 'Log fuel' }));

    expect(await screen.findByText(/Fill-up logged/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      kind: 'fuel',
      odometer: 84_417,
      cost: 37_860,
      fuel: { volume: 10_820, pricePerUnit: 3_499, isFull: true, missedPrevious: false },
    });
    expect((post?.body as { clientId?: string } | undefined)?.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the entry on the device when there is no connection', async () => {
    localStorage.setItem('axlebook.vehicleCache', JSON.stringify([summary]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/auth/status')) return Response.json(signedIn);
        if (String(url).includes('/config'))
          return Response.json({
            version: 't',
            currency: 'USD',
            defaultUnitSystem: 'imperial',
            defaultLocale: 'en',
          });
        throw new TypeError('Failed to fetch');
      }),
    );
    renderApp('/log');
    await userEvent.type(await screen.findByRole('textbox', { name: /Odometer/ }), '84500');
    await userEvent.type(screen.getByRole('textbox', { name: /Fuel \(gal\)/ }), '9.5');
    await userEvent.click(screen.getByRole('button', { name: 'Log fuel' }));
    expect(await screen.findByText(/Saved on this device/)).toBeInTheDocument();
    const [queued] = await listOutbox();
    expect(queued).toMatchObject({
      vehicleId: 3,
      vehicleName: 'Taco',
      data: { odometer: 84_500, fuel: { volume: 9_500 } },
    });
    expect(await screen.findByText('1 fill-up waiting to sync')).toBeInTheDocument();
  });
});

describe('reminders', () => {
  it('says how overdue something is in words, not just colour', async () => {
    const r: Reminder = {
      id: 1,
      vehicleId: 3,
      vehicleTitle: 'Taco',
      odometerUnit: 'mi',
      title: 'Oil change',
      notes: null,
      dueMode: 'either',
      dueDate: '2026-10-01',
      dueOdometer: 83_788,
      intervalMonths: 6,
      intervalDistance: 5000,
      soonDays: 30,
      soonDistance: 500,
      archivedAt: null,
      status: 'overdue',
      daysLeft: -34,
      distanceLeft: -312,
      predictedDueDate: null,
      predictedBy: null,
      distancePerDay: null,
      lastCompletedAt: null,
      canEdit: true,
    };
    mockApi({ 'GET /api/v1/reminders': [r] });
    renderApp('/reminders');
    const item = (await screen.findByText('Oil change')).closest('li') as HTMLElement;
    expect(within(item).getByText('Overdue')).toBeInTheDocument();
    expect(within(item).getByText('312 mi overdue · 34 days overdue')).toBeInTheDocument();
  });
});

describe('record form', () => {
  it('derives price from fuel and total, and reports missing fields', async () => {
    const calls = mockApi({
      'GET /api/v1/vehicles/3': tacoma,
      'GET /api/v1/vehicles/3/odometer': [],
      'GET /api/v1/parts': [],
      'GET /api/v1/vehicles/3/reminders': [],
    });
    renderApp('/vehicles/3/records/new?kind=fuel');
    await userEvent.type(await screen.findByRole('textbox', { name: /Fuel \(gal\)/ }), '10');
    await userEvent.type(screen.getByRole('textbox', { name: /^Total/ }), '35');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Price per gal/ })).toHaveValue('3.5'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save record' }));
    expect(screen.getByRole('textbox', { name: /Odometer/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
