import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OllamaChat {
  model: string;
  messages: { role: string; content: string; images?: string[] }[];
  format?: unknown;
}

/**
 * A stand-in Ollama server for tests: /api/tags, /api/show and /api/chat. `reply` decides each
 * chat answer (the message content as a string); return `{ delayMs }` to answer slowly.
 */
export async function fakeOllama(opts: {
  models?: { name: string; vision: boolean }[];
  reply?: (chat: OllamaChat) => string | { delayMs: number; content: string };
}) {
  const models = opts.models ?? [{ name: 'gemma3:4b', vision: true }];
  const requests: { path: string; body: unknown }[] = [];
  const chats: OllamaChat[] = [];
  let reply = opts.reply ?? (() => '{}');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: req.url ?? '', body });
      const send = (o: unknown) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(o));
      };
      if (req.url === '/api/tags')
        return send({
          models: models.map((m) => ({ name: m.name, model: m.name, size: 3_300_000_000 })),
        });
      if (req.url === '/api/show') {
        const m = models.find((x) => x.name === body?.model);
        if (!m) {
          res.statusCode = 404;
          return send({ error: 'model not found' });
        }
        return send({ capabilities: m.vision ? ['completion', 'vision'] : ['completion'] });
      }
      if (req.url === '/api/chat') {
        chats.push(body);
        const r = reply(body);
        const { delayMs, content } = typeof r === 'string' ? { delayMs: 0, content: r } : r;
        const timer = setTimeout(() => {
          if (!res.destroyed)
            send({ model: body.model, message: { role: 'assistant', content }, done: true });
        }, delayMs);
        res.on('close', () => clearTimeout(timer));
        return;
      }
      res.statusCode = 404;
      send({ error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    chats,
    setReply(fn: typeof reply) {
      reply = fn;
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
