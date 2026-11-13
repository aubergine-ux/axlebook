import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
let v: number;
beforeAll(async () => {
  t = await createTestApp({ BASE_URL: 'https://garage.example.com' });
  v = (
    await req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: vehicleBody({ vin: '5tfax5gn0fx000001', engine: '4.0L V6', color: 'Red' }),
    })
  ).json().id;
  for (const r of [
    {
      kind: 'repair',
      date: '2025-06-01',
      odometer: 61_000,
      title: 'Water pump',
      cost: 420_000,
      notes: 'OEM part',
    },
    {
      kind: 'service',
      date: '2024-03-10',
      odometer: 50_000,
      title: 'Oil and filter',
      cost: 80_000,
    },
    { kind: 'upgrade', date: '2024-08-01', title: 'Tonneau cover', cost: 600_000 },
    { kind: 'fuel', date: '2025-01-01', odometer: 58_000, cost: 40_000, fuel: { volume: 10_000 } },
    {
      kind: 'expense',
      date: '2025-01-05',
      title: 'Parking ticket',
      cost: 75_000,
      expenseCategory: 'other',
    },
  ])
    await req({ method: 'POST', url: `/api/v1/vehicles/${v}/records`, payload: r });
});
afterAll(() => t.close());

// BASE_URL pins the CSRF origin check, so requests must come from that origin.
const origin = { origin: 'https://garage.example.com' };
const req: TestApp['req'] = (o) => t.req({ ...o, headers: { ...origin, ...(o.headers ?? {}) } });
const open = (url: string) =>
  t.app.inject({ method: 'GET', url: `/api/public/history/${url.split('/h/')[1]}` });

describe('service history report', () => {
  it('lists the work oldest first, and leaves out fuel, expenses, costs, VIN and notes by default', async () => {
    const h = (await req({ method: 'GET', url: `/api/v1/vehicles/${v}/history` })).json();
    expect(h.vehicle).toMatchObject({
      title: '2015 Toyota Tacoma',
      engine: '4.0L V6',
      color: 'Red',
      vin: null,
      currentOdometer: 61_000,
      odometerUnit: 'mi',
    });
    expect(h.records).toEqual([
      {
        date: '2024-03-10',
        kind: 'service',
        title: 'Oil and filter',
        odometer: 50_000,
        cost: null,
        notes: null,
      },
      {
        date: '2024-08-01',
        kind: 'upgrade',
        title: 'Tonneau cover',
        odometer: null,
        cost: null,
        notes: null,
      },
      {
        date: '2025-06-01',
        kind: 'repair',
        title: 'Water pump',
        odometer: 61_000,
        cost: null,
        notes: null,
      },
    ]);
    expect(h.totals).toEqual({
      records: 3,
      firstDate: '2024-03-10',
      lastDate: '2025-06-01',
      cost: null,
    });
    expect(JSON.stringify(h)).not.toMatch(/Parking ticket|5TFAX5GN0FX000001|OEM part/);
  });

  it('includes costs, the VIN and notes when asked', async () => {
    const h = (
      await req({
        method: 'GET',
        url: `/api/v1/vehicles/${v}/history?costs=true&vin=true&notes=true`,
      })
    ).json();
    expect(h.vehicle.vin).toBe('5TFAX5GN0FX000001');
    expect(h.records[2]).toMatchObject({ cost: 420_000, notes: 'OEM part' });
    expect(h.totals.cost).toBe(1_100_000);
    expect(h.currency).toBe('USD');
  });
});

