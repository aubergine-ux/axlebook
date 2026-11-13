import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const add = (vehicle: number, payload: Record<string, unknown>) =>
  t.req({ method: 'POST', url: `/api/v1/vehicles/${vehicle}/records`, payload });

describe('total cost of ownership', () => {
  it('is empty but valid for a vehicle with nothing logged', async () => {
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const o = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/ownership` })).json();
    expect(o).toMatchObject({
      since: null,
      months: 0,
      depreciation: null,
      runningTotal: 0,
      total: 0,
      distance: 0,
      costPerDistance: null,
      costPerMonth: null,
      byYear: [],
    });
    expect(o.running).toEqual({
      fuel: 0,
      maintenance: 0,
      upgrades: 0,
      insurance: 0,
      registration: 0,
      tax: 0,
      loan: 0,
      other: 0,
    });
  });

  it('adds depreciation to what was spent, by line and by year', async () => {
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({
          purchaseDate: '2024-01-15',
          purchasePrice: 20_000_000,
          currentValue: 15_500_000,
        }),
      })
    ).json().id;
    for (const r of [
      {
        kind: 'fuel',
        date: '2024-02-01',
        odometer: 50_000,
        cost: 40_000,
        fuel: { volume: 10_000 },
      },
      {
        kind: 'fuel',
        date: '2025-03-01',
        odometer: 60_000,
        cost: 45_000,
        fuel: { volume: 11_000 },
      },
      { kind: 'service', date: '2024-06-01', odometer: 54_000, title: 'Oil', cost: 80_000 },
      { kind: 'repair', date: '2025-01-10', odometer: 58_000, title: 'Alternator', cost: 420_000 },
      { kind: 'upgrade', date: '2024-07-01', title: 'Roof rack', cost: 300_000 },
      {
        kind: 'expense',
        date: '2024-01-20',
        title: 'Policy',
        cost: 900_000,
        expenseCategory: 'insurance',
      },
      {
        kind: 'expense',
        date: '2025-01-20',
        title: 'Policy',
        cost: 950_000,
        expenseCategory: 'insurance',
      },
      {
        kind: 'expense',
        date: '2024-01-16',
        title: 'Plates',
        cost: 120_000,
        expenseCategory: 'registration',
      },
      {
        kind: 'expense',
        date: '2024-05-05',
        title: 'Airport',
        cost: 30_000,
        expenseCategory: 'parking',
      },
      {
        kind: 'expense',
        date: '2024-05-06',
        title: 'Bridge',
        cost: 5_000,
        expenseCategory: 'toll',
      },
    ])
      expect((await add(v, r)).statusCode, JSON.stringify(r)).toBe(201);

    const o = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/ownership` })).json();
    expect(o.running).toEqual({
      fuel: 85_000,
      maintenance: 500_000,
      upgrades: 300_000,
      insurance: 1_850_000,
      registration: 120_000,
      tax: 0,
      loan: 0,
      other: 35_000, // parking and tolls
    });
    expect(o).toMatchObject({
      since: '2024-01-15',
      purchasePrice: 20_000_000,
      currentValue: 15_500_000,
      depreciation: 4_500_000,
      runningTotal: 2_890_000,
      total: 7_390_000,
      distance: 10_000,
      odometerUnit: 'mi',
    });
    // $7,390 over 10,000 mi is 73.9 cents a mile, in milli-units.
    expect(o.costPerDistance).toBeCloseTo(739, 5);
    expect(o.months).toBeGreaterThan(20);
    expect(o.costPerMonth).toBe(Math.round(7_390_000 / o.months));
    expect(o.byYear).toEqual([
      {
        year: '2024',
        fuel: 40_000,
        maintenance: 80_000,
        upgrades: 300_000,
        insurance: 900_000,
        registration: 120_000,
        tax: 0,
        loan: 0,
        other: 35_000,
        total: 1_475_000,
      },
      {
        year: '2025',
        fuel: 45_000,
        maintenance: 420_000,
        upgrades: 0,
        insurance: 950_000,
        registration: 0,
        tax: 0,
        loan: 0,
        other: 0,
        total: 1_415_000,
      },
    ]);
  });

  it('counts from the first record without a purchase date, and handles a car that gained value', async () => {
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ purchasePrice: 8_000_000, currentValue: 11_000_000 }),
      })
    ).json().id;
    await add(v, { kind: 'service', date: '2023-04-02', title: 'Tune-up', cost: 200_000 });
    const o = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/ownership` })).json();
    expect(o).toMatchObject({
      since: '2023-04-02',
      depreciation: -3_000_000,
      runningTotal: 200_000,
      total: -2_800_000,
      costPerDistance: null,
    });
  });

  it('leaves depreciation out until both prices are known', async () => {
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ purchasePrice: 8_000_000 }),
      })
    ).json().id;
    await add(v, { kind: 'service', date: '2025-04-02', title: 'Tune-up', cost: 200_000 });
    const o = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/ownership` })).json();
    expect(o).toMatchObject({ depreciation: null, total: 200_000 });
  });
});
