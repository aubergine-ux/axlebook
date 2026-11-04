import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, fakeAi, type TestApp } from '../../test/helpers';

describe('without local AI', () => {
  let t: TestApp;
  let id: number;
  beforeAll(async () => {
    t = await createTestApp();
    id = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: {
          year: 2015,
          make: 'Toyota',
          model: 'Tacoma',
          odometerUnit: 'mi',
          fuelUnit: 'gal_us',
          fuelType: 'gasoline',
        },
      })
    ).json().id;
    const rec = (date: string, odometer: number, title: string) =>
      t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${id}/records`,
        payload: { kind: 'service', date, odometer, title, cost: 50_000 },
      });
    await rec('2026-01-10', 80_000, 'Oil change + rotate tires');
    await rec('2026-06-01', 84_000, 'Full synthetic oil and filter');
    await rec('2026-06-01', 84_000, 'Rear diff gear oil'); // must not count as an oil change
  });
  afterAll(() => t.close());

  it('reports AI as off', async () => {
    expect((await t.req({ method: 'GET', url: '/api/v1/ai/status' })).json()).toMatchObject({
      enabled: false,
    });
    expect(
      (await t.req({ method: 'POST', url: `/api/v1/vehicles/${id}/insights/mpg` })).json().error
        .code,
    ).toBe('ai_disabled');
    expect(
      (await t.req({ method: 'POST', url: `/api/v1/vehicles/${id}/schedule/tailor` })).statusCode,
    ).toBe(503);
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/insights/mpg` })).json(),
    ).toBeNull();
  });

  it('gives the built-in schedule with last done and next due', async () => {
    const s = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/schedule` })).json();
    expect(s.source).toBe('builtin');
    const oil = s.items.find((i: { title: string }) => i.title === 'Oil and filter change');
    expect(oil).toMatchObject({
      intervalMonths: 6,
      intervalDistance: 5000,
      lastDone: { date: '2026-06-01', odometer: 84_000 },
      nextDueDate: '2026-12-01',
      nextDueOdometer: 89_000,
      hasReminder: false,
    });
    expect(
      s.items.find((i: { title: string }) => i.title === 'Tire rotation').lastDone,
    ).toMatchObject({ date: '2026-01-10' });
    expect(
      s.items.find((i: { title: string }) => i.title === 'Cabin air filter').lastDone,
    ).toBeNull();
  });

  it('turns schedule items into reminders, once', async () => {
    const items = [
      { title: 'Oil and filter change', intervalMonths: 6, intervalDistance: 5000, notes: null },
      { title: 'Wiper blades', intervalMonths: 12, intervalDistance: null, notes: null },
      { title: 'My own item', intervalMonths: 3, intervalDistance: 3000, notes: 'custom' },
    ];
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${id}/schedule/apply`,
      payload: { items },
    });
    expect(res.json()).toEqual({ created: 3 });
    const rems = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/reminders` })).json();
    const oil = rems.find((r: { title: string }) => r.title === 'Oil and filter change');
    expect(oil).toMatchObject({
      dueMode: 'either',
      dueDate: '2026-12-01',
      dueOdometer: 89_000,
      intervalMonths: 6,
      intervalDistance: 5000,
    });
    // Not on the shown schedule: due from the current reading.
    expect(rems.find((r: { title: string }) => r.title === 'My own item')).toMatchObject({
      dueMode: 'either',
      dueOdometer: 87_000,
    });
    expect(rems.find((r: { title: string }) => r.title === 'Wiper blades')).toMatchObject({
      dueMode: 'date',
      dueOdometer: null,
    });
    expect(
      (
        await t.req({
          method: 'POST',
          url: `/api/v1/vehicles/${id}/schedule/apply`,
          payload: { items },
        })
      ).json(),
    ).toEqual({ created: 0 });
    const s = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/schedule` })).json();
    expect(
      s.items.find((i: { title: string }) => i.title === 'Oil and filter change').hasReminder,
    ).toBe(true);
  });

  it('gives data tips without AI', async () => {
    const tips = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/tips` })).json();
    expect(tips.aiGeneratedAt).toBeNull();
    expect(tips.tips.length).toBeGreaterThan(0);
    expect(
      tips.tips.every(
        (x: { source: string; code: string | null }) => x.source === 'data' && x.code,
      ),
    ).toBe(true);
    expect(tips.tips.map((x: { code: string }) => x.code)).toContain('no_fuel_data');
  });

  it('keeps viewers from changing anything', async () => {
    const viewer = await t.user('vic', 'viewer');
    expect(
      (await viewer.req({ method: 'GET', url: `/api/v1/vehicles/${id}/schedule` })).statusCode,
    ).toBe(404);
  });
});

describe('with local AI', () => {
  let t: TestApp;
  let id: number;
  const ai = fakeAi(({ system }) => {
    if (system.includes('service advisor'))
      return {
        basis: 'Toyota 2015 Tacoma maintenance guide, normal conditions',
        items: [
          {
            title: 'Oil and filter change',
            intervalMonths: 6,
            intervalDistance: 5000,
            notes: 'Toyota calls for 0W-20 synthetic',
            lastRecordId: null,
          },
          {
            title: 'Front differential fluid',
            intervalMonths: null,
            intervalDistance: 30_000,
            notes: null,
            lastRecordId: 999_999,
          },
          {
            title: 'Tire rotation',
            intervalMonths: 6,
            intervalDistance: 5000,
            notes: null,
            lastRecordId: null,
          },
          {
            title: '',
            intervalMonths: null,
            intervalDistance: null,
            notes: null,
            lastRecordId: null,
          },
        ],
      };
    if (system.includes('estimate real-world fuel economy'))
      return {
        combined: 19,
        low: 17,
        high: 21,
        city: 18,
        highway: 22,
        confidence: 'medium',
        factors: ['4WD', 'Age'],
        summary: 'Typical for a V6 Tacoma.',
      };
    return {
      tips: [
        {
          title: 'Check the frame for rust',
          body: 'Second-gen Tacomas had frame rust recalls.',
          severity: 'warning',
        },
        {
          title: 'Keep tires at 29 psi',
          body: 'The door placard pressure gives the best economy.',
          severity: 'suggestion',
        },
      ],
    };
  });
  beforeAll(async () => {
    t = await createTestApp({}, { ai });
    id = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: {
          year: 2015,
          make: 'Toyota',
          model: 'Tacoma',
          odometerUnit: 'mi',
          fuelUnit: 'gal_us',
          fuelType: 'gasoline',
        },
      })
    ).json().id;
    const fill = (date: string, odometer: number, volume: number) =>
      t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${id}/records`,
        payload: { kind: 'fuel', date, odometer, cost: 50_000, fuel: { volume, isFull: true } },
      });
    await fill('2026-01-01', 10_000, 15_000);
    await fill('2026-01-15', 10_300, 15_000);
    await fill('2026-02-01', 10_600, 15_000);
  });
  afterAll(() => t.close());

  it('estimates MPG and compares it with the real figure', async () => {
    const res = await t.req({ method: 'POST', url: `/api/v1/vehicles/${id}/insights/mpg` });
    expect(res.statusCode).toBe(200);
    const est = res.json();
    expect(est).toMatchObject({ combined: 19, actual: 20, model: 'fake:1b' });
    expect(est.difference).toBeCloseTo(20 / 19 - 1);
    expect(ai.calls.at(-1)?.user).toContain('2015 Toyota Tacoma');
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/insights/mpg` })).json(),
    ).toMatchObject({ combined: 19 });
  });

  it('tailors the schedule, dropping blank items and unknown record ids', async () => {
    const s = (
      await t.req({ method: 'POST', url: `/api/v1/vehicles/${id}/schedule/tailor` })
    ).json();
    expect(s).toMatchObject({
      source: 'ai',
      basis: expect.stringContaining('Toyota'),
      model: 'fake:1b',
    });
    expect(s.items.map((i: { title: string }) => i.title)).toEqual([
      'Oil and filter change',
      'Front differential fluid',
      'Tire rotation',
    ]);
    expect(s.items[1].lastDone).toBeNull();
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/schedule` })).json().source,
    ).toBe('ai');
  });

  it('adds model-specific tips to the data tips', async () => {
    const res = (await t.req({ method: 'POST', url: `/api/v1/vehicles/${id}/tips/ai` })).json();
    const ai = res.tips.filter((x: { source: string }) => x.source === 'ai');
    expect(ai.map((x: { title: string }) => x.title)).toEqual([
      'Check the frame for rust',
      'Keep tires at 29 psi',
    ]);
    expect(res.tips.some((x: { source: string }) => x.source === 'data')).toBe(true);
    const again = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/tips` })).json();
    expect(again.aiGeneratedAt).toBeTruthy();
    expect(again.tips.filter((x: { source: string }) => x.source === 'ai')).toHaveLength(2);
  });
});
