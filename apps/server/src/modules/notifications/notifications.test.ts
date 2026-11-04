import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
let server: http.Server;
let url: string;
const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
let failNext = false;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failNext) {
        failNext = false;
        res.writeHead(500).end();
        return;
      }
      received.push({ headers: req.headers, body });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  t = await createTestApp({ BASE_URL: 'https://cars.example.com' });
});
// BASE_URL pins the CSRF origin check, so requests must come from that origin.
const ORIGIN = { origin: 'https://cars.example.com' };
type Inject = TestApp['req'];
const as =
  (u: { req: Inject }): Inject =>
  (o) =>
    u.req({ ...o, headers: { ...ORIGIN, ...(o.headers ?? {}) } });
const req: Inject = (o) => as({ req: t.req })(o);

afterAll(async () => {
  await t.close();
  server.close();
});

describe('notification channels', () => {
  it('masks secrets, keeps them on update, and sends a signed test webhook', async () => {
    const created = (
      await req({
        method: 'POST',
        url: '/api/v1/me/channels',
        payload: { name: 'Hook', config: { type: 'webhook', url, secret: 's3cret' } },
      })
    ).json();
    expect(created.config).toEqual({ type: 'webhook', url, secret: '••••••' });
    const updated = (
      await req({
        method: 'PUT',
        url: `/api/v1/me/channels/${created.id}`,
        payload: { name: 'Hook 2', config: { type: 'webhook', url, secret: '••••••' } },
      })
    ).json();
    expect(updated.name).toBe('Hook 2');

    const tested = (
      await req({ method: 'POST', url: `/api/v1/me/channels/${created.id}/test` })
    ).json();
    expect(tested.lastResult).toMatchObject({ status: 'sent', error: null });
    const last = received.at(-1);
    const sig = createHmac('sha256', 's3cret')
      .update(last?.body ?? '')
      .digest('hex');
    expect(last?.headers['x-axlebook-signature']).toBe(`sha256=${sig}`);
    expect(JSON.parse(last?.body ?? '{}')).toMatchObject({
      event: 'test',
      title: 'Axlebook test notification',
    });
  });

  it('records delivery failures', async () => {
    const ch = (
      await req({
        method: 'POST',
        url: '/api/v1/me/channels',
        payload: { name: 'Flaky', config: { type: 'webhook', url } },
      })
    ).json();
    failNext = true;
    const res = (await req({ method: 'POST', url: `/api/v1/me/channels/${ch.id}/test` })).json();
    expect(res.lastResult).toMatchObject({ status: 'failed' });
    expect(res.lastResult.error).toMatch(/HTTP 500/);
    await req({ method: 'DELETE', url: `/api/v1/me/channels/${ch.id}` });
  });

  it('refuses email channels when SMTP is not configured', async () => {
    const res = await req({
      method: 'POST',
      url: '/api/v1/me/channels',
      payload: { name: 'Mail', config: { type: 'email', to: 'me@example.com' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('notifies once per escalation, for the owner and people the vehicle is shared with', async () => {
    const v = (
      await req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Taco' }),
      })
    ).json();
    await req({
      method: 'POST',
      url: `/api/v1/vehicles/${v.id}/records`,
      payload: { kind: 'service', date: '2026-01-01', odometer: 10_000, title: 'x' },
    });
    const friend = await t.user('friend');
    await req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v.id}/shares/${friend.user.id}`,
      payload: { permission: 'view' },
    });
    await as(friend)({
      method: 'POST',
      url: '/api/v1/me/channels',
      payload: { name: 'Friend hook', config: { type: 'discord', url } },
    });

    const rem = (
      await req({
        method: 'POST',
        url: `/api/v1/vehicles/${v.id}/reminders`,
        payload: { title: 'Oil change', dueMode: 'distance', dueOdometer: 10_300 },
      })
    ).json();
    expect(rem.status).toBe('due_soon');

    const before = received.length;
    expect((await req({ method: 'POST', url: '/api/v1/notifications/scan' })).json().notified).toBe(
      2,
    );
    const msgs = received.slice(before);
    expect(msgs.map((m) => JSON.parse(m.body).title ?? JSON.parse(m.body).content)).toEqual(
      expect.arrayContaining([
        'Due soon: Oil change on the Taco',
        expect.stringContaining('**Due soon: Oil change on the Taco**'),
      ]),
    );
    const webhook = msgs.map((m) => JSON.parse(m.body)).find((b) => b.event);
    expect(webhook.url).toBe(`https://cars.example.com/vehicles/${v.id}/reminders`);
    expect(webhook.body).toBe('300 mi to go.');

    // No repeat while nothing changes.
    expect((await req({ method: 'POST', url: '/api/v1/notifications/scan' })).json().notified).toBe(
      0,
    );

    // Escalation to overdue notifies again.
    await req({
      method: 'POST',
      url: `/api/v1/vehicles/${v.id}/records`,
      payload: { kind: 'service', date: '2026-01-02', odometer: 10_400, title: 'y' },
    });
    expect((await req({ method: 'POST', url: '/api/v1/notifications/scan' })).json().notified).toBe(
      2,
    );
    expect(
      JSON.parse(received.at(-1)?.body ?? '{}').content ??
        JSON.parse(received.at(-2)?.body ?? '{}').content,
    ).toMatch(/Overdue/);

    // Scanning is admin-only.
    expect(
      (await as(friend)({ method: 'POST', url: '/api/v1/notifications/scan' })).statusCode,
    ).toBe(403);
  });
});
