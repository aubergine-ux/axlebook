import { describe, expect, it } from 'vitest';
import { makeXlsx } from '../../test/xlsx';
import { applyPlan, numberStyle, parseNumber, parseOdometer } from './apply';
import {
  detectDateOrder,
  fuelUnitFrom,
  kindOf,
  matchColumns,
  matchPlan,
  odometerUnitFrom,
  type PlanOptions,
  vehicleWordsIn,
} from './plan';
import { parseVehicleText } from './vehicle-text';
import { detectHeaderRow, headersOf, parseAnyDate, readWorkbook } from './workbook';

const opts = (over: Partial<PlanOptions> = {}): PlanOptions => ({
  fileName: 'cars.xlsx',
  existing: [],
  defaultUnits: { odometerUnit: 'mi', fuelUnit: 'gal_us', dateOrder: 'mdy' },
  ...over,
});

describe('vehicle names', () => {
  it.each([
    [
      '2015 Toyota Tacoma SR5',
      { year: 2015, make: 'Toyota', model: 'Tacoma', trim: 'SR5', category: 'car' },
    ],
    ['2018 Civic', { year: 2018, make: 'Honda', model: 'Civic', category: 'car' }],
    [
      "Wife's 2019 Honda CR-V",
      { year: 2019, make: 'Honda', model: 'CR-V', nickname: 'Wife', category: 'car' },
    ],
    ['Chevy Silverado 2500 Duramax', { make: 'Chevrolet', model: 'Silverado', fuelType: 'diesel' }],
    ['2021 Jeep Grand Cherokee', { make: 'Jeep', model: 'Grand Cherokee' }],
    ['Tesla Model 3', { make: 'Tesla', model: 'Model 3', fuelType: 'electric' }],
    [
      '2022 Harley-Davidson Road Glide',
      { make: 'Harley-Davidson', model: 'Road Glide', category: 'motorcycle' },
    ],
    ['2020 Honda CRF450R', { make: 'Honda', model: 'CRF450R', category: 'dirtbike' }],
    ['KTM 300 XC', { make: 'KTM', category: 'dirtbike' }],
    ['KTM 390 Duke', { make: 'KTM', category: 'motorcycle' }],
    ['Polaris RZR XP 1000', { make: 'Polaris', model: 'RZR', category: 'atv' }],
    [
      '2019 Ski-Doo Summit 850',
      { year: 2019, make: 'Ski-Doo', model: 'Summit', category: 'snowmobile' },
    ],
    ['Polaris Pro RMK', { make: 'Polaris', category: 'snowmobile' }],
    ["'19 Yamaha Grizzly", { year: 2019, make: 'Yamaha', model: 'Grizzly', category: 'atv' }],
    [
      'Truck 42 - 2020 Peterbilt 579',
      {
        year: 2020,
        make: 'Peterbilt',
        model: '579',
        nickname: 'Truck 42',
        category: 'semi',
        fuelType: 'diesel',
      },
    ],
    ['Freightliner Cascadia', { make: 'Freightliner', model: 'Cascadia', category: 'semi' }],
    ['Volvo VNL 860', { make: 'Volvo', category: 'semi' }],
    ['Volvo XC90', { make: 'Volvo', category: 'car' }],
    ['Great Dane reefer', { make: 'Great Dane', category: 'trailer' }],
    ['Old Blue', { make: null, model: null, nickname: 'Old Blue', category: 'car' }],
    ['the dirt bike', { make: null, category: 'dirtbike' }],
    [
      'Daily (2018 Honda Civic EX)',
      { year: 2018, make: 'Honda', model: 'Civic', trim: 'EX', nickname: 'Daily' },
    ],
  ])('%s', (text, expected) => {
    expect(parseVehicleText(text)).toMatchObject(expected);
  });
});

