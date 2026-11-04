import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
let vid: number;
beforeAll(async () => {
  t = await createTestApp();
  vid = (await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })).json()
    .id;
});
afterAll(() => t.close());

const stock = async (id: number) =>
  (await t.req({ method: 'GET', url: '/api/v1/parts' }))
    .json()
    .find((p: { id: number }) => p.id === id).quantity;

describe('parts inventory', () => {
  it('deducts stock when used, applies only the difference on edit, and restores on delete', async () => {
    const oil = (
      await t.req({
        method: 'POST',
        url: '/api/v1/parts',
        payload: { name: '0W-20 quart', quantity: 6000, unitCost: 8_970 },
      })
    ).json();
    const filter = (
      await t.req({
        method: 'POST',
        url: '/api/v1/parts',
        payload: { name: 'Oil filter', partNumber: '04152-YZZA6', quantity: 2000, vehicleId: vid },
      })
    ).json();
    expect(filter.vehicleTitle).toBe('2015 Toyota Tacoma');

    const rec = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${vid}/records`,
        payload: {
          kind: 'service',
          date: '2026-01-01',
          title: 'Oil change',
          parts: [
            { partId: oil.id, quantity: 5500 },
            { partId: filter.id, quantity: 1000 },
          ],
        },
      })
    ).json();
    expect(rec.parts).toEqual([
      { partId: oil.id, name: '0W-20 quart', quantity: 5500, unitCost: 8_970 },
      { partId: filter.id, name: 'Oil filter', quantity: 1000, unitCost: null },
    ]);
    expect(await stock(oil.id)).toBe(500);
    expect(await stock(filter.id)).toBe(1000);

    await t.req({
      method: 'PUT',
      url: `/api/v1/records/${rec.id}`,
      payload: {
        kind: 'service',
        date: '2026-01-01',
        title: 'Oil change',
        parts: [{ partId: oil.id, quantity: 6000 }],
      },
    });
    expect(await stock(oil.id)).toBe(0);
    expect(await stock(filter.id)).toBe(2000);

    await t.req({ method: 'DELETE', url: `/api/v1/records/${rec.id}` });
    expect(await stock(oil.id)).toBe(6000);
  });

  it('allows stock to go negative (logging after the fact) and adjusts by delta', async () => {
    const p = (
      await t.req({ method: 'POST', url: '/api/v1/parts', payload: { name: 'Bulb', quantity: 0 } })
    ).json();
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${vid}/records`,
      payload: {
        kind: 'repair',
        date: '2026-01-02',
        title: 'Bulb',
        parts: [{ partId: p.id, quantity: 1000 }],
      },
    });
    expect(await stock(p.id)).toBe(-1000);
    expect(
      (
        await t.req({
          method: 'POST',
          url: `/api/v1/parts/${p.id}/adjust`,
          payload: { delta: 3000 },
        })
      ).json().quantity,
    ).toBe(2000);
  });

  it("keeps other people's parts private", async () => {
    const other = await t.user('other');
    const mine = (
      await t.req({ method: 'POST', url: '/api/v1/parts', payload: { name: 'Mine' } })
    ).json();
    expect((await other.req({ method: 'GET', url: '/api/v1/parts' })).json()).toEqual([]);
    expect(
      (
        await other.req({
          method: 'PUT',
          url: `/api/v1/parts/${mine.id}`,
          payload: { name: 'Stolen' },
        })
      ).statusCode,
    ).toBe(404);
    const otherVehicle = (
      await other.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json();
    const use = await other.req({
      method: 'POST',
      url: `/api/v1/vehicles/${otherVehicle.id}/records`,
      payload: {
        kind: 'repair',
        date: '2026-01-01',
        title: 'x',
        parts: [{ partId: mine.id, quantity: 1000 }],
      },
    });
    expect(use.statusCode).toBe(400);
  });
});

describe('planner', () => {
  it('turns a planned job into a record and marks it done', async () => {
    const item = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${vid}/plan`,
        payload: {
          title: 'Rear brake shoes',
          kind: 'service',
          priority: 'high',
          estimatedCost: 180_000,
        },
      })
    ).json();
    expect(item).toMatchObject({ status: 'planned', priority: 'high' });
    expect(
      (await t.req({ method: 'GET', url: '/api/v1/plan' })).json().map((p: { id: number }) => p.id),
    ).toContain(item.id);

    const res = await t.req({
      method: 'POST',
      url: `/api/v1/plan/${item.id}/convert`,
      payload: { date: '2026-02-01', odometer: 62_000 },
    });
    expect(res.statusCode).toBe(201);
    const { plan, record } = res.json();
    expect(plan).toMatchObject({ status: 'done', convertedRecordId: record.id });
    expect(record).toMatchObject({
      kind: 'service',
      title: 'Rear brake shoes',
      cost: 180_000,
      odometer: 62_000,
    });
    expect(
      (
        await t.req({
          method: 'POST',
          url: `/api/v1/plan/${item.id}/convert`,
          payload: { date: '2026-02-01' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await t.req({ method: 'GET', url: '/api/v1/plan' })).json().map((p: { id: number }) => p.id),
    ).not.toContain(item.id);
  });
});

describe('reports', () => {
  it('totals by kind, month and category, with distance and cost per distance', async () => {
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Report' }),
      })
    ).json().id;
    const add = (p: Record<string, unknown>) =>
      t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/records`, payload: p });
    await add({
      kind: 'fuel',
      date: '2026-01-05',
      odometer: 10_000,
      cost: 40_000,
      fuel: { volume: 12_000 },
    });
    await add({
      kind: 'fuel',
      date: '2026-01-20',
      odometer: 10_300,
      cost: 35_000,
      fuel: { volume: 10_000 },
    });
    await add({
      kind: 'service',
      date: '2026-02-03',
      odometer: 10_600,
      title: 'Oil',
      cost: 60_000,
    });
    await add({
      kind: 'expense',
      expenseCategory: 'insurance',
      date: '2026-02-10',
      title: 'Insurance',
      cost: 500_000,
    });
    await add({ kind: 'service', date: '2025-06-01', title: 'Out of range', cost: 1_000_000 });

    const r = (
      await t.req({
        method: 'GET',
        url: `/api/v1/reports?vehicleId=${v}&from=2026-01-01&to=2026-12-31`,
      })
    ).json();
    expect(r.distanceUnit).toBe('mi');
    expect(r.totals).toMatchObject({ cost: 635_000, records: 4, distance: 600 });
    expect(r.totals.byKind).toMatchObject({ fuel: 75_000, service: 60_000, expense: 500_000 });
    expect(r.totals.costPerDistance).toBeCloseTo(635_000 / 600);
    expect(r.monthly.map((m: { month: string; total: number }) => [m.month, m.total])).toEqual([
      ['2026-01', 75_000],
      ['2026-02', 560_000],
    ]);
    expect(r.byCategory[0]).toMatchObject({ key: 'insurance', kind: 'expense', total: 500_000 });
    expect(r.vehicles[0]).toMatchObject({
      distance: 600,
      averageEconomy: 30,
      fuelTrend: [{ date: '2026-01-20', economy: 30 }],
    });

    const km = (
      await t.req({
        method: 'GET',
        url: `/api/v1/reports?vehicleId=${v}&from=2026-01-01&distanceUnit=km`,
      })
    ).json();
    expect(km.totals.distance).toBeCloseTo(965.6, 1);
  });
});
