import type { SpreadsheetAnalysis, SpreadsheetPlan } from '@axlebook/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fakeAi, multipartFile, type TestApp } from '../../test/helpers';
import { makeXlsx } from '../../test/xlsx';

const workbook = makeXlsx([
  {
    name: 'Tacoma',
    rows: [
      ['Fuel and service log'],
      [],
      ['Date', 'Odometer', 'Type', 'Gallons', 'Price/gal', 'Total', 'What', 'Shop'],
      ['1/5/2024', 84_100, 'Gas', 15.2, 3.5, '', '', ''],
      ['1/19/2024', 84_420, 'Gas', 16, 3.45, 55.2, '', ''],
      ['2/1/2024', '84,500', 'Maintenance', '', '', '$89.99', 'Oil change', 'Jiffy'],
      ['3/10/2024', 85_000, 'Repair', '', '', '412.00', 'Rear shackle', ''],
    ],
  },
  {
    name: 'Ski-Doo Summit',
    rows: [
      ['Date', 'Hours', 'Service', 'Cost'],
      ['12/1/2023', 40, 'Pre-season check', 120],
      ['3/30/2024', 61.5, 'Storage prep', 35],
    ],
  },
  {
    name: 'Summary',
    rows: [
      ['Vehicle', 'Spent'],
      ['Tacoma', 600],
    ],
  },
]);

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

async function upload(file: Buffer, name: string, ai = false) {
  const { payload, headers } = multipartFile('file', name, file, 'application/octet-stream');
  return t.req({ method: 'POST', url: `/api/v1/import/spreadsheet?ai=${ai}`, payload, headers });
}

