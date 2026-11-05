import type { FastifyBaseLogger } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../config';
import { OllamaAi } from '../../lib/ai';
import { fakeOllama } from '../../test/fake-ollama';
import { createTestApp, multipartFile, type TestApp, vehicleBody } from '../../test/helpers';
import { matchVehicle, plausibleDate } from './service';

const quiet = { warn() {}, info() {}, error() {}, debug() {} } as unknown as FastifyBaseLogger;
// Smallest thing that sniffs as a JPEG; the fake model doesn't look at it.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const draft = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    kind: 'fuel',
    vehicle: null,
    date: '2026-10-30',
    odometer: 61_402,
    station: 'Shell Main St',
    title: null,
    total: 37.69,
    pricePerUnit: 3.49,
    volume: 10.8,
    volumeUnit: 'gal',
    items: [{ description: 'Unleaded 87', amount: 37.69 }],
    ...o,
  });

describe('config', () => {
  it('is off without OLLAMA_URL, reads OLLAMA_* and still accepts the older AI_* names', () => {
    expect(loadConfig({}).ai).toBeUndefined();
    expect(loadConfig({ OLLAMA_URL: 'http://ollama:11434/' }).ai).toEqual({
      url: 'http://ollama:11434',
      model: 'gemma3:4b',
      pull: true,
      timeoutMs: 300_000,
    });
    expect(
      loadConfig({
        OLLAMA_URL: 'http://h:1',
        OLLAMA_MODEL: 'qwen2.5vl:3b',
        OLLAMA_TIMEOUT_SEC: '60',
      }).ai,
    ).toMatchObject({ model: 'qwen2.5vl:3b', timeoutMs: 60_000 });
    expect(loadConfig({ AI_URL: 'http://old:11434', AI_MODEL: 'qwen2.5:3b' }).ai).toMatchObject({
      url: 'http://old:11434',
      model: 'qwen2.5:3b',
    });
  });
});

describe('local assistant off', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('reports itself off and refuses every assistant request', async () => {
    expect((await t.req({ method: 'GET', url: '/api/v1/ai/status' })).json()).toMatchObject({
      enabled: false,
      vision: false,
    });
    const calls = [
      { method: 'GET', url: '/api/v1/assistant/models' },
      { method: 'POST', url: '/api/v1/assistant/test' },
      { method: 'PUT', url: '/api/v1/assistant/model', payload: { model: 'x' } },
      { method: 'POST', url: '/api/v1/assistant/entry', payload: { text: 'filled up 10 gal' } },
      { method: 'POST', url: '/api/v1/assistant/ask', payload: { question: 'last oil change?' } },
      {
        method: 'POST',
        url: '/api/v1/assistant/receipt',
        ...multipartFile('file', 'r.jpg', jpeg, 'image/jpeg'),
      },
    ] as const;
    for (const c of calls) {
      const res = await t.req(c as never);
      expect(res.statusCode, c.url).toBe(503);
      expect(res.json().error.code).toBe('ai_disabled');
    }
  });
});

