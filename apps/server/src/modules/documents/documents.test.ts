import { addDays, today } from '@axlebook/shared';
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
let v: number;
const now = today('UTC');
beforeAll(async () => {
  t = await createTestApp();
  v = (
    await t.req({
      method: 'POST',
      url: '/api/v1/vehicles',
      payload: vehicleBody({ nickname: 'Rig' }),
    })
  ).json().id;
});
afterAll(() => t.close());

const add = (payload: Record<string, unknown>) =>
  t.req({ method: 'POST', url: `/api/v1/vehicles/${v}/documents`, payload });

describe('vehicle documents', () => {
  it('lists them by urgency: expired, expiring soon, then the rest', async () => {
    const inputs = [
      { type: 'insurance', title: 'Policy', number: ' PN-123 ', expiresOn: addDays(now, 200) },
      { type: 'registration', title: 'Plates', expiresOn: addDays(now, 12) },
      { type: 'dot_inspection', title: 'Annual DOT', expiresOn: addDays(now, -3) },
      { type: 'other', title: 'Title deed' },
      { type: 'permit', title: 'Oversize permit', expiresOn: now },
    ];
    for (const d of inputs) expect((await add(d)).statusCode).toBe(201);
    const list = (await t.req({ method: 'GET', url: `/api/v1/vehicles/${v}/documents` })).json();
    expect(
      list.map((d: { title: string; status: string; daysLeft: number | null }) => [
        d.title,
        d.status,
        d.daysLeft,
      ]),
    ).toEqual([
      ['Annual DOT', 'overdue', -3],
      // Expiring today is still valid today.
      ['Oversize permit', 'due_soon', 0],
      ['Plates', 'due_soon', 12],
      ['Policy', 'upcoming', 200],
      ['Title deed', 'upcoming', null],
    ]);
    expect(list[3]).toMatchObject({ number: 'PN-123', vehicleTitle: 'Rig', file: null });
    // The garage-wide list is the same set.
    expect((await t.req({ method: 'GET', url: '/api/v1/documents' })).json()).toHaveLength(5);
  });

  it('validates the type, title and date', async () => {
    for (const bad of [
      { type: 'passport', title: 'x' },
      { type: 'permit', title: '' },
      { type: 'permit', title: 'x', expiresOn: '2025-13-01' },
    ])
      expect((await add(bad)).statusCode).toBe(400);
  });

  it('stores a scan, serves it sandboxed, replaces it and removes it', async () => {
    const id = (await add({ type: 'insurance', title: 'Card' })).json().id;
    const put = (data: Buffer, name: string, type: string) =>
      t.req({
        method: 'PUT',
        url: `/api/v1/documents/${id}/file`,
        ...multipartFile('file', name, data, type),
      });
    const first = (await put(tinyPdf, 'card 2026.pdf', 'application/pdf')).json();
    expect(first.file).toMatchObject({
      name: 'card 2026.pdf',
      mimeType: 'application/pdf',
      size: tinyPdf.length,
    });
    const res = await t.req({ method: 'GET', url: first.file.url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.rawPayload.equals(tinyPdf)).toBe(true);

    // The declared type is ignored; what the bytes are decides.
    const replaced = (await put(tinyPng, 'card.pdf', 'application/pdf')).json();
    expect(replaced.file.mimeType).toBe('image/png');
    expect(replaced.file.url).not.toBe(first.file.url);
    expect(
      (await put(Buffer.from('MZ not a document'), 'x.pdf', 'application/pdf')).statusCode,
    ).toBe(415);

    const cleared = (await t.req({ method: 'DELETE', url: `/api/v1/documents/${id}/file` })).json();
    expect(cleared.file).toBeNull();
    expect((await t.req({ method: 'GET', url: `/api/v1/documents/${id}/file` })).statusCode).toBe(
      404,
    );
    expect((await t.req({ method: 'DELETE', url: `/api/v1/documents/${id}` })).statusCode).toBe(
      204,
    );
  });

  it('renews a document and keeps other people out', async () => {
    const id = (
      await add({ type: 'registration', title: 'Trailer plate', expiresOn: addDays(now, -1) })
    ).json().id;
    const renewed = (
      await t.req({
        method: 'PATCH',
        url: `/api/v1/documents/${id}`,
        payload: { type: 'registration', title: 'Trailer plate', expiresOn: addDays(now, 365) },
      })
    ).json();
    expect(renewed).toMatchObject({ status: 'upcoming', daysLeft: 365 });
    const stranger = await t.user('nosy');
    for (const req of [
      { method: 'GET', url: `/api/v1/vehicles/${v}/documents` },
      { method: 'GET', url: `/api/v1/documents/${id}/file` },
      { method: 'DELETE', url: `/api/v1/documents/${id}` },
    ] as const)
      expect((await stranger.req(req)).statusCode).toBe(404);
    expect((await stranger.req({ method: 'GET', url: '/api/v1/documents' })).json()).toEqual([]);
  });

  it('comes back from a backup with its scan, and loses its file with the vehicle', async () => {
    const id = (await add({ type: 'permit', title: 'Fuel permit' })).json().id;
    await t.req({
      method: 'PUT',
      url: `/api/v1/documents/${id}/file`,
      ...multipartFile('file', 'permit.pdf', tinyPdf, 'application/pdf'),
    });
    const row = await t.db
      .selectFrom('vehicle_documents')
      .select('storage_key')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const { unzipSync } = await import('fflate');
    const zip = unzipSync(
      new Uint8Array((await t.req({ method: 'GET', url: '/api/v1/backup' })).rawPayload),
    );
    expect(Buffer.from(zip[`attachments/${row.storage_key}`] as Uint8Array).equals(tinyPdf)).toBe(
      true,
    );
    const fs = await import('node:fs');
    const path = `${t.dataDir}/attachments/${row.storage_key}`;
    expect(fs.existsSync(path)).toBe(true);
    await t.req({ method: 'DELETE', url: `/api/v1/vehicles/${v}` });
    expect(fs.existsSync(path)).toBe(false);
  });
});
