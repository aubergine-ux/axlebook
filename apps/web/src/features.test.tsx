import type {
  MaintenanceSchedule,
  SpreadsheetAnalysis,
  Vehicle,
  VehicleTips,
} from '@axlebook/shared';
import { emptySpecs } from '@axlebook/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReading } from './lib/validation';
import { mockApi, renderApp } from './test-utils';

const base: Vehicle = {
  id: 3,
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
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  access: 'owner',
};
const summary = (v: Vehicle) => ({
  ...v,
  currentOdometer: 1000,
  costToDate: 0,
  nextReminder: null,
});
const sled: Vehicle = {
  ...base,
  id: 4,
  category: 'snowmobile',
  make: 'Ski-Doo',
  model: 'Summit',
  odometerUnit: 'hr',
};

afterEach(() => vi.unstubAllGlobals());

describe('garage sections', () => {
  it('appear once there is more than one kind of vehicle, and filter the garage', async () => {
    mockApi({ 'GET /api/v1/vehicles': [summary(base), summary(sled)] });
    renderApp('/');
    const tabs = await screen.findByRole('navigation', { name: 'All' });
    await userEvent.click(within(tabs).getByRole('link', { name: 'Powersports' }));
    await waitFor(() => expect(screen.queryByText(/Tacoma/)).not.toBeInTheDocument());
    expect(screen.getByText(/Summit/)).toBeInTheDocument();
  });

  it("aren't shown for a garage of only cars", async () => {
    mockApi({ 'GET /api/v1/vehicles': [summary(base)] });
    renderApp('/');
    expect(await screen.findByText(/Tacoma/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Powersports' })).not.toBeInTheDocument();
  });
});

describe('tips', () => {
  it('translates data tips and shows AI tips as written', async () => {
    const tips: VehicleTips = {
      tips: [
        {
          id: 'a',
          source: 'data',
          severity: 'warning',
          code: 'economy_down',
          params: { pct: 12 },
          title: null,
          body: null,
        },
        {
          id: 'b',
          source: 'ai',
          severity: 'suggestion',
          code: null,
          params: {},
          title: 'Check the frame',
          body: 'Known rust area.',
        },
      ],
      aiGeneratedAt: '2026-11-01T00:00:00Z',
      model: 'qwen2.5:3b',
    };
    mockApi({
      'GET /api/v1/vehicles/3': base,
      'GET /api/v1/vehicles/3/odometer': [],
      'GET /api/v1/vehicles/3/tips': tips,
      'GET /api/v1/vehicles/3/reminders': [],
    });
    renderApp('/vehicles/3');
    expect(await screen.findByText('Economy has dropped 12%')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Check the frame')).toBeInTheDocument();
    expect(
      screen.getByText('Turn on the local assistant for advice specific to this make and model.'),
    ).toBeInTheDocument();
  });
});

describe('maintenance schedule', () => {
  it('adds the ticked items as reminders', async () => {
    const schedule: MaintenanceSchedule = {
      source: 'builtin',
      basis: '',
      generatedAt: '2026-11-01T00:00:00Z',
      model: '',
      items: [
        {
          title: 'Oil and filter change',
          intervalMonths: 6,
          intervalDistance: 5000,
          notes: null,
          lastDone: null,
          nextDueDate: '2027-01-01',
          nextDueOdometer: 5000,
          hasReminder: false,
        },
        {
          title: 'Tire rotation',
          intervalMonths: 6,
          intervalDistance: 6000,
          notes: null,
          lastDone: null,
          nextDueDate: null,
          nextDueOdometer: 6000,
          hasReminder: false,
        },
        {
          title: 'Wiper blades',
          intervalMonths: 12,
          intervalDistance: null,
          notes: null,
          lastDone: null,
          nextDueDate: null,
          nextDueOdometer: null,
          hasReminder: true,
        },
      ],
    };
    const calls = mockApi({
      'GET /api/v1/vehicles/3': base,
      'GET /api/v1/vehicles/3/odometer': [],
      'GET /api/v1/vehicles/3/reminders': [],
      'GET /api/v1/vehicles/3/schedule': schedule,
      'POST /api/v1/vehicles/3/schedule/apply': { created: 1 },
    });
    renderApp('/vehicles/3/reminders');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Suggest a maintenance schedule' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Every 6 months or 5,000 mi')).toBeInTheDocument();
    // Already a reminder: shown ticked but can't be added again.
    expect(within(dialog).getByRole('checkbox', { name: /Wiper blades/ })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Tire rotation/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 1 reminder' }));
    expect(await screen.findByText('Added 1 reminder.')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      items: [
        { title: 'Oil and filter change', intervalMonths: 6, intervalDistance: 5000, notes: null },
      ],
    });
  });
});

describe('spreadsheet import', () => {
  it('uploads, lets you fill in a missing year, previews and imports', async () => {
    const plan = {
      sheets: [
        {
          sheet: 'Log',
          include: true,
          headerRow: 0,
          vehicleColumn: 'Car',
          vehicleKey: null,
          kindColumn: null,
          kindValues: [],
          defaultKind: 'service' as const,
          columns: {
            date: 'Date',
            odometer: null,
            title: 'Work',
            cost: 'Cost',
            notes: null,
            tags: null,
            fuelVolume: null,
            pricePerUnit: null,
            isFull: null,
            missedPrevious: null,
            station: null,
            grade: null,
            expenseCategory: null,
          },
          extraNoteColumns: [],
          dateOrder: 'mdy' as const,
        },
      ],
      vehicles: [
        {
          key: 'Civic',
          existingVehicleId: null,
          category: 'car' as const,
          year: null,
          make: 'Honda',
          model: 'Civic',
          trim: null,
          nickname: null,
          odometerUnit: 'mi' as const,
          fuelUnit: 'gal_us' as const,
          fuelType: 'gasoline' as const,
        },
      ],
    };
    const analysis: SpreadsheetAnalysis = {
      uploadId: '6f0c4b5e-3c1a-4a51-9d55-1c1f4d7f9a10',
      fileName: 'cars.csv',
      sheets: [
        {
          name: 'Log',
          rowCount: 2,
          headers: ['Date', 'Car', 'Work', 'Cost'],
          sample: [['1/5/2024', 'Civic', 'Oil', '40']],
        },
      ],
      plan,
      planSource: 'matcher',
      savedMapping: null,
      aiError: null,
    };
    const calls = mockApi({
      'GET /api/v1/vehicles': [],
      'POST /api/v1/import/spreadsheet': analysis,
      [`POST /api/v1/import/spreadsheet/${analysis.uploadId}/preview`]: ({
        body,
      }: {
        body: unknown;
      }) => ({
        plan: (body as { plan: unknown }).plan,
        vehicles: [
          {
            key: 'Civic',
            label: '2018 Honda Civic',
            existingVehicleId: null,
            records: 2,
            byKind: { service: 2 },
            firstDate: '2024-01-05',
            lastDate: '2024-02-01',
            problems: [],
          },
        ],
        total: 3,
        valid: 2,
        errors: [{ sheet: 'Log', row: 4, message: 'date' }],
        sample: [],
      }),
      [`POST /api/v1/import/spreadsheet/${analysis.uploadId}/commit`]: {
        vehicles: [{ key: 'Civic', vehicleId: 9, created: true }],
        imported: 2,
        skipped: 0,
        errors: [],
      },
    });
    renderApp('/import');
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!el) throw new Error('no file input');
      return el;
    });
    await userEvent.upload(
      input,
      new File(['Date,Car,Work,Cost\n'], 'cars.csv', { type: 'text/csv' }),
    );
    expect(
      await screen.findByText('Columns matched automatically. Check them below.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sheet: Log (2 rows)' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: /Year/ }), '2018');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('2 of 3 rows are ready to import.')).toBeInTheDocument();
    expect(screen.getByText('Log, row 4: date not recognised')).toBeInTheDocument();
    const preview = calls.find((c) => c.url.endsWith('/preview'));
    expect((preview?.body as { plan: typeof plan } | undefined)?.plan.vehicles[0]?.year).toBe(2018);

    await userEvent.click(screen.getByRole('button', { name: 'Import everything' }));
    expect(
      await screen.findByText('Imported 2 records. Already here and skipped: 0.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Civic' })).toHaveAttribute('href', '/vehicles/9');
  });
});

describe('readings', () => {
  it('reads odometers and hour meters as people type them', () => {
    expect(parseReading('84,100')).toBe(84_100);
    expect(parseReading('84 100 mi')).toBe(84_100);
    expect(parseReading('120.5')).toBe(121);
    expect(parseReading('120,5 h')).toBe(121);
    expect(parseReading('lots')).toBeNaN();
  });
});
