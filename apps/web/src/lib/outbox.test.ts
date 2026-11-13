import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discard, enqueue, listOutbox, syncOutbox } from './outbox';

const entry = (clientId: string) => ({
  clientId,
  vehicleId: 3,
  vehicleName: 'Taco',
  createdAt: new Date().toISOString(),
  data: {
    kind: 'fuel' as const,
    date: '2026-11-04',
    odometer: 84_217,
    fuel: { volume: 10_820, pricePerUnit: 3_499 },
    clientId,
  },
});

beforeEach(async () => {
  for (const e of await listOutbox()) await discard(e.clientId);
});
afterEach(() => vi.unstubAllGlobals());

describe('offline outbox', () => {
  it('keeps entries across calls and sends them in order once online', async () => {
    await enqueue(entry('a'));
    await enqueue(entry('b'));
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)).clientId);
        return Response.json({ id: 1 }, { status: 201 });
      }),
    );
    expect(await syncOutbox()).toEqual({ sent: 2, failed: 0 });
    expect(sent).toEqual(['a', 'b']);
    expect(await listOutbox()).toEqual([]);
  });

  it('stops on network failure and keeps everything queued', async () => {
    await enqueue(entry('c'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await syncOutbox()).toEqual({ sent: 0, failed: 0 });
    expect((await listOutbox()).map((e) => e.clientId)).toEqual(['c']);
  });

  it('marks entries the server rejects and leaves them for the user', async () => {
    await enqueue(entry('d'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 'validation_failed' } }, { status: 400 })),
    );
    expect(await syncOutbox()).toEqual({ sent: 0, failed: 1 });
    const [kept] = await listOutbox();
    expect(kept).toMatchObject({ clientId: 'd', error: 'validation_failed' });
  });

  it('attaches a photo taken offline once its record is saved, and retries if the upload drops', async () => {
    await enqueue({
      ...entry('e'),
      photo: {
        data: new TextEncoder().encode('jpeg bytes').buffer as ArrayBuffer,
        type: 'image/jpeg',
        name: 'pump.jpg',
      },
    });
    const calls: string[] = [];
    let photoFails = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        if (url.endsWith('/attachments')) {
          expect(init.body).toBeInstanceOf(FormData);
          if (photoFails) throw new TypeError('Failed to fetch');
          return Response.json({ id: 9 }, { status: 201 });
        }
        // The server answers with the same record however often the entry is sent.
        return Response.json({ id: 42 }, { status: 201 });
      }),
    );
    // Record saved, signal lost before the photo went up: the entry stays queued.
    expect(await syncOutbox()).toEqual({ sent: 0, failed: 0 });
    expect((await listOutbox()).map((e) => e.clientId)).toEqual(['e']);
    photoFails = false;
    expect(await syncOutbox()).toEqual({ sent: 1, failed: 0 });
    expect(await listOutbox()).toEqual([]);
    expect(calls).toEqual([
      '/api/v1/vehicles/3/records',
      '/api/v1/records/42/attachments',
      '/api/v1/vehicles/3/records',
      '/api/v1/records/42/attachments',
    ]);
  });
});
