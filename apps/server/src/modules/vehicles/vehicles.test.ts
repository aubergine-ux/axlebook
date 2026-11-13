import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nowIso } from '../../lib/time';
import { createTestApp, multipartFile, tinyPng } from '../../test/helpers';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const tacoma = {
  year: 2015,
  make: 'Toyota',
  model: 'Tacoma',
  trim: 'SR5',
  vin: '3tmcz5an1fm000001',
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  purchasePrice: 24_500_000,
} as const;

async function create(body: Record<string, unknown> = tacoma) {
  const res = await t.req({
    method: 'POST',
    url: '/api/v1/vehicles',
    payload: body,
  });
  return res;
}

describe('vehicles API', () => {
  it('creates a vehicle and normalizes fields', async () => {
    const res = await create({ ...tacoma, nickname: '  ', color: ' Silver ' });
    expect(res.statusCode).toBe(201);
    const v = res.json();
    expect(v).toMatchObject({
      year: 2015,
      make: 'Toyota',
      trim: 'SR5',
      nickname: null,
      color: 'Silver',
      vin: '3TMCZ5AN1FM000001',
      purchasePrice: 24_500_000,
      access: 'owner',
      archivedAt: null,
      photoUrl: null,
    });
  });

  it('rejects invalid input with field issues', async () => {
    const res = await create({ ...tacoma, year: 1700, make: '' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('validation_failed');
    const paths = body.error.params.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['/year', '/make']));
  });

  it('rejects unknown units', async () => {
    const res = await create({ ...tacoma, odometerUnit: 'furlongs' });
    expect(res.statusCode).toBe(400);
  });

  it('lists active vehicles with garage figures', async () => {
    const res = await t.req({ method: 'GET', url: '/api/v1/vehicles' });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toMatchObject({ currentOdometer: null, costToDate: 0, nextReminder: null });
  });

  it('updates only the provided fields', async () => {
    const id = (await create()).json().id;
    const res = await t.req({
      method: 'PATCH',
      url: `/api/v1/vehicles/${id}`,
      payload: { nickname: 'Taco', purchasePrice: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nickname: 'Taco', purchasePrice: null, make: 'Toyota' });
  });

  it('keeps the parts-and-fluids sheet, engine, use and value', async () => {
    const created = (await create()).json();
    // A vehicle from before these fields existed reads back with safe defaults.
    expect(created).toMatchObject({ usage: 'personal', engine: null, currentValue: null });
    expect(created.specs).toMatchObject({ oilType: null, tireSize: null, other: [] });

    const url = `/api/v1/vehicles/${created.id}`;
    const saved = (
      await t.req({
        method: 'PATCH',
        url,
        payload: {
          engine: ' 4.0L V6 ',
          usage: 'business',
          currentValue: 14_000_000,
          specs: {
            oilType: ' 0W-20 full synthetic ',
            oilCapacity: '6.2 qt',
            oilFilter: 'Toyota 04152-YZZA5',
            tireSize: '265/70R16',
            wiperDriver: '',
            other: [{ label: 'Lug nut torque', value: '83 lb-ft' }],
          },
        },
      })
    ).json();
    expect(saved).toMatchObject({
      engine: '4.0L V6',
      usage: 'business',
      currentValue: 14_000_000,
      specs: {
        oilType: '0W-20 full synthetic',
        oilCapacity: '6.2 qt',
        oilFilter: 'Toyota 04152-YZZA5',
        tireSize: '265/70R16',
        wiperDriver: null,
        other: [{ label: 'Lug nut torque', value: '83 lb-ft' }],
      },
    });
    // Changing something else leaves the sheet alone; sending the sheet replaces it whole.
    expect(
      (await t.req({ method: 'PATCH', url, payload: { color: 'Red' } })).json().specs.oilType,
    ).toBe('0W-20 full synthetic');
    const replaced = (
      await t.req({ method: 'PATCH', url, payload: { specs: { battery: 'Group 24F' } } })
    ).json();
    expect(replaced.specs).toMatchObject({ battery: 'Group 24F', oilType: null, other: [] });
    for (const specs of [{ oilType: 'x'.repeat(81) }, { other: [{ label: '', value: 'x' }] }])
      expect((await t.req({ method: 'PATCH', url, payload: { specs } })).statusCode).toBe(400);
    expect((await t.req({ method: 'PATCH', url, payload: { usage: 'rental' } })).statusCode).toBe(
      400,
    );
  });

  it('archives and unarchives, filtering the list', async () => {
    const id = (await create({ ...tacoma, model: 'Archived One' })).json().id;
    const archived = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${id}/archive`,
    });
    expect(archived.json().archivedAt).not.toBeNull();

    const active = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(active.map((v: { id: number }) => v.id)).not.toContain(id);
    const onlyArchived = (
      await t.req({ method: 'GET', url: '/api/v1/vehicles?archived=true' })
    ).json();
    expect(onlyArchived.map((v: { id: number }) => v.id)).toEqual([id]);

    const restored = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${id}/unarchive`,
    });
    expect(restored.json().archivedAt).toBeNull();
  });

  it('returns 404 for missing vehicles', async () => {
    const res = await t.req({ method: 'GET', url: '/api/v1/vehicles/99999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('hides other users’ vehicles from non-admins', async () => {
    const ts = nowIso();
    const other = await t.db
      .insertInto('users')
      .values({
        username: 'neighbor',
        role: 'editor',
        theme: 'system',
        disabled: 0,
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const theirs = await t.db
      .insertInto('vehicles')
      .values({
        owner_id: other.id,
        year: 2010,
        make: 'Ford',
        model: 'Ranger',
        odometer_unit: 'mi',
        fuel_unit: 'gal_us',
        fuel_type: 'gasoline',
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    // The bootstrap owner is an admin, so the vehicle is reachable by id but not listed in the garage.
    const list = (await t.req({ method: 'GET', url: '/api/v1/vehicles?archived=all' })).json();
    expect(list.map((v: { id: number }) => v.id)).not.toContain(theirs.id);
    const direct = await t.req({ method: 'GET', url: `/api/v1/vehicles/${theirs.id}` });
    expect(direct.statusCode).toBe(200);
  });

  it('uploads, serves, replaces and removes a photo', async () => {
    const id = (await create()).json().id;
    const upload = multipartFile('file', 'truck.png', tinyPng, 'image/png');
    const put = await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${id}/photo`,
      payload: upload.payload,
      headers: upload.headers,
    });
    expect(put.statusCode).toBe(200);
    const photoUrl = put.json().photoUrl as string;
    expect(photoUrl).toMatch(new RegExp(`^/api/v1/vehicles/${id}/photo\\?v=`));

    const get = await t.req({ method: 'GET', url: photoUrl });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.rawPayload.equals(tinyPng)).toBe(true);

    const replaced = await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${id}/photo`,
      payload: upload.payload,
      headers: upload.headers,
    });
    expect(replaced.json().photoUrl).not.toBe(photoUrl);

    const del = await t.req({
      method: 'DELETE',
      url: `/api/v1/vehicles/${id}/photo`,
    });
    expect(del.json().photoUrl).toBeNull();
    const gone = await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}/photo` });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects uploads that are not images, whatever the declared type', async () => {
    const id = (await create()).json().id;
    const fake = multipartFile(
      'file',
      'evil.png',
      Buffer.from('<script>alert(1)</script>'),
      'image/png',
    );
    const res = await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${id}/photo`,
      payload: fake.payload,
      headers: fake.headers,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.params).toMatchObject({ field: 'file', reason: 'not_an_image' });
  });

  it('deletes a vehicle permanently', async () => {
    const id = (await create()).json().id;
    const del = await t.req({
      method: 'DELETE',
      url: `/api/v1/vehicles/${id}`,
    });
    expect(del.statusCode).toBe(204);
    const get = await t.req({ method: 'GET', url: `/api/v1/vehicles/${id}` });
    expect(get.statusCode).toBe(404);
  });

  it('documents vehicle routes in OpenAPI', async () => {
    const doc = (await t.req({ method: 'GET', url: '/api/openapi.json' })).json();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/vehicles',
        '/api/v1/vehicles/{id}',
        '/api/v1/vehicles/{id}/photo',
      ]),
    );
    expect(doc.components.schemas).toHaveProperty('Vehicle');
  });
});
