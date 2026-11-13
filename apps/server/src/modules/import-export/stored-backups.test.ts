import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  multipartFile,
  type TestApp,
  tinyPdf,
  vehicleBody,
} from '../../test/helpers';

let t: TestApp;
afterEach(() => t?.close());

const settings = (payload: Record<string, unknown>) =>
  t.req({ method: 'PATCH', url: '/api/v1/settings', payload });
const names = async () =>
  (await t.req({ method: 'GET', url: '/api/v1/backups' }))
    .json()
    .map((b: { name: string }) => b.name);
const at = (iso: string) => new Date(iso);

async function seed() {
  const v = (
    await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: vehicleBody({ nickname: 'Taco' }),
    })
  ).json().id as number;
  const record = (
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${v}/records`,
      payload: { kind: 'service', date: '2026-01-01', odometer: 1000, title: 'Oil', cost: 50_000 },
    })
  ).json().id as number;
  await t.req({
    method: 'POST',
    url: `/api/v1/records/${record}/attachments`,
    ...multipartFile('file', 'r.pdf', tinyPdf, 'application/pdf'),
  });
  return { v, record };
}

describe('scheduled backups', () => {
  it('are off by default, run when due, and keep only the newest few', async () => {
    t = await createTestApp();
    await seed();
    const backups = t.app.services.backups;
    expect(await backups.tick(at('2026-11-01T03:00:00Z'))).toBeNull();
    expect(await names()).toEqual([]);

    const s = (await settings({ backupEnabled: true, backupEveryHours: 24, backupKeep: 2 })).json();
    expect(s).toMatchObject({ backupEnabled: true, backupEveryHours: 24, backupKeep: 2 });
    const first = await backups.tick(at('2026-11-01T03:00:00Z'));
    expect(first?.name).toBe('axlebook-backup-20261101-030000.zip');
    const file = path.join(t.dataDir, 'backups', first?.name ?? '');
    expect(fs.statSync(file).size).toBe(first?.size);
    // Nothing half-written is left behind.
    expect(fs.readdirSync(path.join(t.dataDir, 'backups'))).toEqual([first?.name]);

    // Stored backups are dated by their file time; pin it so "due" is about the schedule.
    const stamp = (name: string, iso: string) =>
      fs.utimesSync(path.join(t.dataDir, 'backups', name), at(iso), at(iso));
    stamp(first?.name ?? '', '2026-11-01T03:00:00Z');
    // 23 hours later it isn't due; 24 hours later it is.
    expect(await backups.tick(at('2026-11-02T02:00:00Z'))).toBeNull();
    const second = await backups.tick(at('2026-11-02T03:00:00Z'));
    expect(second?.name).toBe('axlebook-backup-20261102-030000.zip');
    stamp(second?.name ?? '', '2026-11-02T03:00:00Z');
    const third = await backups.tick(at('2026-11-03T03:00:01Z'));
    // Keep 2: the oldest is gone.
    expect(await names()).toEqual([third?.name, second?.name]);

    for (const bad of [{ backupKeep: 0 }, { backupEveryHours: 0 }, { backupEveryHours: 721 }])
      expect((await settings(bad)).statusCode).toBe(400);
  });

  it("doesn't back up an instance with nothing in it", async () => {
    t = await createTestApp();
    await settings({ backupEnabled: true });
    expect(await t.app.services.backups.tick()).toBeNull();
    expect(await names()).toEqual([]);
  });

  it('makes one on request, serves it, deletes it, and refuses names that are not backups', async () => {
    t = await createTestApp();
    await seed();
    const made = await t.req({ method: 'POST', url: '/api/v1/backups' });
    expect(made.statusCode).toBe(201);
    const { name } = made.json();
    expect(name).toMatch(/^axlebook-backup-\d{8}-\d{6}-manual\.zip$/);
    const got = await t.req({ method: 'GET', url: `/api/v1/backups/${name}` });
    expect(got.headers['content-type']).toBe('application/zip');
    expect(got.rawPayload.subarray(0, 2).toString()).toBe('PK');
    for (const evil of ['..%2F..%2Faxlebook.db', 'axlebook.db', 'axlebook-backup-x.zip'])
      for (const method of ['GET', 'DELETE'] as const)
        expect((await t.req({ method, url: `/api/v1/backups/${evil}` })).statusCode).toBe(404);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/backups/${name}` })).statusCode).toBe(
      204,
    );
    expect(await names()).toEqual([]);
    const editor = await t.user('ed');
    expect((await editor.req({ method: 'GET', url: '/api/v1/backups' })).statusCode).toBe(403);
  });

  it('restores a stored backup over a live instance, and saves what was there first', async () => {
    t = await createTestApp();
    const { v } = await seed();
    const name = (await t.req({ method: 'POST', url: '/api/v1/backups' })).json().name as string;
    const receipt = (
      await t.db.selectFrom('attachments').select('storage_key').executeTakeFirstOrThrow()
    ).storage_key;

    // After the backup: one record changed, one added, another vehicle with a file of its own.
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${v}/records`,
      payload: { kind: 'repair', date: '2026-02-01', odometer: 2000, title: 'Mistake', cost: 1 },
    });
    const extra = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Later' }),
      })
    ).json().id;
    const doc = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${extra}/documents`,
        payload: { type: 'insurance', title: 'Card' },
      })
    ).json().id;
    await t.req({
      method: 'PUT',
      url: `/api/v1/documents/${doc}/file`,
      ...multipartFile('file', 'c.pdf', tinyPdf, 'application/pdf'),
    });
    const later = (
      await t.db
        .selectFrom('vehicle_documents')
        .select('storage_key')
        .where('id', '=', doc)
        .executeTakeFirstOrThrow()
    ).storage_key as string;
    const onDisk = (key: string) => fs.existsSync(path.join(t.dataDir, 'attachments', key));
    expect(onDisk(later)).toBe(true);

    // It has to be asked for by name.
    const url = `/api/v1/backups/${name}/restore`;
    expect((await t.req({ method: 'POST', url, payload: { confirm: 'yes' } })).statusCode).toBe(
      400,
    );
    const res = await t.req({ method: 'POST', url, payload: { confirm: name } });
    expect(res.statusCode).toBe(200);
    expect(res.json().restored).toMatchObject({ vehicles: 1, records: 1, attachments: 1 });

    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage.map((x: { nickname: string }) => x.nickname)).toEqual(['Taco']);
    const records = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${garage[0].id}/records` })
    ).json();
    expect(records.items.map((r: { title: string }) => r.title)).toEqual(['Oil']);
    // The receipt is still there, the later vehicle's file is not, and the admin is still signed in.
    expect(onDisk(receipt)).toBe(true);
    expect(onDisk(later)).toBe(false);
    expect((await t.req({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(200);

    // What was replaced can be brought back.
    const safety = (await names()).find((n: string) => n.endsWith('-prerestore.zip'));
    expect(safety).toBeDefined();
    const back = await t.req({
      method: 'POST',
      url: `/api/v1/backups/${safety}/restore`,
      payload: { confirm: safety },
    });
    expect(back.json().restored).toMatchObject({ vehicles: 2, records: 2 });
    const again = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(again.map((x: { nickname: string }) => x.nickname).sort()).toEqual(['Later', 'Taco']);
    expect(onDisk(later)).toBe(true);
  });

  it('leaves everything as it was when the backup turns out to be broken', async () => {
    t = await createTestApp();
    await seed();
    const name = (await t.req({ method: 'POST', url: '/api/v1/backups' })).json().name as string;
    fs.writeFileSync(path.join(t.dataDir, 'backups', name), 'not a zip');
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/backups/${name}/restore`,
      payload: { confirm: name },
    });
    expect(res.statusCode).toBe(415);
    expect((await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json()).toHaveLength(1);
  });
});