describe('columns', () => {
  it('maps common headers, price-per-unit before volume and cost', () => {
    expect(
      matchColumns([
        'Date',
        'Car',
        'Odometer (mi)',
        'Gallons',
        'Price/gal',
        'Total $',
        'Station',
        'Full?',
        'MPG',
        'Notes',
      ]),
    ).toEqual({
      date: 'Date',
      vehicle: 'Car',
      odometer: 'Odometer (mi)',
      fuelVolume: 'Gallons',
      pricePerUnit: 'Price/gal',
      cost: 'Total $',
      station: 'Station',
      isFull: 'Full?',
      notes: 'Notes',
    });
  });

  it("doesn't take trip distance or averages for the odometer or cost", () => {
    const m = matchColumns([
      'When',
      'Miles driven',
      'Mileage',
      'Avg cost per mile',
      'Amount',
      'Work done',
    ]);
    expect(m.odometer).toBe('Mileage');
    expect(m.cost).toBe('Amount');
    expect(m.title).toBe('Work done');
  });

  it('reads units from headers', () => {
    expect(odometerUnitFrom('Odometer (km)')).toBe('km');
    expect(odometerUnitFrom('Engine hours')).toBe('hr');
    expect(odometerUnitFrom('Hours')).toBe('hr');
    expect(odometerUnitFrom('Mileage')).toBe('mi');
    expect(fuelUnitFrom('Litres')).toBe('l');
    expect(fuelUnitFrom('kWh added')).toBe('kwh');
    expect(fuelUnitFrom('Imp gal')).toBe('gal_uk');
    expect(fuelUnitFrom(null, '€/L')).toBe('l');
  });

  it('finds the header row under a title block', () => {
    const rows = [
      ['My fuel log 2024'],
      ['', ''],
      ['Date', 'Odometer', 'Gallons'],
      ['1/2/2024', '1000', '10'],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
    expect(headersOf([['Notes', '', 'Notes']], 0)).toEqual(['Notes', 'Column 2', 'Notes (2)']);
  });

  it('pulls the vehicle out of sheet and file names', () => {
    expect(vehicleWordsIn('Tacoma Fuel Log')).toBe('Tacoma');
    expect(vehicleWordsIn('Fuel')).toBeNull();
    expect(vehicleWordsIn('civic-maintenance-records.csv')).toBe('civic');
    expect(vehicleWordsIn('Sheet1')).toBeNull();
  });

  it('turns kind words into record kinds', () => {
    expect(kindOf('Gas')).toBe('fuel');
    expect(kindOf('Oil change')).toBe('service');
    expect(kindOf('Insurance')).toBe('expense');
    expect(kindOf('Lift kit install')).toBe('upgrade');
    expect(kindOf('Fixed AC leak')).toBe('repair');
    expect(kindOf('???')).toBeNull();
  });
});

describe('values', () => {
  it('parses money in either decimal style', () => {
    expect(parseNumber('$1,234.56')).toBe(1234.56);
    expect(parseNumber('1.234,56', 'comma')).toBe(1234.56);
    expect(parseNumber('12,5', 'comma')).toBe(12.5);
    expect(parseNumber('(45.00)')).toBe(-45);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber('abc')).toBeUndefined();
    expect(numberStyle(['12,50', '9,99', '1.234,00'])).toBe('comma');
    expect(numberStyle(['$1,234', '12.50'])).toBe('dot');
  });

  it('parses odometers with thousands separators', () => {
    expect(parseOdometer('84,100')).toBe(84_100);
    expect(parseOdometer('84.100')).toBe(84_100);
    expect(parseOdometer('84 100 km')).toBe(84_100);
    expect(parseOdometer('1234.6')).toBe(1235);
    expect(parseOdometer('')).toBeNull();
    expect(parseOdometer('lots')).toBeUndefined();
    expect(parseOdometer('—')).toBeNull();
  });

  it('parses dates in the forms people type', () => {
    expect(parseAnyDate('2024-03-05', 'mdy')).toBe('2024-03-05');
    expect(parseAnyDate('3/5/2024', 'mdy')).toBe('2024-03-05');
    expect(parseAnyDate('3/5/2024', 'dmy')).toBe('2024-05-03');
    expect(parseAnyDate('Jan 5, 2024', 'mdy')).toBe('2024-01-05');
    expect(parseAnyDate('5th January 2024', 'dmy')).toBe('2024-01-05');
    expect(parseAnyDate('45292', 'mdy')).toBe('2024-01-01');
    expect(parseAnyDate('soon', 'mdy')).toBeNull();
    expect(parseAnyDate('Prices are from Oct 30, 2026, before shipping', 'mdy')).toBeNull();
    expect(detectDateOrder(['1/2/2024', '25/2/2024'], 'mdy')).toBe('dmy');
    expect(detectDateOrder(['1/2/2024', '2/25/2024'], 'dmy')).toBe('mdy');
  });
});

