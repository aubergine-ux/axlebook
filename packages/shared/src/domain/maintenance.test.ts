import { describe, expect, it } from 'vitest';
import { VEHICLE_CATEGORIES } from '../schemas/vehicles';
import { MAINTENANCE_TEMPLATES, recordMatches, scheduleTemplate } from './maintenance';

describe('built-in maintenance schedules', () => {
  it('has a schedule for every vehicle type, each item with an interval', () => {
    for (const c of VEHICLE_CATEGORIES) {
      expect(MAINTENANCE_TEMPLATES[c].length).toBeGreaterThan(5);
      for (const i of MAINTENANCE_TEMPLATES[c]) expect(i.months ?? i.miles ?? i.hours).toBeTruthy();
    }
  });

  it('drops oil, plugs and air filters for EVs and adds diesel fuel filters', () => {
    const ev = scheduleTemplate({ category: 'car', odometerUnit: 'mi', fuelType: 'electric' }).map(
      (i) => i.id,
    );
    expect(ev).not.toContain('oil');
    expect(ev).not.toContain('plugs');
    expect(ev).toContain('rotation');
    const diesel = scheduleTemplate({
      category: 'car',
      odometerUnit: 'mi',
      fuelType: 'diesel',
    }).map((i) => i.id);
    expect(diesel).toContain('fuel-filter');
    expect(diesel).not.toContain('plugs');
  });

  it('uses round kilometre intervals and engine hours where the vehicle uses them', () => {
    const km = scheduleTemplate({ category: 'car', odometerUnit: 'km', fuelType: 'gasoline' });
    expect(km.find((i) => i.id === 'oil')?.intervalDistance).toBe(8000);
    expect(km.find((i) => i.id === 'transmission')?.intervalDistance).toBe(95000);
    const hours = scheduleTemplate({
      category: 'dirtbike',
      odometerUnit: 'hr',
      fuelType: 'gasoline',
    });
    expect(hours.find((i) => i.id === 'oil')?.intervalDistance).toBe(10);
    expect(hours.find((i) => i.id === 'top-end')?.intervalDistance).toBe(100);
    // Items with only a mileage interval disappear on an hour meter rather than being wrong.
    const sled = scheduleTemplate({
      category: 'snowmobile',
      odometerUnit: 'hr',
      fuelType: 'gasoline',
    });
    expect(sled.find((i) => i.id === 'chaincase')).toMatchObject({
      intervalMonths: 12,
      intervalDistance: null,
    });
  });

  it('matches records by keyword without confusing related jobs', () => {
    const [engineAir] = scheduleTemplate({
      category: 'car',
      odometerUnit: 'mi',
      fuelType: 'gasoline',
    }).filter((i) => i.id === 'engine-air');
    const [oil] = scheduleTemplate({
      category: 'car',
      odometerUnit: 'mi',
      fuelType: 'gasoline',
    }).filter((i) => i.id === 'oil');
    expect(recordMatches(engineAir as never, 'Engine air filter')).toBe(true);
    expect(recordMatches(engineAir as never, 'Cabin air filter')).toBe(false);
    expect(recordMatches(oil as never, 'Oil and filter change · maintenance')).toBe(true);
    expect(recordMatches(oil as never, 'Differential gear oil')).toBe(false);
  });
});