describe('local assistant with Ollama', () => {
  let t: TestApp;
  let ollama: Awaited<ReturnType<typeof fakeOllama>>;
  let civic: number;
  let tacoma: number;
  let ai: OllamaAi;
  const records = async () =>
    Number(
      (
        await t.db
          .selectFrom('records')
          .select((eb) => eb.fn.countAll().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    );

  beforeAll(async () => {
    ollama = await fakeOllama({
      models: [
        { name: 'gemma3:4b', vision: true },
        { name: 'qwen2.5:3b', vision: false },
      ],
    });
    ai = new OllamaAi({ url: ollama.url, model: 'gemma3:4b', pull: false, timeoutMs: 400 }, quiet);
    t = await createTestApp({}, { ai });
    civic = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ year: 2018, make: 'Honda', model: 'Civic', fuelUnit: 'l' }),
      })
    ).json().id;
    tacoma = (
      await t.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ nickname: 'Taco' }),
      })
    ).json().id;
  });
  afterEach(() => ai.setModel('gemma3:4b'));
  afterAll(async () => {
    await t.close();
    await ollama.close();
  });

  it('reads a receipt into a draft in the vehicle’s units, sends the photo, and saves nothing', async () => {
    ollama.setReply(() => draft());
    const before = await records();
    const res = await t.req({
      method: 'POST',
      url: `/api/v1/assistant/receipt?vehicleId=${civic}`,
      ...multipartFile('file', 'r.jpg', jpeg, 'image/jpeg'),
    });
    expect(res.statusCode, res.body).toBe(200);
    // 10.8 US gal → 40.882 L for a car logged in litres; the total is what was paid.
    expect(res.json()).toMatchObject({
      vehicleId: civic,
      kind: 'fuel',
      date: '2026-10-30',
      odometer: 61_402,
      station: 'Shell Main St',
      cost: 37_690,
      volume: 40_882,
    });
    expect(res.json().pricePerUnit).toBeCloseTo(922, -1);
    const chat = ollama.chats.at(-1);
    expect(chat?.model).toBe('gemma3:4b');
    expect(chat?.messages.at(-1)?.images?.[0]).toBe(jpeg.toString('base64'));
    expect(chat?.format).toMatchObject({ type: 'object' });
    expect(await records()).toBe(before);
  });

  it("won't read photos with a model that can't, and refuses files that aren't JPEG or PNG", async () => {
    ai.setModel('qwen2.5:3b');
    const res = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/receipt',
      ...multipartFile('file', 'r.jpg', jpeg, 'image/jpeg'),
    });
    expect(res.json().error).toMatchObject({ code: 'ai_failed', params: { reason: 'no_vision' } });
    ai.setModel('gemma3:4b');
    const pdf = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/receipt',
      ...multipartFile('file', 'r.pdf', Buffer.from('%PDF-1.4'), 'application/pdf'),
    });
    expect(pdf.statusCode).toBe(415);
  });

  it('turns a typed sentence into a draft for the vehicle it names', async () => {
    ollama.setReply(() =>
      draft({
        vehicle: 'civic',
        date: null,
        total: null,
        station: null,
        items: [],
        volumeUnit: null,
      }),
    );
    const res = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'filled up 10.8 gal at 3.49, 61402 mi, civic' },
    });
    expect(res.json()).toMatchObject({
      vehicleId: civic,
      kind: 'fuel',
      date: null,
      odometer: 61_402,
      volume: 10_800,
      pricePerUnit: 3490,
      cost: 37_692,
    });
    expect(ollama.chats.at(-1)?.messages.at(-1)?.content).toContain('2018 Honda Civic');
  });

  it('gives up cleanly on malformed answers, after one retry, without saving anything', async () => {
    let n = 0;
    ollama.setReply(() => {
      n++;
      return n === 1 ? 'not json at all' : '{"kind": "boat"}';
    });
    const before = await records();
    const res = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'oil change today' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatchObject({
      code: 'ai_failed',
      params: { reason: 'invalid_output' },
    });
    expect(n).toBe(2);
    expect(await records()).toBe(before);
  });

  it('gives up when the model takes too long', async () => {
    ollama.setReply(() => ({ delayMs: 2000, content: draft() }));
    const res = await t.req({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'oil change today' },
    });
    expect(res.json().error).toMatchObject({ code: 'ai_failed', params: { reason: 'timeout' } });
  });

  it('answers only from records the person can see, and cites only what it was shown', async () => {
    await t.req({
      method: 'POST',
      url: `/api/v1/vehicles/${tacoma}/records`,
      payload: {
        kind: 'service',
        date: '2026-03-02',
        odometer: 80_100,
        title: 'Oil and filter change',
        cost: 49_990,
      },
    });
    const other = await t.user('stranger');
    const theirs = (
      await other.req({
        method: 'POST',
        url: '/api/v1/vehicles',
        payload: vehicleBody({ model: 'Secretmobile' }),
      })
    ).json();
    await other.req({
      method: 'POST',
      url: `/api/v1/vehicles/${theirs.id}/records`,
      payload: { kind: 'service', date: '2026-04-01', title: 'Hidden oil change', cost: 1000 },
    });
    let shown = '';
    let answered = '';
    ollama.setReply((chat) => {
      const asks = (chat.format as { properties?: Record<string, unknown> }).properties ?? {};
      if ('recordIds' in asks) {
        // Step 1: pick the records. The made-up number 99999 must be ignored.
        shown = chat.messages.at(-1)?.content ?? '';
        const id = Number(/#(\d+) \| 2026-03-02/.exec(shown)?.[1]);
        return JSON.stringify({ recordIds: [id, 99_999], reminderIds: [], found: true });
      }
      // Step 2: answer from only the picked records.
      answered = chat.messages.at(-1)?.content ?? '';
      return JSON.stringify({ answer: 'On 2026-03-02 at 80100 mi.', found: true });
    });
    const res = (
      await t.req({
        method: 'POST',
        url: '/api/v1/assistant/ask',
        payload: { question: 'When did I last change the oil on the Tacoma?' },
      })
    ).json();
    expect(shown).toContain('Oil and filter change');
    expect(shown).not.toContain('Hidden oil change');
    expect(shown).not.toContain('Secretmobile');
    expect(res).toMatchObject({ found: true, answer: 'On 2026-03-02 at 80100 mi.' });
    // The answer was written from the picked record alone.
    expect(answered).toContain('Oil and filter change');
    expect(answered.split('\n').filter((l) => l.startsWith('#'))).toHaveLength(1);
    // The made-up record number is dropped; the real one links back to the record.
    expect(res.sources).toEqual([
      expect.objectContaining({
        vehicleId: tacoma,
        date: '2026-03-02',
        title: 'Oil and filter change',
      }),
    ]);

    ollama.setReply(() => JSON.stringify({ recordIds: [], reminderIds: [], found: false }));
    const none = (
      await t.req({
        method: 'POST',
        url: '/api/v1/assistant/ask',
        payload: { question: 'What colour are my seat covers?' },
      })
    ).json();
    expect(none).toMatchObject({ found: false, answer: null, sources: [] });
  });

  it("won't draft into a vehicle the person can't edit", async () => {
    const other = await t.user('olive');
    const theirs = (
      await other.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json();
    ollama.setReply(() => draft());
    const entry = await t.anon({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'filled up 10 gal', vehicleId: tacoma },
      headers: { cookie: other.cookie },
    });
    expect(entry.statusCode).toBe(404);
    const upload = multipartFile('file', 'r.jpg', jpeg, 'image/jpeg');
    const receipt = await t.anon({
      method: 'POST',
      url: `/api/v1/assistant/receipt?vehicleId=${tacoma}`,
      payload: upload.payload,
      headers: { cookie: other.cookie, ...upload.headers },
    });
    expect(receipt.statusCode).toBe(404);
    // Their own vehicle is fine.
    const mine = await t.anon({
      method: 'POST',
      url: '/api/v1/assistant/entry',
      payload: { text: 'filled up 10 gal', vehicleId: theirs.id },
      headers: { cookie: other.cookie },
    });
    expect(mine.json()).toMatchObject({ vehicleId: theirs.id });
  });

  it('for "last" questions, cites the newest record of the job even if the model picks an older one', async () => {
    for (const [date, odometer] of [
      ['2025-01-10', 70_000],
      ['2026-08-20', 84_000],
    ] as const)
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${tacoma}/records`,
        payload: { kind: 'service', date, odometer, title: 'Oil and filter change', cost: 50_000 },
      });
    let answeredFrom = '';
    ollama.setReply((chat) => {
      const asks = (chat.format as { properties?: Record<string, unknown> }).properties ?? {};
      const text = chat.messages.at(-1)?.content ?? '';
      if ('recordIds' in asks) {
        const old = Number(/#(\d+) \| 2025-01-10/.exec(text)?.[1]);
        return JSON.stringify({ recordIds: [old], reminderIds: [], found: true });
      }
      answeredFrom = text;
      return JSON.stringify({ answer: 'On 2026-08-20.', found: true });
    });
    const res = (
      await t.req({
        method: 'POST',
        url: '/api/v1/assistant/ask',
        payload: { question: 'When did I last change the oil on the Taco?' },
      })
    ).json();
    expect(res.sources.map((x: { date: string }) => x.date)).toEqual(['2026-08-20']);
    expect(answeredFrom).toContain('2026-08-20');
    expect(answeredFrom).not.toContain('2025-01-10');
  });

  it('answers what is due from reminders, linking to them', async () => {
    const reminder = (
      await t.req({
        method: 'POST',
        url: `/api/v1/vehicles/${civic}/reminders`,
        payload: { title: 'Registration renewal', dueMode: 'date', dueDate: '2027-01-02' },
      })
    ).json();
    ollama.setReply((chat) => {
      const asks = (chat.format as { properties?: Record<string, unknown> }).properties ?? {};
      const text = chat.messages.at(-1)?.content ?? '';
      if ('recordIds' in asks) {
        expect(text).toContain(
          `R${reminder.id} | reminder | 2018 Honda Civic | Registration renewal | due 2027-01-02`,
        );
        return JSON.stringify({ recordIds: [], reminderIds: [reminder.id, 424_242], found: true });
      }
      return JSON.stringify({ answer: 'It is due on 2027-01-02.', found: true });
    });
    const res = (
      await t.req({
        method: 'POST',
        url: '/api/v1/assistant/ask',
        payload: { question: 'When is the Civic registration due?' },
      })
    ).json();
    expect(res).toMatchObject({ found: true, answer: 'It is due on 2027-01-02.', sources: [] });
    expect(res.reminders).toEqual([
      {
        reminderId: reminder.id,
        vehicleId: civic,
        vehicle: '2018 Honda Civic',
        title: 'Registration renewal',
        dueDate: '2027-01-02',
        dueOdometer: null,
      },
    ]);
  });

  it('lets viewers ask, but not draft records', async () => {
    const viewer = await t.user('vic', 'viewer');
    await t.req({
      method: 'PUT',
      url: `/api/v1/vehicles/${tacoma}/shares/${viewer.user.id}`,
      payload: { permission: 'edit' },
    });
    ollama.setReply(() => JSON.stringify({ recordIds: [], reminderIds: [], found: false }));
    expect(
      (
        await viewer.req({
          method: 'POST',
          url: '/api/v1/assistant/ask',
          payload: { question: 'last oil change?' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await viewer.req({
          method: 'POST',
          url: '/api/v1/assistant/entry',
          payload: { text: 'oil change today' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await viewer.req({
          method: 'POST',
          url: '/api/v1/assistant/receipt',
          ...multipartFile('file', 'r.jpg', jpeg, 'image/jpeg'),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('lets an admin list models, pick one (kept across restarts) and test it', async () => {
    const models = (await t.req({ method: 'GET', url: '/api/v1/assistant/models' })).json();
    expect(models).toEqual([
      { name: 'gemma3:4b', size: 3_300_000_000, vision: true },
      { name: 'qwen2.5:3b', size: 3_300_000_000, vision: false },
    ]);
    const picked = await t.req({
      method: 'PUT',
      url: '/api/v1/assistant/model',
      payload: { model: 'qwen2.5:3b' },
    });
    expect(picked.json()).toMatchObject({ model: 'qwen2.5:3b', vision: false, modelReady: true });
    const setting = await t.db
      .selectFrom('instance_settings')
      .select('value')
      .where('key', '=', 'ollama_model')
      .executeTakeFirst();
    expect(JSON.parse(setting?.value ?? 'null')).toBe('qwen2.5:3b');
    expect(
      (
        await t.req({
          method: 'PUT',
          url: '/api/v1/assistant/model',
          payload: { model: 'nope:1b' },
        })
      ).statusCode,
    ).toBe(400);
    ollama.setReply(() => '{"ok": true}');
    const tested = await t.req({ method: 'POST', url: '/api/v1/assistant/test' });
    expect(tested.json()).toMatchObject({ model: 'qwen2.5:3b', ms: expect.any(Number) });
    expect(ollama.chats.at(-1)?.model).toBe('qwen2.5:3b');
    const editor = await t.user('ed');
    expect((await editor.req({ method: 'GET', url: '/api/v1/assistant/models' })).statusCode).toBe(
      403,
    );
  });

  it('only ever talks to OLLAMA_URL', () => {
    // Every request the app made for these tests reached the fake server at OLLAMA_URL.
    expect(new Set(ollama.requests.map((r) => r.path))).toEqual(
      new Set(['/api/tags', '/api/show', '/api/chat']),
    );
  });
});

describe('helpers', () => {
  it('accepts only real, past dates', () => {
    expect(plausibleDate('2026-02-30', '2026-11-05')).toBeNull();
    expect(plausibleDate('2026-11-06', '2026-11-05')).toBeNull();
    expect(plausibleDate('11/04/2026', '2026-11-05')).toBeNull();
    expect(plausibleDate('2026-11-04', '2026-11-05')).toBe('2026-11-04');
  });

  it('matches a vehicle only when the words point to one', () => {
    const g = [
      { id: 1, nickname: 'Old Blue', make: 'Ford', model: 'F-150', year: 1998, unitNumber: null },
      { id: 2, nickname: null, make: 'Honda', model: 'Civic', year: 2018, unitNumber: null },
      { id: 3, nickname: null, make: 'Honda', model: 'CR-V', year: 2019, unitNumber: '42' },
    ] as never[];
    expect(matchVehicle('the civic', g)).toMatchObject({ id: 2 });
    expect(matchVehicle('old blue', g)).toMatchObject({ id: 1 });
    expect(matchVehicle('truck 42', g)).toMatchObject({ id: 3 });
    expect(matchVehicle('the honda', g)).toBeNull();
    expect(matchVehicle(null, g)).toBeNull();
  });
});
