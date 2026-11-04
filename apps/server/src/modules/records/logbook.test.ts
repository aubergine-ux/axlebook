import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  multipartFile,
  type TestApp,
  tinyPdf,
  tinyPng,
  vehicleBody,
} from '../../test/helpers';

let t: TestApp;
let vid: number;
beforeAll(async () => {
  t = await createTestApp();
  vid = (await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })).json()
    .id;
});
afterAll(() => t.close());

const post = (payload: Record<string, unknown>, vehicleId = vid) =>
  t.req({ method: 'POST', url: `/api/v1/vehicles/${vehicleId}/records`, payload });
const fuel = (odometer: number, gallons: number, extra: Record<string, unknown> = {}) =>
  post({
    kind: 'fuel',
    date: '2026-02-01',
    odometer,
    fuel: { volume: gallons * 1000, pricePerUnit: 3_499, ...extra },
  });

describe('records', () => {
  it('creates a service record with tags and links an odometer reading', async () => {
    const res = await post({
      kind: 'service',
      date: '2026-01-10',
      odometer: 61_000,
      title: 'Oil change',
      cost: 64_180,
      tags: ['Oil', 'maintenance', 'oil'],
      notes: '0W-20',
    });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r).toMatchObject({
      kind: 'service',
      title: 'Oil change',
      cost: 64_180,
      tags: ['maintenance', 'Oil'],
      fuel: null,
    });
    const log = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/odometer` })).json();
    expect(log.find((o: { recordId: number }) => o.recordId === r.id)).toMatchObject({
      odometer: 61_000,
      recordKind: 'service',
    });
  });

  it('validates per kind', async () => {
    expect((await post({ kind: 'repair', date: '2026-01-01' })).statusCode).toBe(400); // needs a title
    expect((await post({ kind: 'fuel', date: '2026-01-01', odometer: 1 })).statusCode).toBe(400); // needs fuel
    expect(
      (await post({ kind: 'fuel', date: '2026-01-01', fuel: { volume: 1000 } })).statusCode,
    ).toBe(400); // needs odometer
    expect((await post({ kind: 'service', date: '2026-13-01', title: 'x' })).statusCode).toBe(400);
    expect(
      (await post({ kind: 'service', date: '2026-01-01', title: 'x', cost: -5 })).statusCode,
    ).toBe(400);
  });

  it('derives fuel cost from volume × price when no total is given', async () => {
    const r = (await fuel(61_100, 10)).json();
    expect(r.cost).toBe(34_990);
    expect(r.title).toBeNull();
    expect(r.fuel).toMatchObject({
      volume: 10_000,
      pricePerUnit: 3_499,
      isFull: true,
      missedPrevious: false,
    });
  });

  it('defaults expenses to the "other" category', async () => {
    const r = (
      await post({ kind: 'expense', date: '2026-01-05', title: 'Car wash', cost: 12_000 })
    ).json();
    expect(r.expenseCategory).toBe('other');
  });

  it('is idempotent on clientId (offline sync retries)', async () => {
    const clientId = randomUUID();
    const a = (
      await post({ kind: 'service', date: '2026-01-11', title: 'Wipers', clientId })
    ).json();
    const b = await post({ kind: 'service', date: '2026-01-11', title: 'Wipers', clientId });
    expect(b.statusCode).toBe(201);
    expect(b.json().id).toBe(a.id);
  });

  it('updates the record and its odometer reading; clearing the odometer removes the reading', async () => {
    const r = (
      await post({ kind: 'repair', date: '2026-01-12', odometer: 61_200, title: 'Fix', cost: 1000 })
    ).json();
    const put = await t.req({
      method: 'PUT',
      url: `/api/v1/records/${r.id}`,
      payload: {
        kind: 'repair',
        date: '2026-01-13',
        odometer: 61_250,
        title: 'Fixed',
        cost: 2000,
        tags: ['x'],
      },
    });
    expect(put.json()).toMatchObject({ title: 'Fixed', cost: 2000, odometer: 61_250, tags: ['x'] });
    let log = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/odometer` })).json();
    expect(log.find((o: { recordId: number }) => o.recordId === r.id)?.odometer).toBe(61_250);
    await t.req({
      method: 'PUT',
      url: `/api/v1/records/${r.id}`,
      payload: { kind: 'repair', date: '2026-01-13', title: 'Fixed', odometer: null },
    });
    log = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/odometer` })).json();
    expect(log.find((o: { recordId: number }) => o.recordId === r.id)).toBeUndefined();
  });

  it('refuses to turn a fuel record into another kind', async () => {
    const r = (await fuel(61_300, 5)).json();
    const res = await t.req({
      method: 'PUT',
      url: `/api/v1/records/${r.id}`,
      payload: { kind: 'service', date: '2026-01-01', title: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('searches by text, tag and kind across the garage', async () => {
    await post({
      kind: 'upgrade',
      date: '2026-01-20',
      title: 'Bilstein 5100 shocks',
      tags: ['suspension'],
      notes: 'front at notch 2',
      cost: 689_000,
    });
    const byText = (await t.req({ method: 'GET', url: '/api/v1/records?q=bilstein' })).json();
    expect(byText.items.map((i: { title: string }) => i.title)).toEqual(['Bilstein 5100 shocks']);
    expect((await t.req({ method: 'GET', url: '/api/v1/records?q=NOTCH' })).json().total).toBe(1);
    expect((await t.req({ method: 'GET', url: '/api/v1/records?q=susp' })).json().total).toBe(1); // tag text
    expect(
      (await t.req({ method: 'GET', url: '/api/v1/records?tag=SUSPENSION' })).json().total,
    ).toBe(1);
    expect((await t.req({ method: 'GET', url: '/api/v1/records?q=100%25' })).json().total).toBe(0); // % is literal
    const kinds = (
      await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/records?kind=upgrade,expense` })
    ).json();
    expect(new Set(kinds.items.map((i: { kind: string }) => i.kind))).toEqual(
      new Set(['upgrade', 'expense']),
    );
    expect(kinds.totalCost).toBe(689_000 + 12_000);
  });

  it('filters by date range and pages results', async () => {
    const url = `/api/v1/vehicles/${vid}/records?from=2026-01-10&to=2026-01-11&sort=date_asc&limit=1`;
    const first = (await t.req({ method: 'GET', url })).json();
    const second = (await t.req({ method: 'GET', url: `${url}&offset=1` })).json();
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect([first.items[0].date, second.items[0].date]).toEqual(['2026-01-10', '2026-01-11']);
  });

  it('deletes a record and its reading', async () => {
    const r = (
      await post({ kind: 'service', date: '2026-01-25', odometer: 61_400, title: 'Temp' })
    ).json();
    expect((await t.req({ method: 'DELETE', url: `/api/v1/records/${r.id}` })).statusCode).toBe(
      204,
    );
    expect((await t.req({ method: 'GET', url: `/api/v1/records/${r.id}` })).statusCode).toBe(404);
    const log = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/odometer` })).json();
    expect(log.find((o: { recordId: number }) => o.recordId === r.id)).toBeUndefined();
  });
});

describe('attachments', () => {
  it('stores receipts, serves them sandboxed, and deletes them', async () => {
    const r = (await post({ kind: 'repair', date: '2026-01-15', title: 'With receipt' })).json();
    const up = multipartFile('file', 'receipt.pdf', tinyPdf, 'application/pdf');
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/records/${r.id}/attachments`,
      payload: up.payload,
      headers: up.headers,
    });
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a).toMatchObject({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      size: tinyPdf.length,
    });

    const got = await t.req({ method: 'GET', url: a.url });
    expect(got.headers['content-type']).toBe('application/pdf');
    expect(got.headers['content-security-policy']).toMatch(/sandbox/);
    expect(got.rawPayload.equals(tinyPdf)).toBe(true);
    const dl = await t.req({ method: 'GET', url: `${a.url}?download=1` });
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/);

    expect(
      (await t.req({ method: 'GET', url: `/api/v1/records/${r.id}` })).json().attachments,
    ).toHaveLength(1);
    expect((await t.req({ method: 'DELETE', url: a.url })).statusCode).toBe(204);
    expect((await t.req({ method: 'GET', url: a.url })).statusCode).toBe(404);
  });

  it('rejects unknown file types and enforces the size limit', async () => {
    const r = (await post({ kind: 'repair', date: '2026-01-15', title: 'Bad file' })).json();
    const html = multipartFile(
      'file',
      'x.html',
      Buffer.from('<html><script>alert(1)</script>'),
      'text/html',
    );
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/records/${r.id}/attachments`,
      payload: html.payload,
      headers: html.headers,
    });
    expect(res.statusCode).toBe(415);

    const small = await createTestApp({ MAX_UPLOAD_MB: '0.0001' });
    try {
      const v = (
        await small.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
      ).json();
      const rec = (
        await small.req({
          method: 'POST',
          url: `/api/v1/vehicles/${v.id}/records`,
          payload: { kind: 'repair', date: '2026-01-01', title: 'x' },
        })
      ).json();
      const big = multipartFile(
        'file',
        'big.png',
        Buffer.concat([tinyPng, Buffer.alloc(500)]),
        'image/png',
      );
      const tooBig = await small.req({
        method: 'POST',
        url: `/api/v1/records/${rec.id}/attachments`,
        payload: big.payload,
        headers: big.headers,
      });
      expect(tooBig.statusCode).toBe(413);
    } finally {
      await small.close();
    }
  });
});

describe('fuel economy', () => {
  it('computes full-to-full economy, handles partial and missed fills, and costs per mile', async () => {
    const v = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Fuel test' }),
      })
    ).json().id;
    const f = (odometer: number, gallons: number, extra: Record<string, unknown> = {}) =>
      post(
        {
          kind: 'fuel',
          date: `2026-03-${String(odometer % 28 || 1).padStart(2, '0')}`,
          odometer,
          cost: gallons * 3_000,
          fuel: { volume: gallons * 1000, ...extra },
        },
        v,
      );
    await f(1000, 12);
    await f(1300, 10); // 30 mpg
    await f(1450, 4, { isFull: false });
    await f(1600, 6); // (300 mi / 10 gal) = 30 mpg
    await f(2200, 10, { missedPrevious: true }); // void
    await f(2450, 10); // 25 mpg

    const res = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/fuel-economy` })).json();
    expect(res.fills.map((x: { status: string }) => x.status)).toEqual([
      'ok',
      'missed',
      'ok',
      'partial',
      'ok',
      'baseline',
    ]);
    expect(res.fills[0].economy).toBeCloseTo(25);
    expect(res.average).toBeCloseTo(850 / 30);
    expect(res.last).toBeCloseTo(25);
    // Everything after the first fill over the distance covered since: (10+4+6+10+10)×$3 / 1450 mi
    expect(res.costPerDistance).toBeCloseTo((40 * 3000) / 1450);

    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage.find((g: { id: number }) => g.id === v)).toMatchObject({
      currentOdometer: 2450,
      costToDate: 52 * 3000,
    });
  });
});

