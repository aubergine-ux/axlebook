import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config';
import { AppError } from './errors';

/**
 * Local AI through an Ollama server you run yourself (normally the `ollama` service in
 * docker-compose.ai.yml, on the private Compose network). Axlebook never calls any
 * other AI service. Every answer is constrained to a JSON schema and validated.
 */
export interface Ai {
  readonly enabled: boolean;
  readonly model: string;
  status(): Promise<AiStatus>;
  /** `maxTokens` caps the answer's length (default 1200). */
  json<T>(
    schema: z.ZodType<T>,
    prompt: { system: string; user: string; maxTokens?: number },
  ): Promise<T>;
}

export interface AiStatus {
  enabled: boolean;
  model: string;
  reachable: boolean;
  modelReady: boolean;
  /** 0–1 while the model is being downloaded. */
  pullProgress: number | null;
  error: string | null;
}

type AiConfig = NonNullable<Config['ai']>;

/** JSON schema for Ollama's `format`: drop keys its grammar converter doesn't need. */
export function toOllamaSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}

export class OllamaAi implements Ai {
  readonly enabled = true;
  private pull: { progress: number; error: string | null } | null = null;

  constructor(
    private readonly cfg: AiConfig,
    private readonly log: FastifyBaseLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model() {
    return this.cfg.model;
  }

  private async call(path: string, body?: unknown, timeoutMs = 10_000): Promise<Response> {
    return this.fetchImpl(`${this.cfg.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private async hasModel(): Promise<boolean> {
    const res = await this.call('/api/tags');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { models = [] } = (await res.json()) as { models?: { name: string; model?: string }[] };
    const want = this.cfg.model.includes(':') ? this.cfg.model : `${this.cfg.model}:latest`;
    return models.some((m) => m.name === want || m.model === want);
  }

  async status(): Promise<AiStatus> {
    const base = {
      enabled: true,
      model: this.cfg.model,
      pullProgress: this.pull ? this.pull.progress : null,
    };
    try {
      const ready = await this.hasModel();
      return { ...base, reachable: true, modelReady: ready, error: this.pull?.error ?? null };
    } catch (err) {
      return {
        ...base,
        reachable: false,
        modelReady: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Download the model into Ollama if it isn't there (one time). Retries while the
   * Ollama container is still starting. Skipped when AI_PULL=false (bring your own model).
   */
  async ensureModel(): Promise<void> {
    if (!this.cfg.pull) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        if (await this.hasModel()) return;
        this.pull = { progress: 0, error: null };
        this.log.info({ model: this.cfg.model }, 'downloading local AI model (one time)');
        const res = await this.fetchImpl(`${this.cfg.url}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.cfg.model, stream: true }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const decoder = new TextDecoder();
        let buf = '';
        for await (const chunk of res.body) {
          buf += decoder.decode(chunk as Uint8Array, { stream: true });
          let nl = buf.indexOf('\n');
          while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            nl = buf.indexOf('\n');
            if (!line) continue;
            const ev = JSON.parse(line) as {
              status?: string;
              total?: number;
              completed?: number;
              error?: string;
            };
            if (ev.error) throw new Error(ev.error);
            if (ev.total && ev.completed) this.pull.progress = ev.completed / ev.total;
          }
        }
        this.pull = null;
        this.log.info({ model: this.cfg.model }, 'local AI model ready');
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.pull = { progress: this.pull?.progress ?? 0, error: message };
        await new Promise((r) =>
          setTimeout(r, Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5))).unref(),
        );
      }
    }
  }

  async json<T>(
    schema: z.ZodType<T>,
    prompt: { system: string; user: string; maxTokens?: number },
  ): Promise<T> {
    const format = toOllamaSchema(schema);
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];
    let lastError = 'no response';
    // One retry, telling the model what was wrong with its first answer.
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await this.call(
          '/api/chat',
          {
            model: this.cfg.model,
            messages,
            format,
            stream: false,
            keep_alive: '10m',
            // A cap on output stops a small model that starts repeating itself inside a JSON array.
            options: { temperature: 0, num_ctx: 8192, num_predict: prompt.maxTokens ?? 1200 },
          },
          this.cfg.timeoutMs,
        );
      } catch (err) {
        const timedOut =
          err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        this.log.warn({ err }, timedOut ? 'local AI timed out' : 'local AI unreachable');
        throw new AppError('ai_failed', { reason: timedOut ? 'timeout' : 'unreachable' });
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.log.warn({ status: res.status, detail: detail.slice(0, 300) }, 'local AI error');
        throw new AppError('ai_failed', { reason: res.status === 404 ? 'model_missing' : 'error' });
      }
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content ?? '';
      try {
        const parsed = schema.safeParse(JSON.parse(content));
        if (parsed.success) return parsed.data;
        lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      } catch {
        lastError = 'not valid JSON';
      }
      messages.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: `That answer was invalid (${lastError.slice(0, 500)}). Reply again with JSON that matches the schema exactly.`,
        },
      );
    }
    this.log.warn({ lastError }, 'local AI returned an invalid answer');
    throw new AppError('ai_failed', { reason: 'invalid_output' });
  }
}

/** Used when AI_URL isn't set: every AI feature reports itself as off. */
export const disabledAi: Ai = {
  enabled: false,
  model: '',
  status: async () => ({
    enabled: false,
    model: '',
    reachable: false,
    modelReady: false,
    pullProgress: null,
    error: null,
  }),
  json: async () => {
    throw new AppError('ai_disabled');
  },
};
