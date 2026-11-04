import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../test/helpers';
import { seedDemo } from './demo';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('demo seed', () => {
  it('creates the Tacoma and Civic with history, one overdue and one upcoming reminder', async () => {
    expect(await seedDemo(t.db, t.app.services.records, { timeZone: 'UTC' })).toEqual({
      seeded: true,
      createdUser: null,
    });
    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage.map((v: { year: number; model: string }) => `${v.year} ${v.model}`)).toEqual([
      '2018 Civic',
      '2015 Tacoma',
    ]);
    for (const v of garage) {
      expect(v.currentOdometer).toBeGreaterThan(50_000);
      expect(v.costToDate).toBeGreaterThan(5_000_000);
      const fuel = (
        await t.req({ method: 'GET', url: `/api/v1/vehicles/${v.id}/fuel-economy` })
      ).json();
      expect(fuel.fills.length).toBeGreaterThan(40);
      expect(fuel.fills.some((f: { status: string }) => f.status === 'partial')).toBe(true);
      expect(fuel.fills.some((f: { status: string }) => f.status === 'missed')).toBe(true);
      const [lo, hi] = v.model === 'Tacoma' ? [17, 21.5] : [30, 37];
      expect(fuel.average).toBeGreaterThan(lo);
      expect(fuel.average).toBeLessThan(hi);
      const kinds = (
        await t.req({
          method: 'GET',
          url: `/api/v1/vehicles/${v.id}/records?kind=repair,expense,service&limit=500`,
        })
      ).json();
      expect(new Set(kinds.items.map((i: { kind: string }) => i.kind))).toEqual(
        new Set(['repair', 'expense', 'service']),
      );
    }
    const reminders = (await t.req({ method: 'GET', url: '/api/v1/reminders' })).json();
    expect(
      reminders.map((r: { title: string; status: string; vehicleTitle: string }) => [
        r.vehicleTitle,
        r.title,
        r.status,
      ]),
    ).toEqual([
      ['2015 Toyota Tacoma SR5 Double Cab', 'Oil and filter change', 'overdue'],
      ['2018 Honda Civic EX', 'Registration renewal', 'upcoming'],
    ]);
  });

  it('only runs once', async () => {
    expect(await seedDemo(t.db, t.app.services.records, { timeZone: 'UTC' })).toEqual({
      seeded: false,
      createdUser: null,
    });
    expect((await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json()).toHaveLength(2);
  });
});