describe('odometer log', () => {
  it('adds, edits and deletes manual readings but not record-linked ones', async () => {
    const add = await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${vid}/odometer`,
      payload: { date: '2026-04-01', odometer: 70_000, notes: 'Dash photo' },
    });
    expect(add.statusCode).toBe(201);
    const id = add.json().id;
    const put = await t.req({
      method: 'PUT',
      url: `/api/v1/odometer/${id}`,
      payload: { date: '2026-04-02', odometer: 70_010 },
    });
    expect(put.json()).toMatchObject({ odometer: 70_010, notes: null });
    const linked = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${vid}/odometer` }))
      .json()
      .find((o: { recordId: number | null }) => o.recordId);
    expect(
      (await t.req({ method: 'DELETE', url: `/api/v1/odometer/${linked.id}` })).statusCode,
    ).toBe(409);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/odometer/${id}` })).statusCode).toBe(204);
  });
});

describe('reminders', () => {
  let rv: number;
  beforeAll(async () => {
    rv = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Reminder test' }),
      })
    ).json().id;
    await post({ kind: 'service', date: '2026-01-01', odometer: 50_000, title: 'baseline' }, rv);
  });

  const create = (payload: Record<string, unknown>) =>
    t.req({ method: 'POST', url: `/api/v1/vehicles/${rv}/reminders`, payload });

  it('computes status against today and the current odometer, using instance defaults', async () => {
    const r = (await create({ title: 'Oil', dueMode: 'distance', dueOdometer: 49_700 })).json();
    expect(r).toMatchObject({
      status: 'overdue',
      distanceLeft: -300,
      soonDistance: 500,
      soonDays: 30,
    });
    const later = (
      await create({ title: 'Inspection', dueMode: 'date', dueDate: '2099-01-01' })
    ).json();
    expect(later.status).toBe('upcoming');
    expect((await create({ title: 'Bad', dueMode: 'date' })).statusCode).toBe(400);
    expect((await create({ title: 'Bad', dueMode: 'distance' })).statusCode).toBe(400);
  });

  it('lists the garage-wide reminders most urgent first', async () => {
    const all = (await t.req({ method: 'GET', url: '/api/v1/reminders' })).json();
    expect(all[0]).toMatchObject({
      title: 'Oil',
      status: 'overdue',
      vehicleTitle: '2015 Toyota Reminder test',
    });
    const garage = (await t.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage.find((g: { id: number }) => g.id === rv).nextReminder).toMatchObject({
      title: 'Oil',
      status: 'overdue',
    });
  });

  it('reschedules a recurring reminder from the completing record, and deleting the record undoes it', async () => {
    const r = (
      await create({
        title: 'Rotate tires',
        dueMode: 'either',
        dueDate: '2026-01-15',
        dueOdometer: 50_100,
        intervalMonths: 6,
        intervalDistance: 5000,
      })
    ).json();
    const rec = (
      await post(
        {
          kind: 'service',
          date: '2026-02-01',
          odometer: 50_200,
          title: 'Rotation',
          completesReminderIds: [r.id],
        },
        rv,
      )
    ).json();
    expect(rec.completedReminderIds).toEqual([r.id]);
    let after = (await t.req({ method: 'GET', url: `/api/v1/reminders/${r.id}` })).json();
    expect(after).toMatchObject({
      dueDate: '2026-08-01',
      dueOdometer: 55_200,
      lastCompletedAt: '2026-02-01',
      archivedAt: null,
    });

    await t.req({ method: 'DELETE', url: `/api/v1/records/${rec.id}` });
    after = (await t.req({ method: 'GET', url: `/api/v1/reminders/${r.id}` })).json();
    expect(after).toMatchObject({
      dueDate: '2026-01-15',
      dueOdometer: 50_100,
      lastCompletedAt: null,
    });
  });

  it('archives a one-off reminder when completed, and rejects reminders from other vehicles', async () => {
    const r = (
      await create({ title: 'Recall check', dueMode: 'date', dueDate: '2026-03-01' })
    ).json();
    const other = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Other' }),
      })
    ).json().id;
    const wrong = await post(
      { kind: 'service', date: '2026-02-02', title: 'x', completesReminderIds: [r.id] },
      other,
    );
    expect(wrong.statusCode).toBe(400);
    const done = (
      await t.req({
        method: 'POST',
        url: `/api/v1/reminders/${r.id}/complete`,
        payload: { date: '2026-02-02' },
      })
    ).json();
    expect(done.archivedAt).not.toBeNull();
    expect(done.status).toBe('inactive');
  });

  it('marks done without a record using the current odometer', async () => {
    const r = (
      await create({
        title: 'Wipers',
        dueMode: 'distance',
        dueOdometer: 50_000,
        intervalDistance: 10_000,
      })
    ).json();
    const done = (
      await t.req({
        method: 'POST',
        url: `/api/v1/reminders/${r.id}/complete`,
        payload: { date: '2026-02-03' },
      })
    ).json();
    expect(done.dueOdometer).toBe(60_000);
  });

  it('updates, archives and deletes', async () => {
    const r = (await create({ title: 'Coolant', dueMode: 'date', dueDate: '2027-01-01' })).json();
    const put = await t.req({
      method: 'PUT',
      url: `/api/v1/reminders/${r.id}`,
      payload: { title: 'Coolant flush', dueMode: 'date', dueDate: '2027-02-01', soonDays: 10 },
    });
    expect(put.json()).toMatchObject({ title: 'Coolant flush', soonDays: 10 });
    expect(
      (await t.req({ method: 'POST', url: `/api/v1/reminders/${r.id}/archive` })).json().status,
    ).toBe('inactive');
    expect(
      (await t.req({ method: 'GET', url: `/api/v1/vehicles/${rv}/reminders?archived=true` }))
        .json()
        .some((x: { id: number }) => x.id === r.id),
    ).toBe(true);
    expect((await t.req({ method: 'DELETE', url: `/api/v1/reminders/${r.id}` })).statusCode).toBe(
      204,
    );
  });
});
