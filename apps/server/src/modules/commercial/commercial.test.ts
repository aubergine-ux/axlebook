import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/helpers';
import { iftaWorksheet, quarterRange } from './ifta';

let t: TestApp;
let truck: number;
beforeAll(async () => {
  t = await createTestApp();
  const res = await t.req({
    method: 'POST',
    url: '/api/v1/vehicles',
    payload: {
      category: 'semi',
      unitNumber: '42',
      year: 2020,
      make: 'Peterbilt',
      model: '579',
      odometerUnit: 'mi',
      fuelUnit: 'gal_us',
      fuelType: 'diesel',
    },
  });
  expect(res.statusCode).toBe(201);
  truck = res.json().id;
});
afterAll(() => t.close());

describe('vehicle categories', () => {
  it('stores the category and unit number, and lists by garage section', async () => {
    const car = await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: {
        year: 2018,
        make: 'Honda',
        model: 'Civic',
        odometerUnit: 'mi',
        fuelUnit: 'gal_us',
        fuelType: 'gasoline',
      },
    });
    expect(car.json()).toMatchObject({ category: 'car', unitNumber: null });
    const sled = await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: {
        category: 'snowmobile',
        year: 2019,
        make: 'Ski-Doo',
        model: 'Summit',
        odometerUnit: 'hr',
        fuelUnit: 'l',
        fuelType: 'gasoline',
      },
    });
    expect(sled.json()).toMatchObject({ category: 'snowmobile', odometerUnit: 'hr' });
    const list = async (section: string) =>
      (await t.req({ method: 'GET', url: `/api/v1/vehicles?section=${section}` }))
        .json()
        .map((v: { model: string }) => v.model);
    expect(await list('car')).toEqual(['Civic']);
    expect(await list('powersports')).toEqual(['Summit']);
    expect(await list('commercial')).toEqual(['579']);
    // Editing other fields keeps the category.
    await t.req({
      method: 'PATCH',
      url: `/api/v1/vehicles/${sled.json().id}`,
      payload: { nickname: 'Powder' },
    });
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${sled.json().id}` })).json().category,
    ).toBe('snowmobile');
  });
});

describe('inspections (DVIR)', () => {
  let id: number;
  it('records a pre-trip with a defect', async () => {
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${truck}/inspections`,
      payload: {
        type: 'pre_trip',
        date: '2026-10-01',
        odometer: 412_000,
        items: [
          { item: 'service_brakes', ok: true },
          { item: 'lights', ok: false, note: 'Left marker out' },
          { item: 'tires', ok: true, note: 'ignored when ok' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const ins = res.json();
    id = ins.id;
    expect(ins).toMatchObject({ defects: 1, correctedAt: null, inspector: 'admin' });
    expect(ins.items[2]).toEqual({ item: 'tires', ok: true, note: null });
  });

  it('marks defects corrected, once', async () => {
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/inspections/${id}/correct`,
      payload: { correctionNotes: 'Bulb replaced' },
    });
    expect(res.json()).toMatchObject({ correctionNotes: 'Bulb replaced', correctedBy: 'admin' });
    expect(res.json().correctedAt).toBeTruthy();
    const clean = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${truck}/inspections`,
      payload: { type: 'post_trip', date: '2026-10-01', items: [{ item: 'tires', ok: true }] },
    });
    expect(
      (
        await t.req({
          method: 'POST',
          url: `/api/v1/inspections/${clean.json().id}/correct`,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    const list = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${truck}/inspections` })
    ).json();
    expect(list.map((i: { type: string }) => i.type)).toEqual(['post_trip', 'pre_trip']);
  });

  it('keeps other users out', async () => {
    const other = await t.user('drew');
    expect(
      (await other.req({ method: 'GET', url: `/api/v1/vehicles/${truck}/inspections` })).statusCode,
    ).toBe(404);
    expect(
      (await other.req({ method: 'DELETE', url: `/api/v1/inspections/${id}` })).statusCode,
    ).toBe(404);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/inspections/${id}` })).statusCode).toBe(
      204,
    );
  });
});

describe('IFTA', () => {
  it('gives quarter date ranges', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2024, 1).to).toBe('2024-03-31');
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('splits distance by the jurisdiction last recorded, and fuel by where it was bought', () => {
    const out = iftaWorksheet(
      [{ id: 1, odometerUnit: 'mi', fuelUnit: 'gal_us' }],
      [
        { vehicleId: 1, date: '2026-06-30', odometer: 1000, jurisdiction: 'TX' }, // previous quarter
        { vehicleId: 1, date: '2026-07-01', odometer: 1100, jurisdiction: 'OK' }, // 100 mi in TX, ends in Q3
        { vehicleId: 1, date: '2026-07-02', odometer: 1400, jurisdiction: null }, // 300 mi in OK
        { vehicleId: 1, date: '2026-07-03', odometer: 1600, jurisdiction: 'KS' }, // 200 more in OK
      ],
      [
        { vehicleId: 1, date: '2026-07-01', volume: 50_000, jurisdiction: 'OK' },
        { vehicleId: 1, date: '2026-07-03', volume: 50_000, jurisdiction: 'KS' },
      ],
      quarterRange(2026, 3),
      { distance: 'mi', volume: 'gal_us' },
    );
    expect(out.totalDistance).toBe(600);
    expect(out.totalFuel).toBe(100_000);
    expect(out.fleetEconomy).toBe(6);
    expect(out.rows).toEqual([
      { jurisdiction: 'KS', distance: 0, taxableFuel: 0, purchased: 50_000, net: -50_000 },
      { jurisdiction: 'OK', distance: 500, taxableFuel: 83_333, purchased: 50_000, net: 33_333 },
      { jurisdiction: 'TX', distance: 100, taxableFuel: 16_667, purchased: 0, net: 16_667 },
    ]);
  });

  it('builds the worksheet from fill-ups and odometer readings', async () => {
    const fill = (date: string, odometer: number, gallons: number, jurisdiction: string) =>
      t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${truck}/records`,
        payload: {
          kind: 'fuel',
          date,
          odometer,
          cost: gallons * 4000,
          fuel: { volume: gallons * 1000, isFull: true, jurisdiction },
        },
      });
    expect((await fill('2026-07-01', 500_000, 100, 'tx')).statusCode).toBe(201);
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${truck}/odometer`,
      payload: { date: '2026-07-02', odometer: 500_300, jurisdiction: 'NM' },
    });
    await fill('2026-07-03', 500_700, 120, 'AZ');
    const r = (await t.req({ method: 'GET', url: '/api/v1/ifta?year=2026&quarter=3' })).json();
    expect(r).toMatchObject({
      from: '2026-07-01',
      to: '2026-09-30',
      distanceUnit: 'mi',
      totalDistance: 700,
      totalFuel: 220_000,
    });
    expect(
      r.rows.map((x: { jurisdiction: string; distance: number }) => [x.jurisdiction, x.distance]),
    ).toEqual([
      ['AZ', 0],
      ['NM', 400],
      ['TX', 300],
    ]);
    // Every mile between readings has a jurisdiction here.
    expect(r.unassignedDistance).toBe(0);
    // Only commercial vehicles are covered.
    const empty = (await t.req({ method: 'GET', url: '/api/v1/ifta?year=2026&quarter=2' })).json();
    expect(empty.rows).toEqual([]);
  });
});
