import type { Vehicle, VehicleRecalls } from '@axlebook/shared';
import { emptySpecs } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, testConfig } from '../../test-utils';

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
  purchaseDate: null,
  purchasePrice: null,
  currentValue: null,
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
const overview = {
  'GET /api/v1/vehicles/1': vehicle,
  'GET /api/v1/vehicles/1/reminders': [],
  'GET /api/v1/vehicles/1/records': { items: [], total: 0 },
  'GET /api/v1/vehicles/1/fuel-economy': { fills: [], average: null },
};
const recall = (patch: Partial<VehicleRecalls['recalls'][number]> = {}) => ({
  id: 7,
  vehicleId: 1,
  campaign: '16V340000',
  component: 'AIR BAGS',
  summary: 'The inflator may rupture.',
  consequence: null,
  remedy: 'Dealers will replace it.',
  reportDate: '2016-05-25',
  state: 'open' as const,
  stateAt: null,
  ...patch,
});

afterEach(() => vi.unstubAllGlobals());

describe('VIN lookup', () => {
  it('is not offered while online lookups are off', async () => {
    mockApi({});
    renderApp('/vehicles/new');
    await screen.findByLabelText(/^VIN/);
    expect(screen.queryByRole('button', { name: 'Look up VIN' })).not.toBeInTheDocument();
  });

  it('fills the form from the VIN and refuses one that cannot be a VIN', async () => {
    const calls = mockApi({
      'GET /api/v1/config': { ...testConfig, onlineLookups: true },
      'POST /api/v1/lookups/vin': {
        vin: '5YJ3E1EA7JF000001',
        year: 2018,
        make: 'Tesla',
        model: 'Model 3',
        trim: null,
        engine: null,
        fuelType: 'electric',
        category: 'car',
      },
    });
    const user = userEvent.setup();
    renderApp('/vehicles/new');
    const look = await screen.findByRole('button', { name: 'Look up VIN' });
    expect(look).toBeDisabled();
    const vin = screen.getByLabelText(/^VIN/);
    await user.type(vin, 'TOO-SHORT');
    await user.click(look);
    expect(await screen.findByText(/17 letters and digits/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/lookups/vin'))).toBe(false);

    await user.clear(vin);
    await user.type(vin, '5yj3e1ea7jf000001');
    await user.click(look);
    await waitFor(() => expect(screen.getByLabelText(/^Make/)).toHaveValue('Tesla'));
    expect(screen.getByLabelText(/^Year/)).toHaveValue('2018');
    expect(screen.getByLabelText(/^Model/)).toHaveValue('Model 3');
    // An electric car switches the fuel unit along with the fuel type.
    expect(screen.getByLabelText('Fuel type')).toHaveValue('electric');
    expect(screen.getByLabelText('Fuel measured in')).toHaveValue('kwh');
    expect(screen.getByText(/Filled in from the VIN/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/lookups/vin'))?.body).toEqual({
      vin: '5YJ3E1EA7JF000001',
    });
  });

  it('shows why a lookup failed and keeps what was typed', async () => {
    mockApi({
      'GET /api/v1/config': { ...testConfig, onlineLookups: true },
      'POST /api/v1/lookups/vin': () =>
        Response.json({ error: { code: 'lookup_failed' } }, { status: 502 }),
    });
    const user = userEvent.setup();
    renderApp('/vehicles/new');
    await user.type(await screen.findByLabelText(/^Make/), 'Saab');
    await user.type(screen.getByLabelText(/^VIN/), '5TFAX5GN0FX000001');
    await user.click(screen.getByRole('button', { name: 'Look up VIN' }));
    expect(await screen.findByText(/Couldn't reach the lookup service/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Make/)).toHaveValue('Saab');
  });
});

describe('recalls on a vehicle', () => {
  it('stays out of the way when lookups are off and nothing is stored', async () => {
    mockApi({
      ...overview,
      'GET /api/v1/vehicles/1/recalls': { enabled: false, checkedAt: null, recalls: [] },
    });
    renderApp('/vehicles/1');
    await screen.findByRole('heading', { name: 'Parts and fluids' });
    expect(screen.queryByRole('heading', { name: 'Safety recalls' })).not.toBeInTheDocument();
  });

  it('checks, lists open recalls, and marks one done', async () => {
    let state: 'open' | 'completed' = 'open';
    const list = (): VehicleRecalls => ({
      enabled: true,
      checkedAt: '2026-11-13T10:00:00.000Z',
      recalls: [recall({ state })],
    });
    const calls = mockApi({
      ...overview,
      'GET /api/v1/vehicles/1/recalls': () =>
        calls.some((c) => c.url.endsWith('/recalls/check'))
          ? list()
          : { enabled: true, checkedAt: null, recalls: [] },
      'POST /api/v1/vehicles/1/recalls/check': () => Response.json(list()),
      'PATCH /api/v1/recalls/7': ({ body }: { body: unknown }) => {
        state = (body as { state: 'completed' }).state;
        return recall({ state });
      },
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1');
    const card = (await screen.findByRole('heading', { name: 'Safety recalls' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText('Not checked yet.')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Check now' }));
    expect(await within(card).findByText('16V340000')).toBeInTheDocument();
    expect(within(card).getByText(/1 open recall\./)).toBeInTheDocument();
    // The state is a word, not just a colour.
    expect(within(card).getByText('Open')).toBeInTheDocument();
    expect(within(card).getByText('The inflator may rupture.')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Mark done' }));
    expect(await within(card).findByText('Done')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ state: 'completed' });
  });
});

describe('parts and fluids', () => {
  it('saves the sheet and shows only the lines that are filled in', async () => {
    let current = vehicle;
    const calls = mockApi({
      ...overview,
      'GET /api/v1/vehicles/1': () => current,
      'GET /api/v1/vehicles/1/recalls': { enabled: false, checkedAt: null, recalls: [] },
      'PATCH /api/v1/vehicles/1': ({ body }: { body: unknown }) => {
        const specs = (body as { specs: Record<string, string> }).specs;
        current = {
          ...vehicle,
          specs: {
            ...emptySpecs(),
            oilType: specs.oilType ?? null,
            tireSize: specs.tireSize ?? null,
          },
        };
        return current;
      },
    });
    const user = userEvent.setup();
    renderApp('/vehicles/1');
    const card = (await screen.findByRole('heading', { name: 'Parts and fluids' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText(/Write down the oil/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Engine oil'), '0W-20');
    await user.type(within(dialog).getByLabelText('Tire size'), '265/70R16');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      specs: { oilType: '0W-20', tireSize: '265/70R16', battery: '', other: [] },
    });
    expect(await within(card).findByText('0W-20')).toBeInTheDocument();
    expect(within(card).getByText('265/70R16')).toBeInTheDocument();
    expect(within(card).queryByText('Battery')).not.toBeInTheDocument();
  });
});
