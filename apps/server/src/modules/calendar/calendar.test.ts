import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ BASE_URL: 'https://garage.example.com' });
});
afterAll(() => t.close());
// With BASE_URL set, writes must come from that origin.
const origin = { origin: 'https://garage.example.com' };
const post = (url: string) => t.req({ method: 'POST', url, headers: origin });

describe('calendar feed', () => {
  it('is off until you create a link', async () => {
    expect((await t.req({ method: 'GET', url: '/api/v1/me/calendar' })).json()).toEqual({
      url: null,
    });
  });

  it('serves reminders with due dates as all-day events', async () => {
    const v = (
      await t.req({
        method: 'POST',
        headers: origin,
        url: '/api/v1/vehicles',
        payload: {
          year: 2015,
          make: 'Toyota',
          model: 'Tacoma',
          nickname: 'Taco',
          odometerUnit: 'mi',
          fuelUnit: 'gal_us',
          fuelType: 'gasoline',
        },
      })
    ).json();
    await t.req({
      method: 'POST',
      headers: origin,
      url: `/api/v1/vehicles/${v.id}/reminders`,
      payload: {
        title: 'Registration; renewal, county',
        dueMode: 'date',
        dueDate: '2027-03-31',
        notes: 'Bring proof of insurance',
      },
    });
    await t.req({
      method: 'POST',
      headers: origin,
      url: `/api/v1/vehicles/${v.id}/reminders`,
      payload: { title: 'Oil change', dueMode: 'distance', dueOdometer: 90_000 },
    });
    const { url } = (await post('/api/v1/me/calendar')).json();
    expect(url).toMatch(/^https:\/\/garage\.example\.com\/calendar\/[\w-]{20,}\.ics$/);

    // No session needed: calendar apps subscribe with the link alone.
    const res = await t.app.inject({ method: 'GET', url: new URL(url).pathname });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    const body = res.body;
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body).toContain('X-WR-CALNAME:Axlebook reminders');
    expect(body).toContain('DTSTART;VALUE=DATE:20270331\r\nDTEND;VALUE=DATE:20270401');
    expect(body).toContain('SUMMARY:Registration\\; renewal\\, county (Taco)');
    expect(body).toContain('DESCRIPTION:Bring proof of insurance');
    // Distance-only reminders have no date to show.
    expect(body).not.toContain('Oil change');
    for (const line of body.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

    // A new link replaces the old one; turning it off stops it.
    const next = (await post('/api/v1/me/calendar')).json().url;
    expect((await t.app.inject({ method: 'GET', url: new URL(url).pathname })).statusCode).toBe(
      404,
    );
    expect((await t.app.inject({ method: 'GET', url: new URL(next).pathname })).statusCode).toBe(
      200,
    );
    await t.req({ method: 'DELETE', url: '/api/v1/me/calendar', headers: origin });
    expect((await t.app.inject({ method: 'GET', url: new URL(next).pathname })).statusCode).toBe(
      404,
    );
  });

  it("doesn't answer short or guessed tokens", async () => {
    expect((await t.app.inject({ method: 'GET', url: '/calendar/abc.ics' })).statusCode).toBe(404);
  });
});
