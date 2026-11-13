/**
 * Permission matrix for every API route.
 *
 * One owner sets up a vehicle with one of everything. Then each other account tries every
 * route against those ids. The route list comes from the OpenAPI document, so a new route
 * that isn't classified here fails the first test instead of slipping through unchecked.
 *
 * "Denied" means 403 or 404 exactly. Bodies are valid, so a 400 can't hide a missing check.
 */
import type { InjectOptions } from 'fastify';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  multipartFile,
  type TestApp,
  tinyPdf,
  tinyPng,
  vehicleBody,
} from '../../test/helpers';

type Req = (o: InjectOptions) => ReturnType<TestApp['req']>;
type Who = 'stranger' | 'viewer' | 'looker' | 'helper';

/**
 * - public: no sign-in needed
 * - self: acts on the caller's own account or garage, so there's nobody else's id to guess
 * - admin: admins only
 * - read / write: a vehicle's data; view shares may read, edit shares may write
 * - owner: only the vehicle's owner (delete, archive, sharing)
 * - mine: belongs to one user (tokens, channels, parts, spreadsheet uploads)
 */
type Rule = 'public' | 'self' | 'admin' | 'read' | 'write' | 'owner' | 'mine';

interface Route {
  rule: Rule;
  /** Other answers that also mean "not yours", e.g. 410 for someone else's upload. */
  deniedAs?: number[];
  /** Request against the owner's resources (ids filled in by `ids`). */
  make?: () => InjectOptions;
}

let t: TestApp;
let owner: { req: Req; user: { id: number } };
const users = {} as Record<Who, { req: Req; user: { id: number } }>;
const ids = {} as Record<
  | 'vehicle'
  | 'record'
  | 'attachment'
  | 'reading'
  | 'reminder'
  | 'part'
  | 'plan'
  | 'inspection'
  | 'token'
  | 'channel'
  | 'mapping'
  | 'recall',
  number
>;
let uploadId = '';

const v = () => `/api/v1/vehicles/${ids.vehicle}`;
const record = {
  kind: 'service',
  date: '2026-10-01',
  odometer: 100_100,
  title: 'Oil',
  cost: 50_000,
};
const reminder = { title: 'Grease', dueMode: 'date', dueDate: '2027-01-01' };
const png = () => multipartFile('file', 'p.png', tinyPng, 'image/png');
const pdf = () => multipartFile('file', 'r.pdf', tinyPdf, 'application/pdf');

