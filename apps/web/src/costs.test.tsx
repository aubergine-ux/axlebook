import type { FuelEconomyReport, Ownership, Vehicle } from '@axlebook/shared';
import { emptySpecs } from '@axlebook/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from './test-utils';

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
  vin: null,
  licensePlate: null,
  color: null,
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  purchaseDate: '2024-01-15',
  purchasePrice: 20_000_000,
  currentValue: 15_500_000,
  engine: null,
  usage: 'personal',
  specs: emptySpecs(),
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-11-04T00:00:00Z',
  updatedAt: '2026-11-04T00:00:00Z',
  access: 'owner',
};
const zero = {
  fuel: 0,
  maintenance: 0,
  upgrades: 0,
  insurance: 0,
  registration: 0,
  tax: 0,
  loan: 0,
  other: 0,
};
const ownership: Ownership = {
  vehicleId: 1,
  odometerUnit: 'mi',
  since: '2024-01-15',
  months: 34,
  purchasePrice: 20_000_000,
  currentValue: 15_500_000,
  depreciation: 4_500_000,
  running: { ...zero, fuel: 85_000, maintenance: 500_000, insurance: 1_850_000 },
  runningTotal: 2_435_000,
  total: 6_935_000,
  distance: 10_000,
  costPerDistance: 693.5,
  costPerMonth: 203_971,
  byYear: [
    { year: '2024', ...zero, fuel: 40_000, insurance: 900_000, total: 940_000 },
    {
      year: '2025',
      ...zero,
      fuel: 45_000,
      maintenance: 500_000,
      insurance: 950_000,
      total: 1_495_000,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('cost of ownership', () => {
  it('shows the total with depreciation, the lines, and a table by year', async () => {
    mockApi({
      'GET /api/v1/vehicles/1': vehicle,
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/ownership': ownership,
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1/costs');
    expect(await screen.findByText('$6,935.00')).toBeInTheDocument();
    expect(screen.getByText('$0.694')).toBeInTheDocument();
    expect(screen.getByText('$203.97')).toBeInTheDocument();
    expect(screen.getByText(/since Jan 15, 2024 \(34 months\)/)).toBeInTheDocument();
    const lines = screen.getByRole('heading', { name: 'Where it went' }).closest('section');
    const items = within(lines as HTMLElement).getAllByRole('listitem');
    // Biggest first; lines with nothing spent are left out.
    expect(items.map((li) => li.textContent)).toEqual([
      'Depreciation$4,500.00',
      'Insurance$1,850.00',
      'Service and repairs$500.00',
      'Fuel$85.00',
    ]);
    await user.click(screen.getByRole('switch', { name: 'Show as table' }));
    const row = screen.getByRole('row', { name: /2025/ });
    expect(within(row).getByText('$1,495.00')).toBeInTheDocument();
  });

  it('explains what is missing when there is no purchase price, and says so when nothing is spent', async () => {
    mockApi({
      'GET /api/v1/vehicles/1': { ...vehicle, purchasePrice: null, currentValue: null },
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/ownership': {
        ...ownership,
        since: null,
        months: 0,
        purchasePrice: null,
        currentValue: null,
        depreciation: null,
        running: zero,
        runningTotal: 0,
        total: 0,
        distance: 0,
        costPerDistance: null,
        costPerMonth: null,
        byYear: [],
      },
    });
    renderApp('/vehicles/1/costs');
    expect(await screen.findByText(/Nothing spent yet/)).toBeInTheDocument();
    expect(screen.getByText(/Add the purchase price/)).toBeInTheDocument();
    expect(screen.getByText('Without depreciation')).toBeInTheDocument();
  });
});

describe('fuel page', () => {
  it('lists the station on each fill and where the fuel is usually bought', async () => {
    const fill = (i: number, station: string | null, price: number | null) => ({
      recordId: i,
      date: `2026-0${i}-01`,
      odometer: 1000 * i,
      volume: 10_000,
      cost: 35_000,
      pricePerUnit: price,
      isFull: true,
      missedPrevious: false,
      station,
      status: 'ok' as const,
      distance: 300,
      economy: 30,
    });
    const fuel: FuelEconomyReport = {
      fills: [fill(3, 'costco', 3_000), fill(2, 'Shell', 4_000), fill(1, 'Costco', 3_500)],
      average: 30,
      last: 30,
      totalDistance: 600,
      totalVolume: 30_000,
      totalCost: 105_000,
      costPerDistance: 116,
    };
    mockApi({
      'GET /api/v1/vehicles/1': vehicle,
      'GET /api/v1/vehicles/1/odometer': [],
      'GET /api/v1/vehicles/1/fuel-economy': fuel,
    });
    renderApp('/vehicles/1/fuel');
    const stations = (await screen.findByRole('heading', { name: 'Where you fill up' })).closest(
      'section',
    ) as HTMLElement;
    // "costco" and "Costco" are one place; its price is the average of the two visits.
    expect(
      within(stations)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['costco2 visits · $3.25', 'Shell1 visit · $4.00']);
    expect(screen.getByRole('columnheader', { name: 'Station' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Price paid per unit' })).toBeInTheDocument();
  });
});
