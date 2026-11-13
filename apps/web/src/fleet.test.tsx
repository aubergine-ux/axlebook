import type { MileageReport, Trip, Vehicle, VehicleDocument } from '@axlebook/shared';
import { emptySpecs } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from './lib/format';
import { mockApi, renderApp, signedIn, testMe } from './test-utils';

const vehicle: Vehicle = {
  id: 1,
  ownerId: 1,
  category: 'car',
  unitNumber: null,
  year: 2019,
  make: 'Ford',
  model: 'Transit',
  trim: null,
  nickname: 'Van',
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
  usage: 'business',
  specs: emptySpecs(),
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-11-04T00:00:00Z',
  updatedAt: '2026-11-04T00:00:00Z',
  access: 'owner',
};
const trip: Trip = {
  id: 5,
  vehicleId: 1,
  date: '2026-03-04',
  startOdometer: 10_000,
  endOdometer: 10_120,
  distance: 120,
  purpose: 'Client visit',
  from: 'Office',
  to: 'Acme',
  business: true,
  notes: null,
};
const report: MileageReport = {
  vehicleId: 1,
  year: 2026,
  odometerUnit: 'mi',
  trips: 1,
  businessDistance: 120,
  personalDistance: 0,
  startOdometer: 10_000,
  endOdometer: 11_200,
  totalDistance: 1200,
  businessShare: 10,
  byMonth: [{ month: '2026-03', distance: 120, trips: 1 }],
  byPurpose: [{ purpose: 'Client visit', distance: 120, trips: 1 }],
  years: [2026, 2025],
};
const doc = (patch: Partial<VehicleDocument>): VehicleDocument => ({
  id: 1,
  vehicleId: 1,
  vehicleTitle: 'Van',
  type: 'insurance',
  title: 'Insurance',
  number: 'PN-88',
  expiresOn: '2027-06-30',
  notes: null,
  status: 'upcoming',
  daysLeft: 229,
  file: null,
  canEdit: true,
  ...patch,
});
const base = {
  'GET /api/v1/vehicles/1': vehicle,
  'GET /api/v1/vehicles/1/odometer': [
    { id: 1, vehicleId: 1, date: '2026-03-04', odometer: 10_120, recordId: null, notes: null },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('trip log', () => {
  it('is only offered for business vehicles', async () => {
    mockApi({
      'GET /api/v1/vehicles/1': { ...vehicle, usage: 'personal' },
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/documents': [],
    });
    renderApp('/vehicles/1/documents');
    await screen.findByRole('link', { name: 'Documents' });
    expect(screen.queryByRole('link', { name: 'Trips' })).not.toBeInTheDocument();
  });

  it('shows the year at a glance and logs a trip starting from the current odometer', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/v1/vehicles/1/mileage': report,
      'GET /api/v1/vehicles/1/trips': [trip],
      'POST /api/v1/vehicles/1/trips': ({ body }: { body: unknown }) => ({
        ...trip,
        ...(body as object),
      }),
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1/trips');
    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(screen.getByText('1,200 mi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/v1/vehicles/1/mileage.csv?year=2026',
    );
    const row = await screen.findByRole('row', { name: /Client visit/ });
    expect(within(row).getByText('Office → Acme')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log a trip' }));
    const dialog = await screen.findByRole('dialog');
    // It starts where the odometer is now.
    expect(within(dialog).getByLabelText(/^Start \(mi\)/)).toHaveValue('10120');
    // Ending before the start is caught before anything is sent.
    await user.type(within(dialog).getByLabelText(/^End \(mi\)/), '10100');
    await user.type(within(dialog).getByLabelText(/^Purpose/), 'Supplies');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/lower than the start/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.clear(within(dialog).getByLabelText(/^End \(mi\)/));
    await user.type(within(dialog).getByLabelText(/^End \(mi\)/), '10,180');
    expect(within(dialog).getByText('60 mi')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      startOdometer: 10_120,
      endOdometer: 10_180,
      purpose: 'Supplies',
      business: true,
    });
  });
});

describe('documents', () => {
  it('says in words what state each one is in, and adds one', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/v1/vehicles/1/documents': [
        doc({ id: 2, title: 'Plates', type: 'registration', status: 'overdue', daysLeft: -3 }),
        doc({ id: 3, title: 'Oversize load', type: 'permit', status: 'due_soon', daysLeft: 12 }),
        doc({ title: 'Fleet policy' }),
        doc({
          id: 4,
          title: 'Title deed',
          type: 'other',
          expiresOn: null,
          daysLeft: null,
          number: null,
        }),
      ],
      'POST /api/v1/vehicles/1/documents': ({ body }: { body: unknown }) =>
        doc({ id: 9, ...(body as object) }),
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1/documents');
    const item = async (title: string) =>
      (await screen.findByText(title)).closest('li') as HTMLElement;
    const plates = await item('Plates');
    expect(within(plates).getByText('Expired')).toBeInTheDocument();
    expect(within(plates).getByText('Expired 3 days ago')).toBeInTheDocument();
    expect(within(await item('Oversize load')).getByText('Expires in 12 days')).toBeInTheDocument();
    expect(
      within(await item('Fleet policy')).getByText('Expires Jun 30, 2027'),
    ).toBeInTheDocument();
    expect(within(await item('Title deed')).getByText('No expiry')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a document' }));
    const dialog = await screen.findByRole('dialog');
    // A personal van isn't offered the truck inspection.
    expect(
      within(dialog).queryByRole('option', { name: 'DOT annual inspection' }),
    ).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'insurance');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // With no name typed, the document is named after its type.
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      type: 'insurance',
      title: 'Insurance',
      expiresOn: null,
    });
  });

  it('puts expired and expiring documents on the reminders page', async () => {
    mockApi({
      'GET /api/v1/reminders': [],
      'GET /api/v1/documents': [
        doc({ id: 2, title: 'Plates', status: 'overdue', daysLeft: -3 }),
        doc({ id: 3, title: 'Far away', status: 'upcoming' }),
      ],
    });
    renderApp('/reminders');
    const section = (await screen.findByRole('heading', { name: /^Documents/ })).closest(
      'section',
    ) as HTMLElement;
    expect(within(section).getByText('Plates')).toBeInTheDocument();
    expect(within(section).queryByText('Far away')).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Van' })).toHaveAttribute(
      'href',
      '/vehicles/1/documents',
    );
  });
});

