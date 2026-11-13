import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';
import { mileageReport } from './routes';

let t: TestApp;
let v: number;
beforeAll(async () => {
  t = await createTestApp();
  v = (
    await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: vehicleBody({ usage: 'business' }),
    })
  ).json().id;
});
afterAll(() => t.close());

const trip = (patch: Record<string, unknown> = {}) => ({
  date: '2025-03-04',
  startOdometer: 10_000,
  endOdometer: 10_120,
  purpose: 'Client visit',
  from: 'Office',
  to: 'Acme Corp',
  ...patch,
});
const post = (payload: Record<string, unknown>) =>
  t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/trips`, payload });

describe('trip log', () => {
  it('logs a trip, works out the distance and keeps the odometer current', async () => {
    const res = await post(trip());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      distance: 120,
      business: true,
      purpose: 'Client visit',
      from: 'Office',
      to: 'Acme Corp',
    });
    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage[0].currentOdometer).toBe(10_120);
    // Logging the same end reading twice doesn't add a second odometer entry.
    await post(trip({ purpose: 'Same day, same reading', startOdometer: 10_120 }));
    const readings = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/odometer` })).json();
    expect(readings).toHaveLength(1);
  });

  it('rejects a trip that ends before it starts, has no purpose, or a bad date', async () => {
    for (const bad of [
      trip({ endOdometer: 9_999 }),
      trip({ purpose: '   ' }),
      trip({ date: '2025-02-30' }),
      trip({ startOdometer: -1 }),
    ])
      expect((await post(bad)).statusCode, JSON.stringify(bad)).toBe(400);
    // A trip of zero distance is allowed (someone logging a cancelled visit).
    expect((await post(trip({ startOdometer: 10_120, endOdometer: 10_120 }))).statusCode).toBe(201);
  });

  it('edits and deletes, and filters by year', async () => {
    const id = (
      await post(trip({ date: '2024-12-30', startOdometer: 9_000, endOdometer: 9_050 }))
    ).json().id;
    const edited = await t.req({
      method: 'PATCH',
      url: `/api/v1/trips/${id}`,
      payload: trip({
        date: '2024-12-30',
        startOdometer: 9_000,
        endOdometer: 9_080,
        business: false,
      }),
    });
    expect(edited.json()).toMatchObject({ distance: 80, business: false });
    const y2024 = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/trips?year=2024` })
    ).json();
    expect(y2024.map((x: { id: number }) => x.id)).toEqual([id]);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/trips/${id}` })).statusCode).toBe(204);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/trips/${id}` })).statusCode).toBe(404);
  });

  it('reports a year: business distance by month and purpose against everything driven', async () => {
    await post(
      trip({
        date: '2025-03-20',
        startOdometer: 10_500,
        endOdometer: 10_700,
        purpose: 'client visit ',
      }),
    );
    await post(
      trip({ date: '2025-06-02', startOdometer: 12_000, endOdometer: 12_030, purpose: 'Supplies' }),
    );
    await post(
      trip({
        date: '2025-06-09',
        startOdometer: 12_100,
        endOdometer: 12_400,
        purpose: 'Holiday',
        business: false,
      }),
    );
    // A plain odometer reading at the end of the year widens the total.
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${v}/odometer`,
      payload: { date: '2025-12-31', odometer: 14_000 },
    });
    const r = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/mileage?year=2025` })
    ).json();
    expect(r).toMatchObject({
      year: 2025,
      odometerUnit: 'mi',
      trips: 6,
      businessDistance: 350, // 120 + 0 + 0 + 200 + 30
      personalDistance: 300,
      startOdometer: 10_000,
      endOdometer: 14_000,
      totalDistance: 4000,
      businessShare: 8.8, // 350 / 4000
      years: [2025],
    });
    expect(r.byMonth).toEqual([
      { month: '2025-03', distance: 320, trips: 4 },
      { month: '2025-06', distance: 30, trips: 1 },
    ]);
    // "Client visit" and "client visit " are one purpose, shown as it was last typed.
    expect(r.byPurpose[0]).toEqual({ purpose: 'client visit', distance: 320, trips: 3 });

    // With no year it picks the latest one that has trips; an empty year is all zeroes.
    expect((await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/mileage` })).json().year).toBe(
      2025,
    );
    const empty = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/mileage?year=2019` })
    ).json();
    expect(empty).toMatchObject({
      trips: 0,
      businessDistance: 0,
      totalDistance: null,
      businessShare: null,
      byMonth: [],
    });
  });

  it('exports the year as CSV with the totals underneath', async () => {
    const res = await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/mileage.csv?year=2025` });
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toContain('mileage-2025.csv');
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe(
      'date,purpose,from,to,start_odometer,end_odometer,distance,business,notes',
    );
    expect(lines[1]).toBe('2025-03-04,Client visit,Office,Acme Corp,10000,10120,120,true,');
    expect(lines).toContain('business_distance,350');
    expect(lines).toContain('business_share_percent,8.8');
  });

  it("never claims more than was driven, and can't divide by nothing", () => {
    const base = { id: 1, odometer_unit: 'km' as const };
    const one = {
      id: 1,
      vehicleId: 1,
      date: '2025-01-05',
      startOdometer: 100,
      endOdometer: 100,
      distance: 0,
      purpose: 'Parked',
      from: null,
      to: null,
      business: true,
      notes: null,
    };
    expect(mileageReport(base, 2025, [one], [], [2025])).toMatchObject({
      totalDistance: 0,
      businessShare: null,
    });
    // Trips logged with overlapping readings can add up to more than the odometer moved.
    const overlapping = [
      { ...one, endOdometer: 200, distance: 100 },
      { ...one, id: 2, startOdometer: 150, endOdometer: 200, distance: 50 },
    ];
    expect(mileageReport(base, 2025, overlapping, [], [2025]).businessShare).toBe(100);
  });

  it('keeps viewers and strangers out', async () => {
    const stranger = await t.user('stranger');
    expect(
      (await stranger.req({ method: 'GET', url: `/api/v1/vehicles/${v}/trips` })).statusCode,
    ).toBe(404);
    const viewer = await t.user('looker', 'viewer');
    await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v}/shares/${viewer.user.id}`,
      payload: { permission: 'edit' },
    });
    expect(
      (await viewer.req({ method: 'GET', url: `/api/v1/vehicles/${v}/trips` })).statusCode,
    ).toBe(200);
    expect(
      (await viewer.req({ method: 'POST', url: `/api/v1/vehicles/${v}/trips`, payload: trip() }))
        .statusCode,
    ).toBe(403);
  });
});
