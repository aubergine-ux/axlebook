import { addDays, today } from '@axlebook/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
const now = today('UTC');

describe('garage status for integrations', () => {
  it('is an empty list for an empty garage', async () => {
    const s = (await t.req({ method: 'GET', url: '/api/v1/status' })).json();
    expect(s).toMatchObject({ currency: 'USD', vehicles: [] });
    expect(s.version).toEqual(expect.any(String));
  });

  it('gives each vehicle its odometer, next service and what needs attention', async () => {
    const quiet = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Quiet' }),
      })
    ).json().id;
    const busy = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Busy' }),
      })
    ).json().id;
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${busy}/records`,
      payload: { kind: 'service', date: now, odometer: 84_000, title: 'Oil', cost: 60_000 },
    });
    for (const r of [
      { title: 'Rotate tires', dueMode: 'distance', dueOdometer: 83_500 },
      { title: 'Inspection', dueMode: 'date', dueDate: addDays(now, 10) },
      { title: 'Coolant', dueMode: 'date', dueDate: addDays(now, 400) },
    ])
      await t.req({ method: 'POST', url: `/api/v1/vehicles/${busy}/reminders`, payload: r });
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${busy}/documents`,
      payload: { type: 'insurance', title: 'Insurance', expiresOn: addDays(now, -1) },
    });
    const ts = new Date().toISOString();
    await t.db
      .insertInto('recalls')
      .values([
        { vehicle_id: busy, campaign: 'A', state: 'open', created_at: ts, updated_at: ts },
        { vehicle_id: busy, campaign: 'B', state: 'completed', created_at: ts, updated_at: ts },
      ])
      .execute();
    const archived = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Sold' }),
      })
    ).json().id;
    await t.req({ method: 'POST', url: `/api/v1/vehicles/${archived}/archive` });

    const { vehicles } = (await t.req({ method: 'GET', url: '/api/v1/status' })).json();
    const by = (name: string) => vehicles.find((v: { name: string }) => v.name === name);
    expect(vehicles.map((v: { name: string }) => v.name).sort()).toEqual(['Busy', 'Quiet']);
    expect(by('Quiet')).toEqual({
      id: quiet,
      name: 'Quiet',
      category: 'car',
      odometer: null,
      odometerUnit: 'mi',
      nextService: null,
      overdue: 0,
      dueSoon: 0,
      documentsExpiring: 0,
      openRecalls: 0,
      needsAttention: false,
      costToDate: 0,
    });
    expect(by('Busy')).toEqual({
      id: busy,
      name: 'Busy',
      category: 'car',
      odometer: 84_000,
      odometerUnit: 'mi',
      // The most urgent one: 500 mi past due, so due today.
      nextService: {
        title: 'Rotate tires',
        status: 'overdue',
        dueDate: now,
        daysLeft: null,
        distanceLeft: -500,
      },
      overdue: 1,
      dueSoon: 1,
      documentsExpiring: 1,
      openRecalls: 1,
      needsAttention: true,
      costToDate: 60_000,
    });
  });

  it('works with an API token, and shows each person only their own garage', async () => {
    const token = (
      await t.req({ method: 'POST', url: '/api/v1/me/tokens', payload: { name: 'Home Assistant' } })
    ).json().token;
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().vehicles).toHaveLength(2);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/status' })).statusCode).toBe(401);
    const other = await t.user('neighbour');
    expect((await other.req({ method: 'GET', url: '/api/v1/status' })).json().vehicles).toEqual([]);
  });
});
