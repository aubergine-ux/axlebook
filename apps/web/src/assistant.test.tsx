import type { AiStatus, RecordDraft, Vehicle } from '@axlebook/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, signedIn, testMe } from './test-utils';

const civic: Vehicle = {
  id: 7,
  ownerId: 1,
  category: 'car',
  unitNumber: null,
  year: 2018,
  make: 'Honda',
  model: 'Civic',
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
  notes: null,
  photoUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  access: 'owner',
};
const summary = { ...civic, currentOdometer: 61_000, costToDate: 0, nextReminder: null };
const on: AiStatus = {
  enabled: true,
  model: 'gemma3:4b',
  reachable: true,
  modelReady: true,
  pullProgress: null,
  vision: true,
  error: null,
};
const draft: RecordDraft = {
  vehicleId: 7,
  kind: 'fuel',
  date: '2026-11-01',
  odometer: 61_402,
  title: null,
  station: 'Shell',
  cost: 37_692,
  pricePerUnit: 3490,
  volume: 10_800,
  notes: null,
};
const base = {
  'GET /api/v1/ai/status': on,
  'GET /api/v1/vehicles': [summary],
  'GET /api/v1/vehicles/7/reminders': [],
  'GET /api/v1/parts': [],
};

afterEach(() => vi.unstubAllGlobals());

describe('local assistant', () => {
  it('fills in the form from a sentence, and saves only when the person presses Save', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/v1/assistant/entry': draft,
      'POST /api/v1/vehicles/7/records': { id: 55, vehicleId: 7 },
      'GET /api/v1/records/55': { id: 55 },
    });
    renderApp('/assistant');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /What happened/ }),
      'filled up 10.8 gal at 3.49, 61402 mi, civic',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fill in the form' }));
    expect(await screen.findByRole('heading', { name: 'Check and save' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Odometer/ })).toHaveValue('61402');
    expect(screen.getByRole('textbox', { name: /Station/ })).toHaveValue('Shell');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/records'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Save record' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/vehicles/7/records'))).toBe(true),
    );
    const body = calls.find((c) => c.url.endsWith('/vehicles/7/records'))?.body as Record<
      string,
      unknown
    >;
    // The form shows the total in cents, so $37.69 is what gets saved.
    expect(body).toMatchObject({
      kind: 'fuel',
      date: '2026-11-01',
      odometer: 61_402,
      cost: 37_690,
    });
    expect(body.fuel).toMatchObject({ volume: 10_800, pricePerUnit: 3490, station: 'Shell' });
  });

  it('opens an empty form, with the reason, when the model fails', async () => {
    mockApi({
      ...base,
      'POST /api/v1/assistant/entry': () =>
        Response.json(
          { error: { code: 'ai_failed', params: { reason: 'timeout' } } },
          { status: 502 },
        ),
    });
    renderApp('/assistant');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /What happened/ }),
      'oil change on the civic',
    );
    await userEvent.selectOptions(
      screen.getAllByRole('combobox', { name: 'Vehicle' })[1] as HTMLElement,
      '7',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fill in the form' }));
    expect(
      await screen.findByText(
        'The assistant took too long, so the form is empty. Fill it in by hand.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Odometer/ })).toHaveValue('');
  });

  it('answers from the logbook with links to the records it used', async () => {
    mockApi({
      ...base,
      'POST /api/v1/assistant/ask': ({ body }: { body: unknown }) =>
        (body as { question: string }).question.includes('oil')
          ? {
              found: true,
              answer: 'On March 2, 2026, at 80,100 mi.',
              sources: [
                {
                  recordId: 12,
                  vehicleId: 7,
                  vehicle: '2018 Honda Civic',
                  date: '2026-03-02',
                  kind: 'service',
                  title: 'Oil change',
                },
              ],
              reminders: [],
              model: 'gemma3:4b',
            }
          : { found: false, answer: null, sources: [], reminders: [], model: 'gemma3:4b' },
    });
    renderApp('/assistant');
    const box = await screen.findByRole('textbox', { name: /Your question/ });
    await userEvent.type(box, 'When did I last change the oil?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('On March 2, 2026, at 80,100 mi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Oil change/ })).toHaveAttribute('href', '/records/12');
    await userEvent.clear(box);
    await userEvent.type(box, 'What colour are the seats?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText("That isn't in your records.")).toBeInTheDocument();
  });

  it('lets viewers ask, without the tools that create records', async () => {
    mockApi({
      ...base,
      'GET /api/v1/auth/status': { ...signedIn, user: { ...testMe, role: 'viewer' } },
    });
    renderApp('/assistant');
    expect(await screen.findByRole('heading', { name: 'Ask your logbook' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scan a receipt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Type it out' })).not.toBeInTheDocument();
  });

  it('explains itself when it is off', async () => {
    mockApi({ ...base, 'GET /api/v1/ai/status': { ...on, enabled: false, vision: false } });
    renderApp('/assistant');
    expect(
      await screen.findByText("The local assistant isn't turned on for this server."),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Set it up in Settings.' });
    expect(within(link.parentElement as HTMLElement).queryByRole('textbox')).toBeNull();
  });
});
