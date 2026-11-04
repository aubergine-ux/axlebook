import type { Vehicle, VehicleSummary } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../../test-utils';

const base: Vehicle = {
  id: 1,
  ownerId: 1,
  category: 'car',
  unitNumber: null,
  year: 2015,
  make: 'Toyota',
  model: 'Tacoma',
  trim: 'SR5',
  nickname: null,
  vin: null,
  licensePlate: null,
  color: null,
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  purchaseDate: null,
  purchasePrice: null,
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-11-04T00:00:00Z',
  updatedAt: '2026-11-04T00:00:00Z',
  access: 'owner',
};
const summary = (v: Partial<VehicleSummary>): VehicleSummary => ({
  ...base,
  currentOdometer: null,
  costToDate: 0,
  nextReminder: null,
  ...v,
});

afterEach(() => vi.unstubAllGlobals());

describe('garage', () => {
  it('shows a card per vehicle with figures', async () => {
    mockApi({
      'GET /api/v1/vehicles': [
        summary({ id: 1, nickname: 'Taco', currentOdometer: 84217, costToDate: 1_234_560 }),
        summary({ id: 2, year: 2018, make: 'Honda', model: 'Civic', trim: null }),
      ],
    });
    renderApp('/');
    const taco = (await screen.findByRole('link', { name: 'Taco' })).closest(
      'article',
    ) as HTMLElement;
    expect(within(taco).getByText('2015 Toyota Tacoma SR5')).toBeInTheDocument();
    expect(within(taco).getByText('84,217 mi')).toBeInTheDocument();
    expect(within(taco).getByText('$1,234.56')).toBeInTheDocument();
    const civic = screen
      .getByRole('link', { name: '2018 Honda Civic' })
      .closest('article') as HTMLElement;
    expect(within(civic).getByText('No reading yet')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockApi({ 'GET /api/v1/vehicles': [] });
    renderApp('/');
    expect(await screen.findByText(/No vehicles yet/)).toBeInTheDocument();
  });
});

describe('vehicle form', () => {
  it('validates required fields before sending anything', async () => {
    const calls = mockApi({});
    renderApp('/vehicles/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    expect(screen.getByRole('textbox', { name: 'Year' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Make' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('creates a vehicle with money in milli-units and opens it', async () => {
    const calls = mockApi({
      'POST /api/v1/vehicles': ({ body }: { body: unknown }) => ({
        ...base,
        ...(body as object),
        id: 7,
      }),
      'GET /api/v1/vehicles/7': { ...base, id: 7, purchasePrice: 24_500_000 },
    });
    const router = renderApp('/vehicles/new');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Year' }), '2015');
    await userEvent.type(screen.getByRole('textbox', { name: 'Make' }), 'Toyota');
    await userEvent.type(screen.getByRole('textbox', { name: 'Model' }), 'Tacoma');
    await userEvent.type(screen.getByRole('textbox', { name: /Purchase price/ }), '24500');
    await userEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vehicles/7'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      year: 2015,
      make: 'Toyota',
      model: 'Tacoma',
      odometerUnit: 'mi',
      fuelUnit: 'gal_us',
      purchasePrice: 24_500_000,
    });
    expect(await screen.findByText('$24,500.00')).toBeInTheDocument();
  });

  it('rejects an unparseable price', async () => {
    mockApi({});
    renderApp('/vehicles/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /Purchase price/ }), 'lots');
    await userEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    expect(screen.getByText('Enter an amount like 1234.56')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('keeps Garage active on vehicle pages', async () => {
    mockApi({ 'GET /api/v1/vehicles/1': base, 'GET /api/v1/vehicles/1/odometer': [] });
    renderApp('/vehicles/1');
    await screen.findByRole('heading', { level: 1, name: '2015 Toyota Tacoma SR5' });
    const [desktopNav] = screen.getAllByRole('navigation', { name: 'Main navigation' });
    const nav = within(desktopNav as HTMLElement);
    expect(nav.getByRole('link', { name: 'Garage' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Reminders' })).not.toHaveAttribute('aria-current');
  });

  it('marks only Settings active on /settings', async () => {
    mockApi({});
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    for (const link of screen.getAllByRole('link', { name: 'Settings' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
    for (const link of screen.getAllByRole('link', { name: 'Garage' })) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });
});

describe('vehicle tabs', () => {
  it('marks only the current section active', async () => {
    mockApi({
      'GET /api/v1/vehicles/1': base,
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/fuel-economy': {
        fills: [],
        average: null,
        last: null,
        totalDistance: 0,
        totalVolume: 0,
        totalCost: 0,
        costPerDistance: null,
      },
    });
    renderApp('/vehicles/1/fuel');
    const tabs = await screen.findByRole('navigation', { name: 'Details' });
    expect(within(tabs).getByRole('link', { name: 'Fuel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
