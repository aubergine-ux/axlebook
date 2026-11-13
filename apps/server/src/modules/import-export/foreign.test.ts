import { describe, expect, it } from 'vitest';
import { readForeign } from './foreign';
import { rowsToRecords } from './parse';

const records = (text: string) => {
  const f = readForeign(text);
  if (!f) throw new Error('not recognized');
  const { parsed, format } = rowsToRecords(f.rows, {
    kind: 'service',
    dateOrder: 'mdy',
    format: f.format,
    lines: f.lines,
  });
  return { f, parsed, format };
};

describe('readForeign', () => {
  it('leaves Axlebook, LubeLogger and unknown files alone', () => {
    expect(readForeign('date,odometer,kind,title,cost\n2024-01-01,1,service,Oil,5\n')).toBeNull();
    expect(readForeign('Date,Odometer,FuelConsumed,Cost\n1/1/2024,1,1,1\n')).toBeNull();
    expect(readForeign('')).toBeNull();
  });

  it('reads a Fuelly fuel-up export: price is per unit, partial and missed are 1/0', () => {
    const { f, parsed, format } = records(
      'car_name,model,mpg,odometer,miles,gallons,price,city_percentage,fuelup_date,date_added,tags,notes,missed_fuelup,partial_fuelup,latitude,longitude,brand\n' +
        'Tacoma,Toyota Tacoma,19.4,61402,210,10.82,3.499,40,2024-01-15,2024-01-15,"commute, highway",Costco run,0,0,,,Costco\n' +
        'Tacoma,Toyota Tacoma,0,61612,210,5.1,3.50,40,1/29/24,2024-01-29,,,1,1,,,\n' +
        'Civic,Honda Civic,34,20100,300,8.8,3.20,10,2024-02-01,2024-02-01,,,0,0,,,Shell\n',
    );
    expect(format).toBe('fuelly');
    expect([...new Set(f.vehicles)]).toEqual(['Tacoma', 'Civic']);
    expect(parsed[0]?.input).toMatchObject({
      kind: 'fuel',
      date: '2024-01-15',
      odometer: 61402,
      cost: 37_860,
      notes: 'Costco run',
      tags: ['commute', 'highway'],
      fuel: {
        volume: 10_820,
        pricePerUnit: 3_499,
        isFull: true,
        missedPrevious: false,
        station: 'Costco',
      },
    });
    expect(parsed[1]?.input).toMatchObject({
      date: '2024-01-29',
      cost: 17_850,
      fuel: { isFull: false, missedPrevious: true },
    });
  });

  it('reads the metric Fuelly layout and a stated total', () => {
    const { parsed } = records(
      'car_name,odometer,km,litres,price,total_cost,fuelup_date,partial_fuelup,missed_fuelup\n' +
        'Golf,120500,600,42.5,1.799,76.46,2024-03-02,0,0\n',
    );
    expect(parsed[0]?.input).toMatchObject({
      cost: 76_460,
      fuel: { volume: 42_500, pricePerUnit: 1_799 },
    });
  });

  it('reads a Drivvo export section by section and keeps the file line of a bad row', () => {
    const { f, parsed, format } = records(
      [
        '##Refuelling',
        'Odometer,Date,Fuel,Price / L,Total cost,Volume,Filled tank completely,Second fuel,Volume,Gas station,Driver,Notes',
        '149878.0,2024-01-15 08:30:00,Gasoline,1.799,71.96,40.0,Yes,,,Shell Main St,Me,first',
        '150400.0,2024-01-29 18:02:11,Gasoline,1.80,36.00,20.0,No,,,,,',
        '',
        '##Service',
        'Odometer,Date,Total cost,Type of service,Service location,Notes',
        '150000.0,2024-01-20 10:00:00,89.50,Oil change,Quick Lube,0W-20',
        '150100.0,not a date,10,Wipers,,',
        '',
        '##Expense',
        'Odometer,Date,Total cost,Type of expense,Notes',
        '150050.0,2024-01-22 09:00:00,640.00,Car insurance,six months',
        '',
        '##Income',
        'Odometer,Date,Value,Type of income',
        '150060.0,2024-01-23 09:00:00,50,Ride share',
      ].join('\n'),
    );
    expect(format).toBe('drivvo');
    expect(f.vehicles.every((v) => v === '')).toBe(true);
    expect(parsed).toHaveLength(5); // income is not a logbook record
    expect(parsed[0]?.input).toMatchObject({
      kind: 'fuel',
      date: '2024-01-15',
      odometer: 149878,
      cost: 71_960,
      notes: 'first',
      fuel: {
        volume: 40_000,
        pricePerUnit: 1_799,
        isFull: true,
        grade: 'Gasoline',
        station: 'Shell Main St',
      },
    });
    expect(parsed[1]?.input?.fuel).toMatchObject({ isFull: false });
    expect(parsed[2]?.input).toMatchObject({
      kind: 'service',
      title: 'Oil change',
      cost: 89_500,
      odometer: 150000,
      notes: '0W-20',
    });
    expect(parsed[3]).toEqual({ row: 9, error: 'date' });
    expect(parsed[4]?.input).toMatchObject({
      kind: 'expense',
      title: 'Car insurance',
      expenseCategory: 'insurance',
      cost: 640_000,
    });
  });

  it('reads a Simply Auto Fuel_Log.csv: record types, split dates, inverted partial flag', () => {
    const head =
      'Row ID,Vehicle ID,Odometer,Qty,Partial Tank,Missed Fill Up,Total Cost,Distance Traveled,Eff,Octane,Fuel Brand,Filling Station,Notes,Day,Month,Year,Receipt Path,Record Type,Record Desc';
    const { f, parsed, format } = records(
      [
        head,
        '1,Truck,61402,10.82,0,0,37.86,0,0,87,Costco,Costco Elm St,,15,1,2024,,0,Fuel Record',
        '2,Truck,61612,5.1,1,1,17.85,0,0,,Shell,,,29,1,2024,,0,Fuel Record',
        '3,Truck,61800,0,0,0,64.18,0,0,,,,0W-20,1,2,2024,,1,"Engine Oil, Oil Filter"',
        '4,Bike,5000,0,0,0,120,0,0,,,,,3,2,2024,,2,Registration',
      ].join('\n'),
    );
    expect(format).toBe('simplyauto');
    expect(f.vehicles).toEqual(['Truck', 'Truck', 'Truck', 'Bike']);
    expect(parsed[0]?.input).toMatchObject({
      kind: 'fuel',
      date: '2024-01-15',
      cost: 37_860,
      fuel: { volume: 10_820, isFull: true, grade: '87', station: 'Costco Elm St' },
    });
    expect(parsed[1]?.input?.fuel).toMatchObject({
      isFull: false,
      missedPrevious: true,
      station: 'Shell',
    });
    expect(parsed[2]?.input).toMatchObject({
      kind: 'service',
      date: '2024-02-01',
      title: 'Engine Oil, Oil Filter',
      notes: '0W-20',
    });
    expect(parsed[3]?.input).toMatchObject({ kind: 'expense', expenseCategory: 'registration' });
  });

  it('shifts Simply Auto months when the file counts January as 0', () => {
    const { parsed } = records(
      'Vehicle ID,Odometer,Qty,Partial Tank,Total Cost,Day,Month,Year,Record Type,Record Desc\n' +
        'Truck,100,10,0,30,5,0,2024,0,Fuel Record\n' +
        'Truck,400,10,0,30,5,11,2024,0,Fuel Record\n',
    );
    expect(parsed.map((p) => p.input?.date)).toEqual(['2024-01-05', '2024-12-05']);
  });
});
