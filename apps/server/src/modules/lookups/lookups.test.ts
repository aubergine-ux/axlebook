import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Lookups, NhtsaLookups, tidyMake } from '../../lib/nhtsa';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

/** A stand-in for NHTSA on localhost, answering with the shapes the real services use. */
let server: http.Server;
let base: string;
const seen: string[] = [];
beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push(req.url ?? '');
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (url.pathname.startsWith('/vehicles/DecodeVinValues/')) {
      const vin = url.pathname.split('/').pop();
      if (vin === '5TFAX5GN0FX000001')
        return json(200, {
          Count: 1,
          Results: [
            {
              Make: 'TOYOTA',
              Model: 'Tacoma',
              ModelYear: '2015',
              Trim: '',
              Series: 'SR5',
              DisplacementL: '4.0',
              EngineCylinders: '6',
              EngineModel: '1GR-FE',
              FuelTypePrimary: 'Gasoline',
              FuelTypeSecondary: '',
              ElectrificationLevel: 'Not Applicable',
              VehicleType: 'TRUCK',
              BodyClass: 'Pickup',
              ErrorCode: '0',
            },
          ],
        });
      if (vin === '5YJ3E1EA7JF000001')
        return json(200, {
          Results: [
            {
              Make: 'TESLA',
              Model: 'Model 3',
              ModelYear: '2018',
              FuelTypePrimary: 'Electric',
              ElectrificationLevel: 'BEV (Battery Electric Vehicle)',
              VehicleType: 'PASSENGER CAR',
            },
          ],
        });
      if (vin === 'BR0KENJS0N0000001') return json(200, '<html>maintenance</html>');
      if (vin === 'D0WN0000000000001') return json(503, {});
      return json(200, { Results: [{ Make: '', Model: '', ModelYear: '', ErrorCode: '8' }] });
    }
    if (url.pathname === '/recalls/recallsByVehicle') {
      if (url.searchParams.get('make') === 'Nobody') return json(400, { message: 'no results' });
      return json(200, {
        Count: 3,
        results: [
          {
            NHTSACampaignNumber: '16V340000',
            ReportReceivedDate: '25/05/2016',
            Component: 'AIR BAGS:FRONTAL:PASSENGER SIDE:INFLATOR MODULE',
            Summary: 'The inflator may rupture.',
            Consequence: 'Metal fragments may strike occupants.',
            Remedy: 'Dealers will replace the inflator, free of charge.',
          },
          // The API repeats a campaign per affected component now and then.
          { NHTSACampaignNumber: '16V340000', ReportReceivedDate: '25/05/2016' },
          {
            NHTSACampaignNumber: '19V005000',
            ReportReceivedDate: '09/01/2019',
            Component: 'SUSPENSION',
          },
          { Summary: 'no campaign number' },
        ],
      });
    }
    json(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const client = () => new NhtsaLookups({ vpic: base, recalls: base }, 2000);

describe('NHTSA client', () => {
  it('decodes a VIN into the fields a vehicle needs', async () => {
    expect(await client().decodeVin('5TFAX5GN0FX000001')).toEqual({
      vin: '5TFAX5GN0FX000001',
      year: 2015,
      make: 'Toyota',
      model: 'Tacoma',
      trim: 'SR5',
      engine: '4.0L 6-cyl 1GR-FE',
      fuelType: 'gasoline',
      category: 'car',
    });
    expect(await client().decodeVin('5YJ3E1EA7JF000001')).toMatchObject({
      make: 'Tesla',
      fuelType: 'electric',
      engine: null,
      trim: null,
    });
  });

  it('says so when a VIN decodes to nothing, the service is down, or it answers nonsense', async () => {
    await expect(client().decodeVin('AAAAAAAAAAAAAAAAA')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(client().decodeVin('D0WN0000000000001')).rejects.toMatchObject({
      code: 'lookup_failed',
      params: { reason: 'status', status: 503 },
    });
    await expect(client().decodeVin('BR0KENJS0N0000001')).rejects.toMatchObject({
      code: 'lookup_failed',
      params: { reason: 'not_json' },
    });
    const nowhere = new NhtsaLookups({ vpic: 'http://127.0.0.1:9', recalls: base }, 500);
    await expect(nowhere.decodeVin('5TFAX5GN0FX000001')).rejects.toMatchObject({
      code: 'lookup_failed',
      params: { reason: 'unreachable' },
    });
  });

  it('lists recalls once each, with ISO dates, and nothing for an unknown make', async () => {
    const list = await client().recalls('Toyota', 'Tacoma', 2015);
    expect(list.map((r) => [r.campaign, r.reportDate])).toEqual([
      ['16V340000', '2016-05-25'],
      ['19V005000', '2019-01-09'],
    ]);
    expect(list[0]).toMatchObject({ remedy: 'Dealers will replace the inflator, free of charge.' });
    expect(seen.at(-1)).toBe('/recalls/recallsByVehicle?make=Toyota&model=Tacoma&modelYear=2015');
    expect(await client().recalls('Nobody', 'Nothing', 1990)).toEqual([]);
  });

  it('tidies shouted makes but leaves initials alone', () => {
    expect(['TOYOTA', 'MERCEDES-BENZ', 'LAND ROVER', 'BMW', 'GMC', 'Tesla'].map(tidyMake)).toEqual([
      'Toyota',
      'Mercedes-Benz',
      'Land Rover',
      'BMW',
      'GMC',
      'Tesla',
    ]);
  });
});

describe('VIN and recall lookups', () => {
  let t: TestApp;
  afterEach(() => t?.close());
  const on = () =>
    t.req({ method: 'PATCH', url: '/api/v1/settings', payload: { onlineLookups: true } });

  it('stays offline until an admin switches lookups on', async () => {
    let calls = 0;
    const counting: Lookups = {
      decodeVin: async () => {
        calls++;
        throw new Error('should not be called');
      },
      recalls: async () => {
        calls++;
        return [];
      },
    };
    t = await createTestApp({}, { lookups: counting });
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    expect((await t.anon({ method: 'GET', url: '/api/v1/config' })).json().onlineLookups).toBe(
      false,
    );
    for (const req of [
      { method: 'POST', url: '/api/v1/lookups/vin', payload: { vin: '5TFAX5GN0FX000001' } },
      { method: 'POST', url: `/api/v1/vehicles/${v}/recalls/check` },
    ] as const) {
      const res = await t.req(req);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('lookups_disabled');
    }
    // Reading what's stored works either way, and says lookups are off.
    expect((await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/recalls` })).json()).toEqual({
      enabled: false,
      checkedAt: null,
      recalls: [],
    });
    expect(calls).toBe(0);

    // Only an admin can change that.
    const ed = await t.user('ed', 'editor');
    expect(
      (await ed.req({ method: 'PATCH', url: '/api/v1/settings', payload: { onlineLookups: true } }))
        .statusCode,
    ).toBe(403);
    expect((await on()).json().onlineLookups).toBe(true);
    expect((await t.anon({ method: 'GET', url: '/api/v1/config' })).json().onlineLookups).toBe(
      true,
    );
  });

  it('decodes a VIN, rejects malformed ones, and keeps viewers out', async () => {
    t = await createTestApp({}, { lookups: client() });
    await on();
    const url = '/api/v1/lookups/vin';
    const ok = await t.req({ method: 'POST', url, payload: { vin: ' 5tfax5gn0fx000001 ' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ year: 2015, make: 'Toyota', model: 'Tacoma', trim: 'SR5' });
    // 16 characters, and one with an O in it: never sent anywhere.
    const before = seen.length;
    for (const vin of ['5TFAX5GN0FX00000', '5TFAX5GN0FXO00001', ''])
      expect((await t.req({ method: 'POST', url, payload: { vin } })).statusCode).toBe(400);
    expect(seen.length).toBe(before);
    expect(
      (await t.req({ method: 'POST', url, payload: { vin: 'AAAAAAAAAAAAAAAAA' } })).statusCode,
    ).toBe(404);
    const viewer = await t.user('vic', 'viewer');
    expect(
      (await viewer.req({ method: 'POST', url, payload: { vin: '5TFAX5GN0FX000001' } })).statusCode,
    ).toBe(403);
  });

  it('stores recalls, keeps what was done about them across checks, and backs them up', async () => {
    t = await createTestApp({}, { lookups: client() });
    await on();
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ year: 2015, make: 'Toyota', model: 'Tacoma' }),
      })
    ).json().id;
    const first = (
      await t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/recalls/check` })
    ).json();
    expect(first.enabled).toBe(true);
    expect(first.checkedAt).toEqual(expect.any(String));
    expect(
      first.recalls.map((r: { campaign: string; state: string }) => [r.campaign, r.state]),
    ).toEqual([
      ['19V005000', 'open'],
      ['16V340000', 'open'],
    ]);
    const airbag = first.recalls[1];
    const done = await t.req({
      method: 'PATCH',
      url: `/api/v1/recalls/${airbag.id}`,
      payload: { state: 'completed' },
    });
    expect(done.json()).toMatchObject({ state: 'completed', stateAt: expect.any(String) });

    // Checking again finds the same two: nothing duplicated, and the finished one stays finished.
    const again = (
      await t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/recalls/check` })
    ).json();
    expect(again.recalls).toHaveLength(2);
    expect(again.recalls.map((r: { state: string }) => r.state)).toEqual(['open', 'completed']);

    const reopened = await t.req({
      method: 'PATCH',
      url: `/api/v1/recalls/${airbag.id}`,
      payload: { state: 'open' },
    });
    expect(reopened.json()).toMatchObject({ state: 'open', stateAt: null });
    expect(
      (
        await t.req({
          method: 'PATCH',
          url: `/api/v1/recalls/${airbag.id}`,
          payload: { state: 'fixed' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await t.req({ method: 'PATCH', url: '/api/v1/recalls/99999', payload: { state: 'open' } }))
        .statusCode,
    ).toBe(404);

    // A make NHTSA doesn't know (anything not sold in the US) is simply "none found".
    const other = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ make: 'Nobody', model: 'Nothing' }),
      })
    ).json().id;
    expect(
      (await t.req({ method: 'POST', url: `/api/v1/vehicles/${other}/recalls/check` })).json()
        .recalls,
    ).toEqual([]);
  });

  it('reports a lookup that fails without losing what was stored', async () => {
    const flaky: Lookups = {
      decodeVin: client().decodeVin.bind(client()),
      recalls: async () => {
        throw new (await import('../../lib/errors')).AppError('lookup_failed', {
          reason: 'unreachable',
        });
      },
    };
    t = await createTestApp({}, { lookups: flaky });
    await on();
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const res = await t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/recalls/check` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toEqual({ code: 'lookup_failed', params: { reason: 'unreachable' } });
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/recalls` })).json().checkedAt,
    ).toBeNull();
  });

  it('rechecks weekly on its own, and tells people about recalls that are new', async () => {
    const calls: string[] = [];
    let found = [{ campaign: '16V340000', component: 'AIR BAGS' }];
    const lookups: Lookups = {
      decodeVin: client().decodeVin.bind(client()),
      recalls: async (make) => {
        calls.push(make);
        if (make === 'Flaky') throw new Error('down');
        return found.map((r) => ({
          ...r,
          summary: null,
          consequence: null,
          remedy: null,
          reportDate: null,
        }));
      },
    };
    t = await createTestApp({}, { lookups });
    const hooks: Record<string, unknown>[] = [];
    const hook = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hooks.push(JSON.parse(body));
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => hook.listen(0, '127.0.0.1', r));
    await t.req({
      method: 'POST',
      url: '/api/v1/me/channels',
      payload: {
        name: 'Hook',
        config: {
          type: 'webhook',
          url: `http://127.0.0.1:${(hook.address() as AddressInfo).port}/`,
        },
      },
    });
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Taco' }),
      })
    ).json().id;
    await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: vehicleBody({ make: 'Flaky' }),
    });
    const scan = (iso: string) => t.app.services.notifications.scan(new Date(iso));
    const recalls = async () =>
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/recalls` })).json();

    // Lookups are off: a scan contacts nothing.
    await scan('2030-01-01T12:00:00Z');
    expect(calls).toEqual([]);

    await on();
    await scan('2030-01-01T13:00:00Z');
    expect(calls.sort()).toEqual(['Flaky', 'Toyota']);
    expect((await recalls()).recalls).toHaveLength(1);
    expect(hooks).toMatchObject([
      { event: 'recall.new', title: 'Safety recall: 1 new for the Taco' },
    ]);

    // An hour later nothing is due except the lookup that failed, and nobody is told twice.
    calls.length = 0;
    await scan('2030-01-01T14:00:00Z');
    expect(calls).toEqual(['Flaky']);
    expect(hooks).toHaveLength(1);

    // A week on, a second campaign has been published: only that one is announced.
    found = [...found, { campaign: '30V001000', component: 'BRAKES' }];
    calls.length = 0;
    await scan('2030-01-08T13:00:01Z');
    expect(calls.sort()).toEqual(['Flaky', 'Toyota']);
    expect((await recalls()).recalls).toHaveLength(2);
    expect(hooks).toHaveLength(2);
    expect(hooks[1]).toMatchObject({ title: 'Safety recall: 1 new for the Taco' });
    await new Promise((r) => hook.close(r));
  });
});
