import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { addDays, today } from '@axlebook/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
let server: http.Server;
let url: string;
const received: { path: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: JSON.parse(body || '{}') });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
  server.close();
});
beforeEach(() => {
  received.length = 0;
});

const day = today('UTC');
/** Today at the given UTC time (the test server's clock is UTC). */
const at = (clock: string) => new Date(`${day}T${clock}:00Z`);
const scan = (clock: string) => t.app.services.notifications.scan(at(clock));
const titles = () => received.map((r) => r.body.title);

async function vehicleWith(user: { req: TestApp['req'] }, nickname: string) {
  const v = (
    await user.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody({ nickname }) })
  ).json().id as number;
  return v;
}
const hook = (user: { req: TestApp['req'] }, path = '/hook') =>
  user.req({
    method: 'POST',
    url: '/api/v1/me/channels',
    payload: { name: 'Hook', config: { type: 'webhook', url: `${url}${path}` } },
  });
const overdue = (user: { req: TestApp['req'] }, v: number, title: string) =>
  user.req({
    method: 'POST',
    url: `/api/v1/vehicles/${v}/reminders`,
    payload: { title, dueMode: 'date', dueDate: addDays(day, -2) },
  });

describe('Apprise', () => {
  it('posts the title, body and type an Apprise API server expects', async () => {
    const ch = (
      await t.req({
        method: 'POST',
        url: '/api/v1/me/channels',
        payload: {
          name: 'Apprise',
          config: {
            type: 'apprise',
            url: `${url}/notify/garage`,
            urls: 'tgram://token/chat',
            tag: 'cars',
          },
        },
      })
    ).json();
    const res = (await t.req({ method: 'POST', url: `/api/v1/me/channels/${ch.id}/test` })).json();
    expect(res.lastResult).toMatchObject({ status: 'sent' });
    expect(received[0]).toEqual({
      path: '/notify/garage',
      body: {
        title: 'Axlebook test notification',
        body: 'If you can read this, notifications from Axlebook are working.',
        type: 'info',
        urls: 'tgram://token/chat',
        tag: 'cars',
      },
    });
    await t.req({ method: 'DELETE', url: `/api/v1/me/channels/${ch.id}` });
  });
});