const ROUTES: Record<string, Route> = {
  'GET /api/v1/health': { rule: 'public' },
  'GET /api/v1/config': { rule: 'public' },
  'GET /api/v1/auth/status': { rule: 'public' },
  'POST /api/v1/auth/setup': { rule: 'public' },
  'POST /api/v1/auth/login': { rule: 'public' },
  'POST /api/v1/auth/logout': { rule: 'self' },
  'GET /api/v1/me': { rule: 'self' },
  'PATCH /api/v1/me': { rule: 'self' },
  'POST /api/v1/me/password': { rule: 'self' },
  'GET /api/v1/me/tokens': { rule: 'self' },
  'POST /api/v1/me/tokens': { rule: 'self' },
  'DELETE /api/v1/me/tokens/{id}': {
    rule: 'mine',
    make: () => ({ method: 'DELETE', url: `/api/v1/me/tokens/${ids.token}` }),
  },
  'GET /api/v1/users': { rule: 'admin', make: () => ({ method: 'GET', url: '/api/v1/users' }) },
  'POST /api/v1/users': {
    rule: 'admin',
    make: () => ({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'sneaky', password: 'long-enough-password', role: 'admin' },
    }),
  },
  'GET /api/v1/users/directory': { rule: 'self' },
  'PATCH /api/v1/users/{id}': {
    rule: 'admin',
    make: () => ({
      method: 'PATCH',
      url: `/api/v1/users/${owner.user.id}`,
      payload: { role: 'admin' },
    }),
  },
  'DELETE /api/v1/users/{id}': {
    rule: 'admin',
    make: () => ({ method: 'DELETE', url: `/api/v1/users/${owner.user.id}` }),
  },
  'GET /api/v1/settings': { rule: 'self' },
  'PATCH /api/v1/settings': {
    rule: 'admin',
    make: () => ({ method: 'PATCH', url: '/api/v1/settings', payload: { currency: 'EUR' } }),
  },
  'GET /api/v1/vehicles': { rule: 'self' },
  'POST /api/v1/vehicles': { rule: 'self' },
  'GET /api/v1/vehicles/{id}': { rule: 'read', make: () => ({ method: 'GET', url: v() }) },
  // Edit shares may correct the vehicle's details; only the owner archives, deletes or shares it.
  'PATCH /api/v1/vehicles/{id}': {
    rule: 'write',
    make: () => ({ method: 'PATCH', url: v(), payload: { nickname: 'Mine now' } }),
  },
  'DELETE /api/v1/vehicles/{id}': { rule: 'owner', make: () => ({ method: 'DELETE', url: v() }) },
  'POST /api/v1/vehicles/{id}/archive': {
    rule: 'owner',
    make: () => ({ method: 'POST', url: `${v()}/archive` }),
  },
  'POST /api/v1/vehicles/{id}/unarchive': {
    rule: 'owner',
    make: () => ({ method: 'POST', url: `${v()}/unarchive` }),
  },
  'PUT /api/v1/vehicles/{id}/photo': {
    rule: 'write',
    make: () => ({ method: 'PUT', url: `${v()}/photo`, ...png() }),
  },
  'DELETE /api/v1/vehicles/{id}/photo': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `${v()}/photo` }),
  },
  'GET /api/v1/vehicles/{id}/photo': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/photo` }),
  },
  'GET /api/v1/vehicles/{vehicleId}/shares': {
    rule: 'owner',
    make: () => ({ method: 'GET', url: `${v()}/shares` }),
  },
  'PUT /api/v1/vehicles/{vehicleId}/shares/{userId}': {
    rule: 'owner',
    make: () => ({
      method: 'PUT',
      url: `${v()}/shares/${users.stranger.user.id}`,
      payload: { permission: 'edit' },
    }),
  },
  'DELETE /api/v1/vehicles/{vehicleId}/shares/{userId}': {
    rule: 'owner',
    make: () => ({ method: 'DELETE', url: `${v()}/shares/${users.helper.user.id}` }),
  },
  'GET /api/v1/records': { rule: 'self' },
  'GET /api/v1/vehicles/{vehicleId}/records': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/records` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/records': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/records`, payload: { ...record, title: 'New' } }),
  },
  'GET /api/v1/records/{id}': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `/api/v1/records/${ids.record}` }),
  },
  'PUT /api/v1/records/{id}': {
    rule: 'write',
    make: () => ({ method: 'PUT', url: `/api/v1/records/${ids.record}`, payload: record }),
  },
  'DELETE /api/v1/records/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/records/${ids.record}` }),
  },
  'POST /api/v1/records/{id}/attachments': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `/api/v1/records/${ids.record}/attachments`, ...pdf() }),
  },
  'GET /api/v1/attachments/{id}': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `/api/v1/attachments/${ids.attachment}` }),
  },
  'DELETE /api/v1/attachments/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/attachments/${ids.attachment}` }),
  },
  'GET /api/v1/vehicles/{vehicleId}/odometer': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/odometer` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/odometer': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `${v()}/odometer`,
      payload: { date: '2026-10-05', odometer: 100_300 },
    }),
  },
  'PUT /api/v1/odometer/{id}': {
    rule: 'write',
    make: () => ({
      method: 'PUT',
      url: `/api/v1/odometer/${ids.reading}`,
      payload: { date: '2026-10-02', odometer: 100_200 },
    }),
  },
  'DELETE /api/v1/odometer/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/odometer/${ids.reading}` }),
  },
  'GET /api/v1/vehicles/{vehicleId}/fuel-economy': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/fuel-economy` }),
  },
  'GET /api/v1/reminders': { rule: 'self' },
  'GET /api/v1/vehicles/{vehicleId}/reminders': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/reminders` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/reminders': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/reminders`, payload: reminder }),
  },
  'GET /api/v1/reminders/{id}': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `/api/v1/reminders/${ids.reminder}` }),
  },
  'PUT /api/v1/reminders/{id}': {
    rule: 'write',
    make: () => ({ method: 'PUT', url: `/api/v1/reminders/${ids.reminder}`, payload: reminder }),
  },
  'DELETE /api/v1/reminders/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/reminders/${ids.reminder}` }),
  },
  'POST /api/v1/reminders/{id}/archive': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `/api/v1/reminders/${ids.reminder}/archive` }),
  },
  'POST /api/v1/reminders/{id}/unarchive': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `/api/v1/reminders/${ids.reminder}/unarchive` }),
  },
  'POST /api/v1/reminders/{id}/complete': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `/api/v1/reminders/${ids.reminder}/complete`,
      payload: { date: '2026-10-03' },
    }),
  },
  'GET /api/v1/parts': { rule: 'self' },
  'POST /api/v1/parts': { rule: 'self' },
  'PUT /api/v1/parts/{id}': {
    rule: 'mine',
    make: () => ({ method: 'PUT', url: `/api/v1/parts/${ids.part}`, payload: { name: 'Stolen' } }),
  },
  'DELETE /api/v1/parts/{id}': {
    rule: 'mine',
    make: () => ({ method: 'DELETE', url: `/api/v1/parts/${ids.part}` }),
  },
  'POST /api/v1/parts/{id}/adjust': {
    rule: 'mine',
    make: () => ({
      method: 'POST',
      url: `/api/v1/parts/${ids.part}/adjust`,
      payload: { delta: -1000 },
    }),
  },
  'GET /api/v1/vehicles/{vehicleId}/plan': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/plan` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/plan': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `${v()}/plan`,
      payload: { title: 'Brakes', kind: 'repair', priority: 'normal' },
    }),
  },
  'GET /api/v1/plan': { rule: 'self' },
  'PUT /api/v1/plan/{id}': {
    rule: 'write',
    make: () => ({
      method: 'PUT',
      url: `/api/v1/plan/${ids.plan}`,
      payload: { title: 'Brakes soon', kind: 'repair', priority: 'high' },
    }),
  },
  'DELETE /api/v1/plan/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/plan/${ids.plan}` }),
  },
  'POST /api/v1/plan/{id}/convert': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `/api/v1/plan/${ids.plan}/convert`,
      payload: { date: '2026-10-04' },
    }),
  },
  'GET /api/v1/reports': { rule: 'self' },
  'GET /api/v1/vehicles/{vehicleId}/export.csv': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/export.csv` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/import/csv': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `${v()}/import/csv`,
      payload: { csv: 'date,title,cost\n2026-09-01,Wipers,20\n', kind: 'service', dryRun: true },
    }),
  },
  // Everyone may download a backup of their own vehicles; see the test below.
  'GET /api/v1/backup': { rule: 'self' },
  'POST /api/v1/backup/restore': {
    rule: 'admin',
    make: () => ({
      method: 'POST',
      url: '/api/v1/backup/restore',
      ...multipartFile('file', 'b.zip', Buffer.from('PK\x03\x04'), 'application/zip'),
    }),
  },
  'GET /api/v1/me/channels': { rule: 'self' },
  'POST /api/v1/me/channels': { rule: 'self' },
  'PUT /api/v1/me/channels/{id}': {
    rule: 'mine',
    make: () => ({
      method: 'PUT',
      url: `/api/v1/me/channels/${ids.channel}`,
      payload: { name: 'Mine', config: { type: 'ntfy', url: 'http://127.0.0.1:9/x' } },
    }),
  },
  'DELETE /api/v1/me/channels/{id}': {
    rule: 'mine',
    make: () => ({ method: 'DELETE', url: `/api/v1/me/channels/${ids.channel}` }),
  },
  'POST /api/v1/me/channels/{id}/test': {
    rule: 'mine',
    make: () => ({ method: 'POST', url: `/api/v1/me/channels/${ids.channel}/test` }),
  },
  'POST /api/v1/notifications/scan': {
    rule: 'admin',
    make: () => ({ method: 'POST', url: '/api/v1/notifications/scan' }),
  },
  'GET /api/v1/ai/status': { rule: 'self' },
  'GET /api/v1/vehicles/{vehicleId}/insights/mpg': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/insights/mpg` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/insights/mpg': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/insights/mpg` }),
  },
  'GET /api/v1/vehicles/{vehicleId}/tips': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/tips` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/tips/ai': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/tips/ai` }),
  },
  'GET /api/v1/vehicles/{vehicleId}/schedule': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/schedule` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/schedule/tailor': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/schedule/tailor` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/schedule/apply': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `${v()}/schedule/apply`,
      payload: {
        items: [{ title: 'Fifth wheel', intervalMonths: 1, intervalDistance: null, notes: null }],
      },
    }),
  },
  'GET /api/v1/vehicles/{vehicleId}/inspections': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/inspections` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/inspections': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `${v()}/inspections`,
      payload: { type: 'post_trip', date: '2026-10-02', items: [{ item: 'tires', ok: true }] },
    }),
  },
  'POST /api/v1/inspections/{id}/correct': {
    rule: 'write',
    make: () => ({
      method: 'POST',
      url: `/api/v1/inspections/${ids.inspection}/correct`,
      payload: {},
    }),
  },
  'DELETE /api/v1/inspections/{id}': {
    rule: 'write',
    make: () => ({ method: 'DELETE', url: `/api/v1/inspections/${ids.inspection}` }),
  },
  'GET /api/v1/ifta': { rule: 'self' },
  'GET /api/v1/me/calendar': { rule: 'self' },
  'POST /api/v1/me/calendar': { rule: 'self' },
  'DELETE /api/v1/me/calendar': { rule: 'self' },
  'POST /api/v1/import/spreadsheet': { rule: 'self' },
  // Local assistant: admin-only setup; drafts and questions only ever see the caller's own
  // garage (covered in assistant.test.ts, since the assistant is off here).
  'GET /api/v1/assistant/models': {
    rule: 'admin',
    make: () => ({ method: 'GET', url: '/api/v1/assistant/models' }),
  },
  'PUT /api/v1/assistant/model': {
    rule: 'admin',
    make: () => ({ method: 'PUT', url: '/api/v1/assistant/model', payload: { model: 'x:1b' } }),
  },
  'POST /api/v1/assistant/test': {
    rule: 'admin',
    make: () => ({ method: 'POST', url: '/api/v1/assistant/test' }),
  },
  'POST /api/v1/assistant/receipt': { rule: 'self' },
  'POST /api/v1/assistant/entry': { rule: 'self' },
  'POST /api/v1/assistant/ask': { rule: 'self' },
  'POST /api/v1/import/spreadsheet/{uploadId}/preview': {
    rule: 'mine',
    deniedAs: [410],
    make: () => ({
      method: 'POST',
      url: `/api/v1/import/spreadsheet/${uploadId}/preview`,
      payload: { plan: { sheets: [], vehicles: [] } },
    }),
  },
  // Lookups are off here, so an allowed caller gets "switched off" rather than a network call.
  'POST /api/v1/lookups/vin': { rule: 'self' },
  'GET /api/v1/vehicles/{vehicleId}/recalls': {
    rule: 'read',
    make: () => ({ method: 'GET', url: `${v()}/recalls` }),
  },
  'POST /api/v1/vehicles/{vehicleId}/recalls/check': {
    rule: 'write',
    make: () => ({ method: 'POST', url: `${v()}/recalls/check` }),
  },
  'PATCH /api/v1/recalls/{id}': {
    rule: 'write',
    make: () => ({
      method: 'PATCH',
      url: `/api/v1/recalls/${ids.recall}`,
      payload: { state: 'dismissed' },
    }),
  },
  'DELETE /api/v1/import/mappings/{id}': {
    rule: 'mine',
    make: () => ({ method: 'DELETE', url: `/api/v1/import/mappings/${ids.mapping}` }),
  },
  'POST /api/v1/import/spreadsheet/{uploadId}/commit': {
    rule: 'mine',
    deniedAs: [410],
    make: () => ({
      method: 'POST',
      url: `/api/v1/import/spreadsheet/${uploadId}/commit`,
      payload: { plan: { sheets: [], vehicles: [] } },
    }),
  },
};

const denied = [403, 404];
const ok = (status: number) => status >= 200 && status < 300;

beforeAll(async () => {
  t = await createTestApp();
  const o = await t.user('olive');
  owner = o;
  users.stranger = await t.user('stranger');
  users.viewer = await t.user('vic', 'viewer');
  users.looker = await t.user('lou');
  users.helper = await t.user('hal');

  const json = async (res: ReturnType<Req>) => {
    const r = await res;
    expect(r.statusCode, r.body).toBeLessThan(300);
    return r.json();
  };
  ids.vehicle = (
    await json(
      o.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({
          category: 'semi',
          make: 'Kenworth',
          model: 'W900',
          fuelType: 'diesel',
        }),
      }),
    )
  ).id;
  for (const [who, permission] of [
    ['viewer', 'view'],
    ['looker', 'view'],
    ['helper', 'edit'],
  ] as const)
    await json(
      o.req({
        method: 'PUT',
        url: `${v()}/shares/${users[who].user.id}`,
        payload: { permission },
      }),
    );
  ids.record = (await json(o.req({ method: 'POST', url: `${v()}/records`, payload: record }))).id;
  ids.attachment = (
    await json(
      o.req({ method: 'POST', url: `/api/v1/records/${ids.record}/attachments`, ...pdf() }),
    )
  ).id;
  await json(o.req({ method: 'PUT', url: `${v()}/photo`, ...png() }));
  ids.reading = (
    await json(
      o.req({
        method: 'POST',
        url: `${v()}/odometer`,
        payload: { date: '2026-10-02', odometer: 100_200 },
      }),
    )
  ).id;
  ids.reminder = (
    await json(o.req({ method: 'POST', url: `${v()}/reminders`, payload: reminder }))
  ).id;
  ids.part = (
    await json(o.req({ method: 'POST', url: '/api/v1/parts', payload: { name: 'Filter' } }))
  ).id;
  ids.plan = (
    await json(
      o.req({
        method: 'POST',
        url: `${v()}/plan`,
        payload: { title: 'Brakes', kind: 'repair', priority: 'normal' },
      }),
    )
  ).id;
  ids.inspection = (
    await json(
      o.req({
        method: 'POST',
        url: `${v()}/inspections`,
        payload: {
          type: 'pre_trip',
          date: '2026-10-01',
          items: [{ item: 'lights', ok: false, note: 'Marker out' }],
        },
      }),
    )
  ).id;
  ids.token = (
    await json(o.req({ method: 'POST', url: '/api/v1/me/tokens', payload: { name: 'Script' } }))
  ).id;
  ids.channel = (
    await json(
      o.req({
        method: 'POST',
        url: '/api/v1/me/channels',
        payload: { name: 'Phone', config: { type: 'ntfy', url: 'http://127.0.0.1:9/topic' } },
      }),
    )
  ).id;
  uploadId = (
    await json(
      o.req({
        method: 'POST',
        url: '/api/v1/import/spreadsheet?ai=false',
        ...multipartFile('file', 'log.csv', Buffer.from('Date,Cost\n2026-01-01,5\n'), 'text/csv'),
      }),
    )
  ).uploadId;
  const now = new Date().toISOString();
  ids.mapping = (
    await t.db
      .insertInto('import_mappings')
      .values({
        user_id: owner.user.id,
        signature: 'x',
        file_name: 'log.csv',
        plan: '{"sheets":[],"vehicles":[]}',
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  ids.recall = (
    await t.db
      .insertInto('recalls')
      .values({ vehicle_id: ids.vehicle, campaign: '16V340000', created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
});
afterAll(() => t.close());

describe('permission matrix', () => {
  it('classifies every route in the API', async () => {
    const doc = (await t.req({ method: 'GET', url: '/api/openapi.json' })).json();
    const routes = Object.entries(doc.paths as Record<string, Record<string, unknown>>).flatMap(
      ([path, ops]) =>
        Object.keys(ops)
          .filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
          .map((m) => `${m.toUpperCase()} ${path}`),
    );
    expect(routes.filter((r) => !(r in ROUTES))).toEqual([]);
    expect(Object.keys(ROUTES).filter((r) => !routes.includes(r))).toEqual([]);
    // Every route that takes someone's id has a request to try it with.
    for (const [key, r] of Object.entries(ROUTES))
      if (key.includes('{')) expect(r.make, key).toBeDefined();
  });

  it('keeps everyone but the owner out of what is theirs, and non-admins out of admin routes', async () => {
    const failures: string[] = [];
    for (const [key, route] of Object.entries(ROUTES)) {
      if (!route.make) continue;
      const blocked: Who[] =
        route.rule === 'read'
          ? ['stranger']
          : route.rule === 'write'
            ? ['stranger', 'viewer', 'looker']
            : ['stranger', 'viewer', 'looker', 'helper'];
      for (const who of blocked) {
        const res = await users[who].req(route.make());
        if (![...denied, ...(route.deniedAs ?? [])].includes(res.statusCode))
          failures.push(`${who} ${key} → ${res.statusCode} ${res.body.slice(0, 120)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('lets shared users read, and edit shares write', async () => {
    const failures: string[] = [];
    for (const [key, route] of Object.entries(ROUTES)) {
      if (!route.make || route.rule !== 'read') continue;
      for (const who of ['viewer', 'looker', 'helper'] as const) {
        const res = await users[who].req(route.make());
        if (!ok(res.statusCode)) failures.push(`${who} ${key} → ${res.statusCode}`);
      }
    }
    // Writes go last and in order, so nothing is deleted before it's used. AI routes answer
    // "AI is off" here, which still proves the permission check let the edit share through.
    const writes = Object.entries(ROUTES).filter(([, r]) => r.rule === 'write' && r.make);
    const order = (k: string) =>
      k.startsWith('DELETE /api/v1/attachments') ? 1 : k.startsWith('DELETE') ? 2 : 0;
    writes.sort(([a], [b]) => order(a) - order(b));
    for (const [key, route] of writes) {
      const res = await users.helper.req(route.make?.() as InjectOptions);
      const aiOff =
        res.statusCode === 503 &&
        ['ai_disabled', 'lookups_disabled'].includes(res.json().error.code);
      if (denied.includes(res.statusCode) || (res.statusCode >= 500 && !aiOff))
        failures.push(`helper ${key} → ${res.statusCode} ${res.body.slice(0, 120)}`);
    }
    expect(failures).toEqual([]);
  });

  it("gives non-admins a backup of only their own data, with nobody else's account", async () => {
    for (const who of ['stranger', 'helper'] as const) {
      const res = await users[who].req({ method: 'GET', url: '/api/v1/backup' });
      const zip = unzipSync(new Uint8Array(res.rawPayload));
      const { tables } = JSON.parse(strFromU8(zip['backup.json'] as Uint8Array));
      expect(tables.vehicles).toEqual([]);
      expect(tables.records).toEqual([]);
      expect(tables.attachments).toEqual([]);
      expect(tables.notification_channels).toEqual([]);
      expect(tables.users.map((u: { id: number }) => u.id)).toEqual([users[who].user.id]);
      expect(Object.keys(zip).filter((f) => f !== 'backup.json')).toEqual([]);
    }
  });

  it("doesn't let an API token or session reach another user's data", async () => {
    const res = await users.stranger.req({
      method: 'POST',
      url: '/api/v1/me/tokens',
      payload: { name: 'Mine' },
    });
    const token = res.json().token as string;
    const asStranger = (url: string) =>
      t.anon({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    for (const url of [v(), `/api/v1/attachments/${ids.attachment}`, `${v()}/photo`])
      expect(denied).toContain((await asStranger(url)).statusCode);
    // Nobody signed in: everything but the public routes needs a session.
    expect((await t.anon({ method: 'GET', url: v() })).statusCode).toBe(401);
  });
});