describe('plans', () => {
  const sheets = [
    {
      name: 'Log',
      rows: [
        ['Date', 'Vehicle', 'Type', 'Odometer', 'Gallons', 'Total', 'Description', 'Shop'],
        ['1/5/2024', '2015 Toyota Tacoma', 'Gas', '84,100', '15.2', '$53.20', '', ''],
        ['1/9/2024', '2018 Honda Civic', 'Gas', '40,000', '9.1', '$31.85', '', ''],
        [
          '2/1/2024',
          '2015 Toyota Tacoma',
          'Maintenance',
          '84,500',
          '',
          '$89.99',
          'Oil change',
          'Jiffy',
        ],
        ['', '', 'Insurance', '', '', '$600', '', ''],
        ['3/1/2024', '', 'Insurance', '', '', '$600', '6-month premium', ''],
        ['TOTAL', '', '', '', '', '$1,374.04', '', ''],
      ],
    },
    {
      name: 'Summary',
      rows: [
        ['Vehicle', 'Spent'],
        ['Tacoma', '700'],
      ],
    },
  ];

  it('works out one sheet holding several vehicles', () => {
    const plan = matchPlan(sheets, opts());
    const log = plan.sheets[0];
    expect(log).toMatchObject({
      include: true,
      vehicleColumn: 'Vehicle',
      kindColumn: 'Type',
      dateOrder: 'mdy',
    });
    expect(log?.extraNoteColumns).toEqual(['Shop']);
    expect(plan.sheets[1]?.include).toBe(false);
    expect(plan.vehicles.map((v) => [v.key, v.make, v.model, v.year])).toEqual([
      ['2015 Toyota Tacoma', 'Toyota', 'Tacoma', 2015],
      ['2018 Honda Civic', 'Honda', 'Civic', 2018],
    ]);

    const { rows } = applyPlan(sheets, plan, 'cars.xlsx');
    expect(
      rows.filter((r) => r.input).map((r) => [r.key, r.input?.kind, r.input?.date, r.input?.cost]),
    ).toEqual([
      ['2015 Toyota Tacoma', 'fuel', '2024-01-05', 53_200],
      ['2018 Honda Civic', 'fuel', '2024-01-09', 31_850],
      ['2015 Toyota Tacoma', 'service', '2024-02-01', 89_990],
      // A blank vehicle cell carries the one above it down.
      ['2015 Toyota Tacoma', 'expense', '2024-03-01', 600_000],
    ]);
    const fuel = rows[0]?.input?.fuel;
    expect(fuel).toMatchObject({ volume: 15_200, pricePerUnit: 3_500, isFull: true });
    expect(rows[2]?.input).toMatchObject({
      title: 'Oil change',
      notes: 'Shop: Jiffy',
      odometer: 84_500,
    });
    expect(rows[4]?.input).toMatchObject({
      expenseCategory: 'insurance',
      title: '6-month premium',
    });
    expect(rows[3]?.error).toBe('date_missing');
    expect(rows[5]?.skip).toBe(true);
  });

  it('uses one sheet per vehicle, with log words stripped from the name', () => {
    const wb = [
      {
        name: 'Tacoma Fuel',
        rows: [
          ['Date', 'Odometer (km)', 'Litres', 'Cost'],
          ['05/01/2024', '1000', '50', '90'],
        ],
      },
      {
        name: 'Tacoma Service',
        rows: [
          ['Date', 'Odometer (km)', 'Work', 'Cost'],
          ['20/01/2024', '1500', 'Oil', '80'],
        ],
      },
    ];
    const plan = matchPlan(wb, opts());
    expect(plan.sheets.map((s) => s.defaultKind)).toEqual(['fuel', 'service']);
    expect(plan.vehicles).toHaveLength(1);
    expect(plan.vehicles[0]).toMatchObject({
      key: 'Tacoma',
      make: 'Toyota',
      odometerUnit: 'km',
      fuelUnit: 'l',
    });
    expect(plan.sheets[1]?.dateOrder).toBe('dmy');
  });

  it('reads a dashboard-style sheet: title, stats strip, log, totals, then a second table', () => {
    const wb = [
      {
        name: 'Garage',
        rows: [
          ['', 'GARAGE', ''],
          ['', 'VEHICLES', 'RECORDS', 'TOTAL SPENT', 'LAST SERVICE'],
          ['', '1', '3', '140', '2024-03-01'],
          ['', 'LAST SERVICE', 'ODOMETER', 'VEHICLE', 'SPENT'],
          ['', '2024-03-01', '84500', '2015 TOYOTA TACOMA', '140'],
        ],
      },
      {
        name: 'Tacoma',
        rows: [
          ['', '2015 TOYOTA TACOMA SR5', '', '', '', ''],
          ['', 'NICKNAME  OLD BLUE    ·    PLATE  ABC-123    ·    VIN  —', '', '', '', ''],
          ['', 'ODOMETER', 'MILES TRACKED', 'RECORDS', 'TOTAL SPENT', 'LAST SERVICE'],
          ['', '84500', '500', '3', '140', '2024-03-01'],
          ['', 'DATE', 'TYPE', 'ODOMETER', 'SERVICE', 'COST'],
          ['', '2024-01-05', 'SERVICE', '84000', 'OIL CHANGE', '40'],
          ['', 'Feb 2, 2024', 'REPAIR', '—', 'WIPER MOTOR', '—'],
          ['', '2024-03-01', 'UPGRADE', '84500', 'LIGHT BAR', '100'],
          ['', '3', '', '', 'TOTAL', '140'],
          ['', 'Add new records above TOTAL; the Garage tab updates from Mar 1, 2024 on.'],
          ['', 'PENDING WORK'],
          ['', 'PRIORITY', 'STATUS', 'DEALER $', 'ITEM', 'PARTS COST'],
          ['', 'HIGH', 'TO ORDER', '600', 'BELTS', '33'],
        ],
      },
    ];
    const plan = matchPlan(wb, opts());
    expect(plan.sheets[0]?.include).toBe(false);
    expect(plan.sheets[1]).toMatchObject({ include: true, headerRow: 4, kindColumn: 'TYPE' });
    expect(plan.vehicles).toEqual([
      expect.objectContaining({
        key: '2015 Toyota Tacoma SR5 (Old Blue)',
        year: 2015,
        make: 'Toyota',
        model: 'Tacoma',
        trim: 'SR5',
        nickname: 'Old Blue',
      }),
    ]);
    const { rows } = applyPlan(wb, plan, 'garage.xlsx');
    expect(rows.filter((r) => r.error)).toEqual([]);
    expect(
      rows.filter((r) => r.input).map((r) => [r.input?.kind, r.input?.date, r.input?.odometer]),
    ).toEqual([
      ['service', '2024-01-05', 84_000],
      ['repair', '2024-02-02', null],
      ['upgrade', '2024-03-01', 84_500],
    ]);
  });

  it('finds the date column by its values when no header says "date"', () => {
    const wb = [
      {
        name: 'Civic',
        rows: [
          ['Done on', 'Next due', 'Miles', 'What', '$'],
          ['3/1/2024', '9/1/2024', '40000', 'Oil', '45'],
          ['4/2/2024', '10/2/2024', '41000', 'Tires', '600'],
        ],
      },
    ];
    const plan = matchPlan(wb, opts());
    expect(plan.sheets[0]).toMatchObject({ include: true });
    expect(plan.sheets[0]?.columns).toMatchObject({ date: 'Done on', odometer: 'Miles' });
    const { rows } = applyPlan(wb, plan, 'cars.xlsx');
    expect(rows.map((r) => r.input?.date)).toEqual(['2024-03-01', '2024-04-02']);
  });

  it('reports row numbers as the spreadsheet shows them, blank rows included', async () => {
    const rows = [
      ['Fuel log'],
      [],
      ['Date', 'Odometer', 'Cost'],
      ['1/5/2024', '1000', '40'],
      [],
      [],
      ['someday', '1200', '45'],
    ];
    const csv = Buffer.from(rows.map((r) => r.join(',')).join('\n'));
    for (const [name, file] of [
      ['log.xlsx', makeXlsx([{ name: 'Log', rows }])],
      ['log.csv', csv],
    ] as const) {
      const wb = await readWorkbook(name, file);
      const plan = matchPlan(wb, opts());
      const out = applyPlan(wb, plan, name).rows;
      expect(out.map((r) => [r.row, r.error ?? null])).toEqual([
        [4, null],
        [7, 'date'],
      ]);
    }
  });

  it('matches existing vehicles by nickname or model', () => {
    const existing = [
      {
        id: 7,
        year: 2015,
        make: 'Toyota',
        model: 'Tacoma',
        trim: null as string | null,
        nickname: 'Taco',
        unitNumber: null,
        vin: null,
        category: 'car' as const,
        odometerUnit: 'mi' as const,
        fuelUnit: 'gal_us' as const,
        fuelType: 'gasoline' as const,
      },
    ];
    const wb = [
      {
        name: 'Taco',
        rows: [
          ['Date', 'Odometer', 'Gallons'],
          ['1/1/2024', '1', '10'],
        ],
      },
    ];
    expect(matchPlan(wb, opts({ existing })).vehicles[0]?.existingVehicleId).toBe(7);
    const wb2 = [{ name: '2015 Tacoma', rows: wb[0]?.rows ?? [] }];
    expect(matchPlan(wb2, opts({ existing })).vehicles[0]?.existingVehicleId).toBe(7);
    // A different trim is a different truck.
    const sr5 = existing.map((v) => ({ ...v, trim: 'SR5' }));
    const trd = [{ name: '2015 Toyota Tacoma TRD Pro', rows: wb[0]?.rows ?? [] }];
    expect(matchPlan(trd, opts({ existing: sr5 })).vehicles[0]?.existingVehicleId).toBeNull();
    const sr5Key = [{ name: '2015 Toyota Tacoma SR5', rows: wb[0]?.rows ?? [] }];
    expect(matchPlan(sr5Key, opts({ existing: sr5 })).vehicles[0]?.existingVehicleId).toBe(7);
  });

  it('reads engine-hour logs and kWh charging logs', () => {
    const wb = [
      {
        name: 'Grizzly',
        rows: [
          ['Date', 'Hours', 'Service'],
          ['1/1/2024', '120.5', 'Oil'],
        ],
      },
      {
        name: 'Model 3',
        rows: [
          ['Date', 'Odometer', 'kWh', 'Cost'],
          ['1/1/2024', '5000', '55', '8.25'],
        ],
      },
    ];
    const plan = matchPlan(wb, opts());
    expect(plan.vehicles.find((v) => v.key === 'Grizzly')).toMatchObject({
      odometerUnit: 'hr',
      category: 'atv',
    });
    expect(plan.vehicles.find((v) => v.key === 'Model 3')).toMatchObject({
      fuelUnit: 'kwh',
      fuelType: 'electric',
    });
    const rows = applyPlan(wb, plan, 'x.xlsx').rows;
    expect(rows[0]?.input).toMatchObject({ odometer: 121, kind: 'service' });
    expect(rows[1]?.input?.fuel).toMatchObject({ volume: 55_000, pricePerUnit: 150 });
  });
});