describe('date and currency preferences', () => {
  it('writes dates in the order asked for', () => {
    expect(formatDate('2026-03-04', 'auto', 'en')).toBe('Mar 4, 2026');
    expect(formatDate('2026-03-04', 'mdy', 'en')).toBe('03/04/2026');
    expect(formatDate('2026-03-04', 'dmy', 'en')).toBe('04/03/2026');
    expect(formatDate('2026-03-04T10:00:00Z', 'ymd', 'en')).toBe('2026-03-04');
  });

  it("uses a person's own currency and date order across the app", async () => {
    mockApi({
      'GET /api/v1/auth/status': {
        ...signedIn,
        user: { ...testMe, currency: 'EUR', dateFormat: 'dmy' },
      },
      ...base,
      'GET /api/v1/vehicles/1/documents': [doc({})],
      'GET /api/v1/vehicles/1/ownership': {
        vehicleId: 1,
        odometerUnit: 'mi',
        since: '2024-01-15',
        months: 34,
        purchasePrice: null,
        currentValue: null,
        depreciation: null,
        running: {
          fuel: 50_000,
          maintenance: 0,
          upgrades: 0,
          insurance: 0,
          registration: 0,
          tax: 0,
          loan: 0,
          other: 0,
        },
        runningTotal: 50_000,
        total: 50_000,
        distance: 0,
        costPerDistance: null,
        costPerMonth: 1_470,
        byYear: [],
      },
    });
    renderApp('/vehicles/1/costs');
    expect(await screen.findByText(/since 15\/01\/2024/)).toBeInTheDocument();
    expect(screen.getAllByText('€50.00').length).toBeGreaterThan(0);
  });
});

describe('notification preferences', () => {
  it('turns on quiet hours and the weekly digest', async () => {
    let me = { ...testMe };
    const calls = mockApi({
      'GET /api/v1/auth/status': () => ({ ...signedIn, user: me }),
      'GET /api/v1/me/channels': [],
      'PATCH /api/v1/me': ({ body }: { body: unknown }) => {
        me = { ...me, notify: { ...me.notify, ...(body as { notify: object }).notify } };
        return me;
      },
    });
    const user = userEvent.setup();
    renderApp('/settings');
    await user.click(await screen.findByRole('switch', { name: 'Quiet hours' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        notify: { quietStart: '22:00', quietEnd: '07:00' },
      }),
    );
    expect(await screen.findByLabelText('From')).toHaveValue('22:00');
    await user.click(screen.getByRole('switch', { name: 'Weekly digest' }));
    expect(await screen.findByLabelText('Day')).toHaveValue('1');
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({
      notify: { digest: true },
    });
  });
});
