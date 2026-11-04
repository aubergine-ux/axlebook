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
});