describe('share links', () => {
  it('lets anyone with the link read the report, and nothing more', async () => {
    const link = (
      await req({
        method: 'POST',
        url: `/api/v1/vehicles/${v}/history-links`,
        payload: { label: 'For the buyer', showCosts: true },
      })
    ).json();
    expect(link.url).toMatch(/^https:\/\/garage\.example\.com\/h\/[\w-]{30,}$/);
    expect(link).toMatchObject({
      state: 'active',
      label: 'For the buyer',
      showCosts: true,
      showVin: false,
      views: 0,
    });
    // 30 days unless told otherwise.
    const days = (Date.parse(link.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const res = await open(link.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    const h = res.json();
    expect(h.records).toHaveLength(3);
    expect(h.records[0].cost).toBe(80_000);
    expect(h.vehicle.vin).toBeNull();
    expect(h.expiresAt).toBe(link.expiresAt);
    // The link is not a session: it opens nothing in the API.
    const token = link.url.split('/h/')[1];
    for (const attempt of [
      { url: `/api/v1/vehicles/${v}`, headers: { authorization: `Bearer ${token}` } },
      { url: `/api/v1/vehicles/${v}/records`, headers: { cookie: `axlebook_session=${token}` } },
    ])
      expect((await t.app.inject({ method: 'GET', ...attempt })).statusCode).toBe(401);

    const listed = (
      await req({ method: 'GET', url: `/api/v1/vehicles/${v}/history-links` })
    ).json();
    expect(listed[0]).toMatchObject({ id: link.id, views: 1, lastViewedAt: expect.any(String) });
  });

  it('stops working the moment it is revoked, and when it expires', async () => {
    const make = async (payload: Record<string, unknown>) =>
      (await req({ method: 'POST', url: `/api/v1/vehicles/${v}/history-links`, payload })).json();
    const revoked = await make({});
    expect((await open(revoked.url)).statusCode).toBe(200);
    const off = (
      await req({ method: 'DELETE', url: `/api/v1/history-links/${revoked.id}` })
    ).json();
    expect(off).toMatchObject({ state: 'revoked', revokedAt: expect.any(String) });
    expect((await open(revoked.url)).statusCode).toBe(404);
    // Revoking again changes nothing.
    expect(
      (await req({ method: 'DELETE', url: `/api/v1/history-links/${revoked.id}` })).json()
        .revokedAt,
    ).toBe(off.revokedAt);

    const short = await make({ expiresInDays: 1 });
    await t.db
      .updateTable('history_links')
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where('id', '=', short.id)
      .execute();
    expect((await open(short.url)).statusCode).toBe(404);
    const listed = (
      await req({ method: 'GET', url: `/api/v1/vehicles/${v}/history-links` })
    ).json();
    expect(listed.find((l: { id: number }) => l.id === short.id).state).toBe('expired');

    const forever = await make({ expiresInDays: null });
    expect(forever.expiresAt).toBeNull();
    expect((await open(forever.url)).statusCode).toBe(200);
    for (const bad of [{ expiresInDays: 0 }, { expiresInDays: 366 }, { label: 'x'.repeat(81) }])
      expect(
        (await req({ method: 'POST', url: `/api/v1/vehicles/${v}/history-links`, payload: bad }))
          .statusCode,
      ).toBe(400);
  });

  it('dies with the vehicle, answers unknown tokens the same way, and slows down guessing', async () => {
    const other = (
      await req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const link = (
      await req({ method: 'POST', url: `/api/v1/vehicles/${other}/history-links`, payload: {} })
    ).json();
    await req({ method: 'DELETE', url: `/api/v1/vehicles/${other}` });
    expect((await open(link.url)).statusCode).toBe(404);

    const guess = (token: string) =>
      t.app.inject({
        method: 'GET',
        url: `/api/public/history/${token}`,
        remoteAddress: '203.0.113.9',
      });
    expect((await guess('short')).statusCode).toBe(404);
    for (let i = 0; i < 30; i++) await guess(`guess-${i}-padding-padding-padding`);
    expect((await guess('one-more-guess-padding-padding')).statusCode).toBe(429);
    // Other visitors are unaffected.
    const good = (
      await req({ method: 'POST', url: `/api/v1/vehicles/${v}/history-links`, payload: {} })
    ).json();
    expect((await open(good.url)).statusCode).toBe(200);
  });

  it('is only for the owner to hand out', async () => {
    const helper = await t.user('helper');
    await req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v}/shares/${helper.user.id}`,
      payload: { permission: 'edit' },
    });
    const as: TestApp['req'] = (o) =>
      helper.req({ ...o, headers: { ...origin, ...(o.headers ?? {}) } });
    // Someone it's shared with can read the report but not publish it.
    expect((await as({ method: 'GET', url: `/api/v1/vehicles/${v}/history` })).statusCode).toBe(
      200,
    );
    expect(
      (await as({ method: 'POST', url: `/api/v1/vehicles/${v}/history-links`, payload: {} }))
        .statusCode,
    ).toBe(403);
    expect(
      (await as({ method: 'GET', url: `/api/v1/vehicles/${v}/history-links` })).statusCode,
    ).toBe(403);
  });
});