describe('spreadsheet import', () => {
  let analysis: SpreadsheetAnalysis;

  it('reads every sheet and proposes a plan', async () => {
    const res = await upload(workbook, 'garage.xlsx');
    expect(res.statusCode).toBe(200);
    analysis = res.json();
    expect(analysis.planSource).toBe('matcher');
    expect(analysis.aiError).toBeNull();
    expect(analysis.sheets.map((s) => [s.name, s.rowCount])).toEqual([
      ['Tacoma', 4],
      ['Ski-Doo Summit', 2],
      ['Summary', 1],
    ]);
    expect(analysis.sheets[0]?.headers).toContain('Price/gal');
    expect(analysis.plan.sheets.map((s) => s.include)).toEqual([true, true, false]);
    expect(analysis.plan.vehicles).toMatchObject([
      {
        key: 'Tacoma',
        make: 'Toyota',
        model: 'Tacoma',
        year: null,
        category: 'car',
        odometerUnit: 'mi',
      },
      {
        key: 'Ski-Doo Summit',
        make: 'Ski-Doo',
        model: 'Summit',
        category: 'snowmobile',
        odometerUnit: 'hr',
      },
    ]);
  });

  it('previews counts and flags vehicles that need details', async () => {
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/import/spreadsheet/${analysis.uploadId}/preview`,
      payload: { plan: analysis.plan },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.valid).toBe(6);
    expect(p.errors).toEqual([]);
    expect(p.vehicles).toMatchObject([
      { key: 'Tacoma', records: 4, byKind: { fuel: 2, service: 1, repair: 1 }, problems: ['year'] },
      { key: 'Ski-Doo Summit', records: 2, problems: ['year'] },
    ]);
  });

  it('refuses to create a vehicle without a year', async () => {
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/import/spreadsheet/${analysis.uploadId}/commit`,
      payload: { plan: analysis.plan },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'validation_failed',
      params: { key: 'Tacoma', missing: 'year' },
    });
  });

  it('imports into new vehicles, and skips duplicates the second time', async () => {
    const plan: SpreadsheetPlan = {
      ...analysis.plan,
      vehicles: analysis.plan.vehicles.map((v) => ({
        ...v,
        year: v.key === 'Tacoma' ? 2015 : 2019,
      })),
    };
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/import/spreadsheet/${analysis.uploadId}/commit`,
      payload: { plan },
    });
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out).toMatchObject({ imported: 6, errors: [] });
    expect(out.vehicles.every((v: { created: boolean }) => v.created)).toBe(true);

    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    const sled = garage.find((v: { make: string }) => v.make === 'Ski-Doo');
    expect(sled).toMatchObject({ category: 'snowmobile', odometerUnit: 'hr', currentOdometer: 62 });
    const taco = garage.find((v: { model: string }) => v.model === 'Tacoma');
    const records = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${taco.id}/records?limit=50` })
    ).json().items;
    const oil = records.find((r: { title: string }) => r.title === 'Oil change');
    expect(oil).toMatchObject({ cost: 89_990, odometer: 84_500, notes: 'Shop: Jiffy' });
    const first = records.find((r: { date: string }) => r.date === '2024-01-05');
    expect(first.fuel).toMatchObject({ volume: 15_200, pricePerUnit: 3_500 });
    expect(first.cost).toBe(53_200);

    // The upload is used up; send the file again and it matches the vehicles just created.
    expect(
      (
        await t.req({
          method: 'POST',
          url: `/api/v1/import/spreadsheet/${analysis.uploadId}/preview`,
          payload: { plan },
        })
      ).statusCode,
    ).toBe(410);
    const again: SpreadsheetAnalysis = (await upload(workbook, 'garage.xlsx')).json();
    expect(again.plan.vehicles.map((v) => v.existingVehicleId)).toEqual([taco.id, sled.id]);
    const second = (
      await t.req({
        method: 'POST',
        url: `/api/v1/import/spreadsheet/${again.uploadId}/commit`,
        payload: { plan: again.plan },
      })
    ).json();
    expect(second).toMatchObject({ imported: 0, skipped: 6 });
  });

  it('imports a CSV with a vehicle column', async () => {
    const csv = [
      'date,car,odometer,litres,cost,notes',
      '05/01/2024,2017 Mazda CX-5,"10.000",40,"72,40",',
      '25/01/2024,2017 Mazda CX-5,"10.600",38,"70,10",',
      '30/01/2024,2020 Kawasaki KX250,,,"55,00",',
    ].join('\n');
    const a: SpreadsheetAnalysis = (await upload(Buffer.from(csv), 'log.csv')).json();
    expect(a.plan.sheets[0]).toMatchObject({ vehicleColumn: 'car', dateOrder: 'dmy' });
    expect(a.plan.vehicles).toMatchObject([
      {
        make: 'Mazda',
        model: 'CX-5',
        year: 2017,
        odometerUnit: 'km',
        fuelUnit: 'l',
        fuelType: 'gasoline',
      },
      { make: 'Kawasaki', model: 'KX250', category: 'dirtbike' },
    ]);
    const res = (
      await t.req({
        method: 'POST',
        url: `/api/v1/import/spreadsheet/${a.uploadId}/commit`,
        payload: { plan: a.plan },
      })
    ).json();
    // A row in a fuel log with no fuel amount is reported, not guessed at.
    expect(res).toMatchObject({
      imported: 2,
      errors: [{ sheet: 'log', row: 4, message: 'fuel_volume' }],
    });
    const v = (await t.req({ method: 'GET', url: '/api/v1/vehicles' }))
      .json()
      .find((x: { model: string }) => x.model === 'CX-5');
    const fuel = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${v.id}/fuel-economy` })
    ).json();
    expect(fuel.fills[0]).toMatchObject({ odometer: 10_600 });
    const recs = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v.id}/records` })).json()
      .items;
    expect(recs.map((r: { cost: number }) => r.cost).sort()).toEqual([70_100, 72_400]);
  });

  it("converts a sheet's units to an existing vehicle's, and won't mix hours with miles", async () => {
    for (const v of [
      {
        year: 2012,
        make: 'Volvo',
        model: 'V70',
        odometerUnit: 'km',
        fuelUnit: 'l',
        fuelType: 'gasoline',
      },
      {
        year: 2019,
        make: 'Yamaha',
        model: 'YZ250F',
        category: 'dirtbike',
        odometerUnit: 'hr',
        fuelUnit: 'l',
        fuelType: 'gasoline',
      },
    ])
      expect(
        (await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: v })).json(),
      ).toMatchObject({ make: v.make });
    const csv = [
      'Date,Vehicle,Miles,Gallons,Total',
      '2024-03-01,2012 Volvo V70,1000,10,40',
      '2024-03-02,2019 Yamaha YZ250F,50,1,4',
    ].join('\n');
    const a: SpreadsheetAnalysis = (await upload(Buffer.from(csv), 'units.csv')).json();
    expect(a.plan.vehicles.every((v) => v.existingVehicleId != null)).toBe(true);
    const res = (
      await t.req({
        method: 'POST',
        url: `/api/v1/import/spreadsheet/${a.uploadId}/commit`,
        payload: { plan: a.plan },
      })
    ).json();
    expect(res).toMatchObject({ imported: 1, errors: [{ row: 3, message: 'units' }] });
    const volvo = a.plan.vehicles.find((v) => v.model === 'V70')?.existingVehicleId;
    const fills = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${volvo}/fuel-economy` })
    ).json().fills;
    // 1000 mi → 1609 km, 10 US gal → 37.854 L, $4/gal → $1.057/L; the total is unchanged.
    expect(fills[0]).toMatchObject({ odometer: 1609, volume: 37_854, cost: 40_000 });
    expect(fills[0].pricePerUnit).toBeCloseTo(1057, -1);
  });

  it('only lets the uploader use an upload, and keeps viewers out', async () => {
    const a: SpreadsheetAnalysis = (await upload(workbook, 'garage.xlsx')).json();
    const other = await t.user('sam');
    expect(
      (
        await other.req({
          method: 'POST',
          url: `/api/v1/import/spreadsheet/${a.uploadId}/preview`,
          payload: { plan: a.plan },
        })
      ).statusCode,
    ).toBe(410);
    const viewer = await t.user('val', 'viewer');
    const { payload, headers } = multipartFile(
      'file',
      'g.xlsx',
      workbook,
      'application/octet-stream',
    );
    expect(
      (await viewer.req({ method: 'POST', url: '/api/v1/import/spreadsheet', payload, headers }))
        .statusCode,
    ).toBe(403);
  });

  it('rejects old .xls files and empty files', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect((await upload(ole, 'old.xls')).json().error).toMatchObject({
      code: 'unsupported_file',
      params: { reason: 'xls' },
    });
    expect((await upload(Buffer.from('\n\n'), 'empty.csv')).statusCode).toBe(400);
  });
});

describe('spreadsheet import with local AI', () => {
  let ai: ReturnType<typeof fakeAi>;
  let t2: TestApp;
  beforeAll(async () => {
    ai = fakeAi((prompt) => {
      // The model sees the real headers and returns a plan; here it fixes the vehicle details
      // and also tries a column that doesn't exist, which must be ignored.
      const base = JSON.parse(prompt.user.split('improve it): ')[1] ?? '{}') as SpreadsheetPlan;
      return {
        sheets: base.sheets.map((s) => ({
          ...s,
          columns: { ...s.columns, station: 'Gas station that is not a header' },
        })),
        vehicles: base.vehicles.map((v) => ({
          ...v,
          year: 2015,
          trim: 'SR5',
          existingVehicleId: 999,
        })),
      };
    });
    t2 = await createTestApp({}, { ai });
  });
  afterAll(() => t2.close());

  it('refines the plan, checked against the real file', async () => {
    const { payload, headers } = multipartFile(
      'file',
      'garage.xlsx',
      workbook,
      'application/octet-stream',
    );
    const a: SpreadsheetAnalysis = (
      await t2.req({ method: 'POST', url: '/api/v1/import/spreadsheet?ai=true', payload, headers })
    ).json();
    expect(a.planSource).toBe('ai');
    expect(ai.calls[0]?.user).toContain('Price/gal');
    expect(a.plan.vehicles[0]).toMatchObject({
      key: 'Tacoma',
      year: 2015,
      trim: 'SR5',
      existingVehicleId: null,
    });
    expect(a.plan.sheets[0]?.columns.station).toBeNull();
  });

  it('falls back to the matcher when the model fails', async () => {
    const broken = await createTestApp(
      {},
      {
        ai: fakeAi(() => {
          throw Object.assign(new Error('down'), {});
        }),
      },
    );
    const { payload, headers } = multipartFile(
      'file',
      'garage.xlsx',
      workbook,
      'application/octet-stream',
    );
    const a = (
      await broken.req({
        method: 'POST',
        url: '/api/v1/import/spreadsheet?ai=true',
        payload,
        headers,
      })
    ).json();
    expect(a).toMatchObject({ planSource: 'matcher', aiError: 'error' });
    await broken.close();
  });
});