describe('quiet hours, muting, documents and the weekly digest', () => {
  it('holds messages during quiet hours and sends them when they end', async () => {
    const night = await t.user('nightowl');
    await hook(night, '/night');
    const v = await vehicleWith(night, 'Van');
    const me = (
      await night.req({
        method: 'PATCH',
        url: '/api/v1/me',
        payload: { notify: { quietStart: '22:00', quietEnd: '07:00' } },
      })
    ).json();
    expect(me.notify).toMatchObject({ quietStart: '22:00', quietEnd: '07:00', digest: false });
    await overdue(night, v, 'Brake fluid');

    // 03:00 is inside quiet hours: nothing goes out, but it isn't lost.
    expect(await scan('03:00')).toEqual({ notified: 0 });
    expect(received).toEqual([]);
    // Still quiet at 06:59, and the reminder isn't announced a second time.
    expect(await scan('06:59')).toEqual({ notified: 0 });
    expect(received).toEqual([]);
    // 07:00: quiet hours are over and the held message arrives, once.
    expect(await scan('07:00')).toEqual({ notified: 1 });
    expect(titles()).toEqual(['Overdue: Brake fluid on the Van']);
    expect(received[0]?.body).toMatchObject({ event: 'reminder.status' });
    expect(await scan('09:00')).toEqual({ notified: 0 });
  });

  it('rejects quiet hours that are not times of day', async () => {
    for (const notify of [{ quietStart: '25:00' }, { quietEnd: '7am' }, { digestDay: 7 }])
      expect(
        (await t.req({ method: 'PATCH', url: '/api/v1/me', payload: { notify } })).statusCode,
      ).toBe(400);
  });

  it('leaves out a vehicle someone muted, for that person only', async () => {
    const owner = await t.user('fleetowner');
    const helper = await t.user('fleethelper');
    await hook(owner, '/owner');
    await hook(helper, '/helper');
    const v = await vehicleWith(owner, 'Loader');
    await owner.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v}/shares/${helper.user.id}`,
      payload: { permission: 'view' },
    });
    const mute = `/api/v1/vehicles/${v}/notifications`;
    expect((await helper.req({ method: 'GET', url: mute })).json()).toEqual({ muted: false });
    expect(
      (await helper.req({ method: 'PUT', url: mute, payload: { muted: true } })).json(),
    ).toEqual({ muted: true });
    // Muting twice is fine.
    await helper.req({ method: 'PUT', url: mute, payload: { muted: true } });
    await overdue(owner, v, 'Hydraulic filter');
    await scan('12:00');
    expect(received.map((r) => r.path)).toEqual(['/owner']);

    // Unmuted, the next escalation reaches both.
    await helper.req({ method: 'PUT', url: mute, payload: { muted: false } });
    await overdue(owner, v, 'Grease points');
    received.length = 0;
    await scan('12:05');
    expect(received.map((r) => r.path).sort()).toEqual(['/helper', '/owner']);
  });

  it('announces a document when it is about to expire, and again once it has', async () => {
    const u = await t.user('trucker');
    await hook(u, '/docs');
    const v = await vehicleWith(u, 'Kenworth');
    const doc = (
      await u.req({
        method: 'POST',
        url: `/api/v1/vehicles/${v}/documents`,
        payload: {
          type: 'dot_inspection',
          title: 'Annual DOT inspection',
          expiresOn: addDays(day, 10),
        },
      })
    ).json();
    await scan('12:00');
    expect(received.map((r) => r.body)).toMatchObject([
      {
        event: 'document.status',
        title: 'Expires soon: Annual DOT inspection for the Kenworth',
        body: `Expires on ${addDays(day, 10)}.`,
      },
    ]);
    received.length = 0;
    await scan('13:00');
    expect(received).toEqual([]);

    // The date passes.
    await t.db
      .updateTable('vehicle_documents')
      .set({ expires_on: addDays(day, -1) })
      .where('id', '=', doc.id)
      .execute();
    await scan('14:00');
    expect(titles()).toEqual(['Expired: Annual DOT inspection for the Kenworth']);

    // Renewed: quiet again until the new date comes close.
    await u.req({
      method: 'PATCH',
      url: `/api/v1/documents/${doc.id}`,
      payload: {
        type: 'dot_inspection',
        title: 'Annual DOT inspection',
        expiresOn: addDays(day, 365),
      },
    });
    received.length = 0;
    await scan('15:00');
    expect(received).toEqual([]);
  });

  it('sends the weekly digest once, on its day and hour, with what needs attention', async () => {
    const u = await t.user('planner');
    await hook(u, '/digest');
    const v = await vehicleWith(u, 'Wagon');
    await overdue(u, v, 'Timing belt');
    await u.req({
      method: 'POST',
      url: `/api/v1/vehicles/${v}/documents`,
      payload: { type: 'insurance', title: 'Insurance', expiresOn: addDays(day, 5) },
    });
    // Let the ordinary notifications go first, so only the digest is left to send.
    await scan('00:10');
    received.length = 0;

    const weekday = at('12:00').getUTCDay();
    const set = (notify: Record<string, unknown>) =>
      u.req({ method: 'PATCH', url: '/api/v1/me', payload: { notify } });
    // Wrong day: nothing.
    await set({ digest: true, digestDay: (weekday + 1) % 7, digestHour: 9 });
    await scan('10:00');
    expect(received).toEqual([]);
    // Right day, before the hour: nothing yet.
    await set({ digestDay: weekday });
    await scan('08:59');
    expect(received).toEqual([]);
    await scan('09:00');
    expect(received).toHaveLength(1);
    expect(received[0]?.body).toMatchObject({
      event: 'digest',
      title: 'Axlebook this week: 2 to look at',
      body: '• Overdue: Timing belt on the Wagon\n• Expires soon: Insurance for the Wagon',
    });
    // Not again the same day.
    await scan('18:00');
    expect(received).toHaveLength(1);
  });

  it('skips the digest when there is nothing to report', async () => {
    const u = await t.user('tidy');
    await hook(u, '/tidy');
    await vehicleWith(u, 'Spotless');
    await u.req({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { notify: { digest: true, digestDay: at('12:00').getUTCDay(), digestHour: 0 } },
    });
    await scan('12:00');
    expect(received.filter((r) => r.path === '/tidy')).toEqual([]);
  });

  it('writes to each person in their own language', async () => {
    const u = await t.user('shqiptar');
    await hook(u, '/sq');
    await u.req({ method: 'PATCH', url: '/api/v1/me', payload: { locale: 'sq' } });
    const v = await vehicleWith(u, 'Golf');
    await overdue(u, v, 'Vaji');
    await scan('12:30');
    expect(received.filter((r) => r.path === '/sq').map((r) => r.body.title)).toEqual([
      'Me afat të kaluar: Vaji për Golf',
    ]);
  });
});
