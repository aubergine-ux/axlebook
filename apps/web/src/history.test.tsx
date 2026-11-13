import type { HistoryLink, Vehicle, VehicleHistory } from '@axlebook/shared';
import { emptySpecs } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, signedIn, testConfig } from './test-utils';

const vehicle: Vehicle = {
  id: 1,
  ownerId: 1,
  category: 'car',
  unitNumber: null,
  year: 2015,
  make: 'Toyota',
  model: 'Tacoma',
  trim: null,
  nickname: null,
  vin: '5TFAX5GN0FX000001',
  licensePlate: null,
  color: 'Red',
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  purchaseDate: null,
  purchasePrice: null,
  currentValue: null,
  engine: '4.0L V6',
  usage: 'personal',
  specs: emptySpecs(),
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-11-04T00:00:00Z',
  updatedAt: '2026-11-04T00:00:00Z',
  access: 'owner',
};
const history = (o: Partial<VehicleHistory['options']> = {}): VehicleHistory => {
  const options = { showCosts: false, showVin: false, showNotes: false, ...o };
  return {
    vehicle: {
      title: '2015 Toyota Tacoma',
      category: 'car',
      year: 2015,
      make: 'Toyota',
      model: 'Tacoma',
      trim: null,
      engine: '4.0L V6',
      color: 'Red',
      vin: options.showVin ? '5TFAX5GN0FX000001' : null,
      odometerUnit: 'mi',
      currentOdometer: 61_000,
    },
    currency: 'USD',
    generatedOn: '2026-11-13',
    expiresAt: null,
    options,
    records: [
      {
        date: '2024-03-10',
        kind: 'service',
        title: 'Oil and filter',
        odometer: 50_000,
        cost: options.showCosts ? 80_000 : null,
        notes: null,
      },
      {
        date: '2025-06-01',
        kind: 'repair',
        title: 'Water pump',
        odometer: 61_000,
        cost: options.showCosts ? 420_000 : null,
        notes: options.showNotes ? 'OEM part' : null,
      },
    ],
    totals: {
      records: 2,
      firstDate: '2024-03-10',
      lastDate: '2025-06-01',
      cost: options.showCosts ? 500_000 : null,
    },
  };
};
const link = (patch: Partial<HistoryLink> = {}): HistoryLink => ({
  id: 3,
  vehicleId: 1,
  label: 'For the buyer',
  url: 'https://garage.example.com/h/abc123',
  showCosts: false,
  showVin: false,
  showNotes: false,
  createdAt: '2026-11-13T10:00:00.000Z',
  expiresAt: '2026-12-13T10:00:00.000Z',
  revokedAt: null,
  state: 'active',
  views: 2,
  lastViewedAt: null,
  ...patch,
});

afterEach(() => vi.unstubAllGlobals());

describe('service history', () => {
  it('shows the report and adds costs when switched on', async () => {
    const calls = mockApi({
      'GET /api/v1/vehicles/1': vehicle,
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/history-links': [],
      'GET /api/v1/vehicles/1/history': () =>
        history({ showCosts: calls.at(-1)?.url.includes('costs=true') ?? false }),
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1/history');
    const report = (await screen.findByText('Service history')).closest('article') as HTMLElement;
    expect(within(report).getByRole('heading', { name: '2015 Toyota Tacoma' })).toBeInTheDocument();
    const rows = within(report).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Mar 10, 2024');
    expect(rows[1]).toHaveTextContent('50,000 mi');
    expect(rows[1]).toHaveTextContent('Oil and filter');
    expect(within(report).queryByRole('columnheader', { name: 'Cost' })).not.toBeInTheDocument();
    expect(within(report).queryByText('5TFAX5GN0FX000001')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Costs' }));
    expect(await within(report).findByRole('columnheader', { name: 'Cost' })).toBeInTheDocument();
    expect(within(report).getByText('$420.00')).toBeInTheDocument();
    expect(within(report).getByText('$500.00')).toBeInTheDocument();
  });

  it('creates a link with what is switched on, and switches it off', async () => {
    let links: HistoryLink[] = [];
    const calls = mockApi({
      'GET /api/v1/vehicles/1': vehicle,
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/history': history(),
      'GET /api/v1/vehicles/1/history-links': () => links,
      'POST /api/v1/vehicles/1/history-links': () => {
        links = [link()];
        return links[0];
      },
      'DELETE /api/v1/history-links/3': () => {
        links = [link({ state: 'revoked', revokedAt: '2026-11-13T11:00:00.000Z' })];
        return Response.json(links[0]);
      },
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1/history');
    const section = (
      await screen.findByRole('heading', { name: 'Share a read-only link' })
    ).closest('section') as HTMLElement;
    await user.click(screen.getByRole('switch', { name: 'VIN' }));
    await user.type(within(section).getByLabelText("Who it's for"), 'For the buyer');
    await user.selectOptions(within(section).getByLabelText('Stops working'), '7');
    await user.click(within(section).getByRole('button', { name: 'Create link' }));
    expect(await within(section).findByText('https://garage.example.com/h/abc123')).toBeVisible();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      showCosts: false,
      showVin: true,
      showNotes: false,
      label: 'For the buyer',
      expiresInDays: 7,
    });
    expect(within(section).getByText('Active')).toBeInTheDocument();
    expect(within(section).getByText('opened 2 times')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Switch off' }));
    expect(await within(section).findByText('Switched off')).toBeInTheDocument();
    // A dead link's address is no longer offered.
    await waitFor(() =>
      expect(within(section).queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument(),
    );
  });

  it('keeps link management away from people the vehicle is only shared with', async () => {
    mockApi({
      'GET /api/v1/vehicles/1': { ...vehicle, access: 'edit' },
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/history': history(),
    });
    renderApp('/vehicles/1/history');
    await screen.findByText('Service history');
    expect(
      screen.queryByRole('heading', { name: 'Share a read-only link' }),
    ).not.toBeInTheDocument();
  });
});

describe('a shared link', () => {
  const stub = (handler: (url: string) => Response) => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        seen.push(String(input));
        if (String(input) === '/api/v1/config') return Response.json(testConfig);
        if (String(input) === '/api/v1/auth/status')
          return Response.json({ ...signedIn, user: null });
        return handler(String(input));
      }),
    );
    return seen;
  };

  it('opens without signing in and touches nothing but the report', async () => {
    const seen = stub(() =>
      Response.json({ ...history({ showCosts: true }), expiresAt: '2026-12-13T10:00:00.000Z' }),
    );
    renderApp('/h/abc123');
    expect(await screen.findByRole('heading', { name: '2015 Toyota Tacoma' })).toBeInTheDocument();
    expect(screen.getByText(/This link works until Dec 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Water pump')).toBeInTheDocument();
    // No app chrome, and only endpoints that answer without a session.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect([...new Set(seen)].sort()).toEqual([
      '/api/public/history/abc123',
      '/api/v1/auth/status',
      '/api/v1/config',
    ]);
  });

  it('says plainly when the link is dead', async () => {
    stub(() => Response.json({ error: { code: 'not_found' } }, { status: 404 }));
    renderApp('/h/gone');
    expect(
      await screen.findByRole('heading', { name: "This link doesn't work any more" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
