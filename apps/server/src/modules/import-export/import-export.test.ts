import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  multipartFile,
  type TestApp,
  tinyPdf,
  tinyPng,
  vehicleBody,
} from '../../test/helpers';
import { BACKED_UP, NOT_BACKED_UP } from './routes';

let t: TestApp;
afterEach(() => t?.close());

describe('CSV import and export', () => {
  it('imports one vehicle out of a Fuelly file that covers several', async () => {
    t = await createTestApp();
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const csv =
      'car_name,odometer,gallons,price,fuelup_date,partial_fuelup,missed_fuelup\n' +
      'Tacoma,61402,10.82,3.499,2024-01-15,0,0\n' +
      'Tacoma,61612,5.1,3.50,2024-01-29,1,0\n' +
      'Civic,20100,8.8,3.20,2024-02-01,0,0\n';
    const url = `/api/v1/vehicles/${v}/import/csv`;
    const dry = (await t.req({ method: 'POST', url, payload: { csv, dryRun: true } })).json();
    expect(dry).toMatchObject({
      detectedFormat: 'fuelly',
      total: 3,
      vehiclesInFile: ['Civic', 'Tacoma'],
    });
    // Saving without saying which vehicle would mix two cars into one logbook.
    const refused = await t.req({ method: 'POST', url, payload: { csv, dryRun: false } });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.params).toMatchObject({ field: 'onlyVehicle' });
    const real = (
      await t.req({
        method: 'POST',
        url,
        payload: { csv, dryRun: false, onlyVehicle: 'Tacoma' },
      })
    ).json();
    expect(real).toMatchObject({ total: 2, imported: 2 });
    const list = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/records` })).json();
    expect(list.total).toBe(2);
    expect(list.items.every((r: { kind: string }) => r.kind === 'fuel')).toBe(true);
  });

  it('previews, imports, skips duplicates, and round-trips its own export', async () => {
    t = await createTestApp();
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const csv =
      'Date,Odometer,FuelConsumed,Cost,FuelEconomy,IsFillToFull,MissedFuelUp,Notes,Tags\n' +
      '1/15/2024,61402,10.82,37.86,19.4,True,False,Costco,\n' +
      '1/29/2024,61612,5.10,17.85,0,True,False,,\n' +
      'garbage,1,1,1,1,True,False,,\n';
    const url = `/api/v1/vehicles/${v}/import/csv`;
    const dry = (
      await t.req({ method: 'POST', url, payload: { csv, kind: 'fuel', dryRun: true } })
    ).json();
    expect(dry).toMatchObject({
      dryRun: true,
      total: 3,
      imported: 0,
      detectedFormat: 'lubelogger',
      errors: [{ row: 4, message: 'date' }],
    });
    expect(dry.preview).toHaveLength(2);
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/records` })).json().total,
    ).toBe(0);

    const real = (
      await t.req({ method: 'POST', url, payload: { csv, kind: 'fuel', dryRun: false } })
    ).json();
    expect(real).toMatchObject({ imported: 2, skipped: 0 });
    const again = (
      await t.req({ method: 'POST', url, payload: { csv, kind: 'fuel', dryRun: false } })
    ).json();
    expect(again).toMatchObject({ imported: 0, skipped: 2 });

    const exported = await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/export.csv` });
    expect(exported.headers['content-type']).toMatch(/text\/csv/);
    expect(exported.headers['content-disposition']).toMatch(
      /attachment; filename="2015-toyota-tacoma-all.csv"/,
    );
    expect(exported.body.split('\r\n')[0]).toBe(
      'date,odometer,kind,title,cost,notes,tags,expense_category,fuel_volume,price_per_unit,full_tank,missed_previous,fuel_grade,station',
    );

    const v2 = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Copy' }),
      })
    ).json().id;
    const back = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${v2}/import/csv`,
        payload: { csv: exported.body, dryRun: false },
      })
    ).json();
    expect(back).toMatchObject({ detectedFormat: 'axlebook', imported: 2, errors: [] });
    const econ = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${v2}/fuel-economy` })
    ).json();
    expect(econ.fills[0].economy).toBeCloseTo(210 / 5.1);
  });
});

describe('backup and restore', () => {
  it('covers every table, apart from the ones left out on purpose', async () => {
    t = await createTestApp();
    const tables = (await t.db.introspection.getTables())
      .map((x) => x.name)
      .filter((n) => !n.startsWith('axlebook_migrations'));
    const covered = new Set<string>([...BACKED_UP, ...NOT_BACKED_UP]);
    expect(tables.filter((n) => !covered.has(n))).toEqual([]);
  });

  it('round-trips a whole instance, files included, into an empty one', async () => {
    t = await createTestApp();
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Taco', category: 'semi' }),
      })
    ).json();
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${v.id}/inspections`,
      payload: {
        type: 'pre_trip',
        date: '2026-01-02',
        items: [{ item: 'lights', ok: false, note: 'Marker out' }],
      },
    });
    const photo = multipartFile('file', 'p.png', tinyPng, 'image/png');
    await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v.id}/photo`,
      payload: photo.payload,
      headers: photo.headers,
    });
    const part = (
      await t.req({
        method: 'POST',
        url: '/api/v1/parts',
        payload: { name: 'Filter', quantity: 3000 },
      })
    ).json();
    const reminder = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${v.id}/reminders`,
        payload: { title: 'Oil', dueMode: 'distance', dueOdometer: 70_000, intervalDistance: 5000 },
      })
    ).json();
    const rec = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${v.id}/records`,
        payload: {
          kind: 'service',
          date: '2026-01-01',
          odometer: 65_000,
          title: 'Oil',
          tags: ['oil'],
          parts: [{ partId: part.id, quantity: 1000 }],
          completesReminderIds: [reminder.id],
        },
      })
    ).json();
    const pdf = multipartFile('file', 'r.pdf', tinyPdf, 'application/pdf');
    await t.req({
      method: 'POST',
      url: `/api/v1/records/${rec.id}/attachments`,
      payload: pdf.payload,
      headers: pdf.headers,
    });
    const friend = await t.user('friend');
    await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${v.id}/shares/${friend.user.id}`,
      payload: { permission: 'view' },
    });

    const backup = await t.req({ method: 'GET', url: '/api/v1/backup' });
    expect(backup.statusCode).toBe(200);
    expect(backup.headers['content-type']).toBe('application/zip');
    // Alongside the JSON, every vehicle's records come as a plain CSV anyone can open.
    const inside = unzipSync(new Uint8Array(backup.rawPayload));
    const csvName = Object.keys(inside).find((f) => f.startsWith('csv/'));
    expect(csvName).toMatch(new RegExp(`^csv/${v.id}-[a-z0-9-]+\\.csv$`));
    const csvText = strFromU8(inside[csvName as string] as Uint8Array);
    expect(csvText.split('\r\n')[0]).toBe(
      'date,odometer,kind,title,cost,notes,tags,expense_category,fuel_volume,price_per_unit,full_tank,missed_previous,fuel_grade,station',
    );
    expect(csvText.trim().split('\r\n').length).toBeGreaterThan(1);

    // Restoring onto a non-empty instance is refused.
    const zip = multipartFile('file', 'backup.zip', backup.rawPayload, 'application/zip');
    expect(
      (
        await t.req({
          method: 'POST',
          url: '/api/v1/backup/restore',
          payload: zip.payload,
          headers: zip.headers,
        })
      ).statusCode,
    ).toBe(409);

    const fresh = await createTestApp();
    try {
      const res = await fresh.req({
        method: 'POST',
        url: '/api/v1/backup/restore',
        payload: zip.payload,
        headers: zip.headers,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().restored).toMatchObject({
        vehicles: 1,
        records: 1,
        attachments: 1,
        parts: 1,
        reminders: 1,
        vehicle_shares: 1,
        inspections: 1,
      });

      const [garage] = (await fresh.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
      expect(garage).toMatchObject({ nickname: 'Taco', currentOdometer: 65_000 });
      const img = await fresh.req({ method: 'GET', url: garage.photoUrl });
      expect(img.rawPayload.equals(tinyPng)).toBe(true);
      const [restored] = (
        await fresh.req({ method: 'GET', url: `/api/v1/vehicles/${garage.id}/records` })
      ).json().items;
      expect(restored).toMatchObject({
        title: 'Oil',
        tags: ['oil'],
        parts: [{ name: 'Filter', quantity: 1000 }],
      });
      expect(restored.completedReminderIds).toHaveLength(1);
      const file = await fresh.req({ method: 'GET', url: restored.attachments[0].url });
      expect(file.rawPayload.equals(tinyPdf)).toBe(true);
      const [inspection] = (
        await fresh.req({ method: 'GET', url: `/api/v1/vehicles/${garage.id}/inspections` })
      ).json();
      expect(inspection).toMatchObject({ defects: 1, items: [{ note: 'Marker out' }] });
      const [rem] = (await fresh.req({ method: 'GET', url: '/api/v1/reminders' })).json();
      expect(rem.dueOdometer).toBe(70_000);
      // The existing "admin" account was matched, the friend was created with their share.
      const users = (await fresh.req({ method: 'GET', url: '/api/v1/users' })).json();
      expect(users.map((u: { username: string }) => u.username).sort()).toEqual([
        'admin',
        'friend',
      ]);
    } finally {
      await fresh.close();
    }
  });

  it('rejects files that are not backups, and is admin-only', async () => {
    t = await createTestApp();
    const junk = multipartFile('file', 'x.zip', Buffer.from('not a zip'), 'application/zip');
    expect(
      (
        await t.req({
          method: 'POST',
          url: '/api/v1/backup/restore',
          payload: junk.payload,
          headers: junk.headers,
        })
      ).statusCode,
    ).toBe(415);
    const ed = await t.user('ed');
    expect(
      (
        await ed.req({
          method: 'POST',
          url: '/api/v1/backup/restore',
          payload: junk.payload,
          headers: junk.headers,
        })
      ).statusCode,
    ).toBe(403);
    // Non-admins can still download their own data.
    expect((await ed.req({ method: 'GET', url: '/api/v1/backup' })).statusCode).toBe(200);
  });
});
