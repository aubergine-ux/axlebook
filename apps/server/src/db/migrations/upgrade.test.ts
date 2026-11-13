import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../config';
import { randomToken, sha256 } from '../../lib/crypto';
import { createTestApp, freshDb, type TestApp } from '../../test/helpers';
import { migrateToLatest } from '../migrate';
import { migrations } from './index';

/** The schema v1.0.0 shipped with. Everything after it has to upgrade an install in place. */
const V1 = '0005_view_prefs';

let t: TestApp | undefined;
afterEach(() => t?.close());

describe('upgrading an existing install', () => {
  it('keeps a v1.0 database intact through every later migration', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? ':memory:',
    });
    const handle = await freshDb(config);
    const db = handle.db;
    await migrateToLatest(db, V1);

    // Rows written the way 1.0 wrote them, with only the columns that existed then.
    const ts = '2026-11-09T12:00:00.000Z';
    // biome-ignore lint/suspicious/noExplicitAny: the old schema isn't the typed one
    const old = db as any;
    const user = await old
      .insertInto('users')
      .values({
        username: 'ruth',
        role: 'admin',
        theme: 'dark',
        disabled: 0,
        unit_system: 'metric',
        view_prefs: '{"garage":{"sort":"name"}}',
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const vehicle = await old
      .insertInto('vehicles')
      .values({
        owner_id: user.id,
        category: 'car',
        year: 2015,
        make: 'Toyota',
        model: 'Tacoma',
        vin: '5TFAX5GN0FX000001',
        odometer_unit: 'mi',
        fuel_unit: 'gal_us',
        fuel_type: 'gasoline',
        purchase_price: 21_500_000,
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const record = await old
      .insertInto('records')
      .values({
        vehicle_id: vehicle.id,
        kind: 'fuel',
        date: '2026-10-01',
        odometer: 84_100,
        cost: 53_200,
        fuel_volume: 15_200,
        price_per_unit: 3_500,
        is_full: 1,
        missed_previous: 0,
        station: 'Costco',
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const reminder = await old
      .insertInto('reminders')
      .values({
        vehicle_id: vehicle.id,
        title: 'Oil and filter',
        due_mode: 'either',
        due_date: '2027-01-01',
        due_odometer: 89_000,
        interval_months: 6,
        interval_distance: 5000,
        soon_days: 30,
        soon_distance: 500,
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const channel = await old
      .insertInto('notification_channels')
      .values({
        user_id: user.id,
        type: 'ntfy',
        name: 'Phone',
        config: '{"type":"ntfy","url":"http://127.0.0.1:9/t"}',
        enabled: 1,
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const applied = await migrateToLatest(db);
    const later = Object.keys(migrations).filter((m) => m > V1);
    expect(applied).toEqual(later);
    expect(later.length).toBeGreaterThan(0);
    // Running it again on the upgraded database changes nothing.
    expect(await migrateToLatest(db)).toEqual([]);

    expect(await db.selectFrom('users').selectAll().execute()).toMatchObject([
      { id: user.id, username: 'ruth', unit_system: 'metric', theme: 'dark' },
    ]);
    expect(await db.selectFrom('vehicles').selectAll().execute()).toMatchObject([
      { id: vehicle.id, vin: '5TFAX5GN0FX000001', purchase_price: 21_500_000 },
    ]);
    expect(await db.selectFrom('records').selectAll().execute()).toMatchObject([
      { id: record.id, cost: 53_200, fuel_volume: 15_200, station: 'Costco' },
    ]);
    expect(await db.selectFrom('reminders').selectAll().execute()).toMatchObject([
      { id: reminder.id, due_odometer: 89_000, interval_distance: 5000 },
    ]);
    expect(await db.selectFrom('notification_channels').selectAll().execute()).toMatchObject([
      { id: channel.id, type: 'ntfy', enabled: 1 },
    ]);

    // And the app runs on it: the old account signs in to the old data.
    t = await createTestApp({}, { db: handle });
    const token = randomToken();
    await db
      .insertInto('sessions')
      .values({
        user_id: user.id,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_seen_at: ts,
        created_at: ts,
      })
      .execute();
    const get = async (url: string) =>
      (
        await t?.app.inject({
          method: 'GET',
          url,
          headers: { cookie: `axlebook_session=${token}` },
        })
      )?.json();
    expect(await get('/api/v1/vehicles')).toMatchObject([{ make: 'Toyota', model: 'Tacoma' }]);
    expect((await get(`/api/v1/vehicles/${vehicle.id}/records`)).items).toMatchObject([
      { kind: 'fuel', cost: 53_200 },
    ]);
    expect((await get(`/api/v1/vehicles/${vehicle.id}/reminders`))[0]).toMatchObject({
      title: 'Oil and filter',
    });
    expect(await get('/api/v1/me')).toMatchObject({
      username: 'ruth',
      unitSystem: 'metric',
      garage: { sort: 'name' },
    });
  });
});
