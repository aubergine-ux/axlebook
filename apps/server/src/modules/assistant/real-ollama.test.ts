/**
 * Against a real Ollama: runs only when OLLAMA_TEST_URL is set, e.g.
 *   OLLAMA_TEST_URL=http://127.0.0.1:11434 OLLAMA_TEST_MODEL=qwen2.5:0.5b npx vitest run real-ollama
 * The model must already be pulled. A small text model is enough; receipts are covered by the
 * mocked tests, since they need a model that reads photos.
 */
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OllamaAi } from '../../lib/ai';
import { createTestApp, type TestApp, vehicleBody } from '../../test/helpers';

const url = process.env.OLLAMA_TEST_URL;
const model = process.env.OLLAMA_TEST_MODEL ?? 'qwen2.5:0.5b';
const quiet = { warn() {}, info() {}, error() {}, debug() {} } as unknown as FastifyBaseLogger;

describe.skipIf(!url)('local assistant against a real Ollama', () => {
  let t: TestApp;
  let civic: number;
  beforeAll(async () => {
    const ai = new OllamaAi({ url: url as string, model, pull: false, timeoutMs: 180_000 }, quiet);
    t = await createTestApp({}, { ai });
    civic = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ year: 2018, make: 'Honda', model: 'Civic' }),
      })
    ).json().id;
  });
  afterAll(() => t?.close());

  it('reaches the model and answers the test request', async () => {
    const res = await t.req({ method: 'POST', url: '/api/v1/assistant/test' });
    expect(res.statusCode, res.body).toBe(200);
  }, 200_000);

  it('turns a sentence into a valid draft (or a clean failure), never a saved record', async () => {
    const res = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'filled up 10.8 gal at 3.49, 61402 mi, civic' },
    });
    // A tiny model may not manage it; either way the response is a draft or a handled error.
    expect([200, 502]).toContain(res.statusCode);
    if (res.statusCode === 200) expect(res.json()).toMatchObject({ vehicleId: civic });
    const n = await t.db
      .selectFrom('records')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(0);
  }, 200_000);
});
