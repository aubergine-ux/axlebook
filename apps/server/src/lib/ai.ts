import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config';
import { AppError } from './errors';

/**
 * The local assistant: an Ollama server you run yourself (the `ollama` Compose profile, or
 * one already on the host), reached only at OLLAMA_URL. There is no other model service and
 * no cloud fallback. Every answer is constrained to a JSON schema and validated.
 */
export interface AiPrompt {
  system: string;
  user: string;
  /** Caps the answer's length (default 1200 tokens). */
  maxTokens?: number;
  /** Base64 images (JPEG/PNG) for models that can read photos. */
  images?: string[];
}

export interface AiModel {
  name: string;
  /** Bytes on disk. */
  size: number;
  /** The model can read photos (receipt scan needs this). */
  vision: boolean;
}

export interface Ai {
  readonly enabled: boolean;
  readonly model: string;
  status(): Promise<AiStatus>;
  json<T>(schema: z.ZodType<T>, prompt: AiPrompt): Promise<T>;
  /** Models installed in Ollama. */
  models(): Promise<AiModel[]>;
  /** Switch the model used from now on (an admin's choice in Settings). */
  setModel(name: string): void;
  /** A tiny round trip through the model; milliseconds it took. */
  test(): Promise<{ ms: number }>;
}

export interface AiStatus {
  enabled: boolean;
  model: string;
  reachable: boolean;
  modelReady: boolean;
  /** 0–1 while the model is being downloaded. */
  pullProgress: number | null;
  /** The chosen model can read photos. */
  vision: boolean;
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
  private chosen: string | null = null;
  private readonly caps = new Map<string, string[]>();

  constructor(
    private readonly cfg: AiConfig,
    private readonly log: FastifyBaseLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model() {
    return this.chosen ?? this.cfg.model;
  }

  setModel(name: string) {
    this.chosen = name;
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
    const want = this.model.includes(':') ? this.model : `${this.model}:latest`;
    return models.some((m) => m.name === want || m.model === want);
  }

  /** What a model can do, from /api/show ("completion", "vision", …). Cached per model. */
  private async capabilities(name: string): Promise<string[]> {
    const cached = this.caps.get(name);
    if (cached) return cached;
    const res = await this.call('/api/show', { model: name });
    if (!res.ok) return [];
    const { capabilities = [] } = (await res.json()) as { capabilities?: string[] };
    this.caps.set(name, capabilities);
    return capabilities;
  }

  async models(): Promise<AiModel[]> {
    const res = await this.call('/api/tags');
    if (!res.ok) throw new AppError('ai_failed', { reason: 'unreachable' });
    const { models = [] } = (await res.json()) as { models?: { name: string; size?: number }[] };
    return Promise.all(
      models.map(async (m) => ({
        name: m.name,
        size: m.size ?? 0,
        vision: (await this.capabilities(m.name).catch((): string[] => [])).includes('vision'),
      })),
    );
  }

  async test(): Promise<{ ms: number }> {
    const started = Date.now();
    await this.json(z.object({ ok: z.boolean() }), {
      system: 'Reply with JSON only.',
      user: 'Reply with {"ok": true}.',
      maxTokens: 20,
    });
    return { ms: Date.now() - started };
  }

  async status(): Promise<AiStatus> {
    const base = {
      enabled: true,
      model: this.model,
      pullProgress: this.pull ? this.pull.progress : null,
    };
    try {
      const ready = await this.hasModel();
      const vision = ready && (await this.capabilities(this.model)).includes('vision');
      return {
        ...base,
        reachable: true,
        modelReady: ready,
        vision,
        error: this.pull?.error ?? null,
      };
    } catch (err) {
      return {
        ...base,
        reachable: false,
        modelReady: false,
        vision: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Download the model into Ollama if it isn't there (one time). Retries while the
   * Ollama container is still starting. Skipped when OLLAMA_PULL=false (bring your own model).
   */
  async ensureModel(): Promise<void> {
    if (!this.cfg.pull) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        if (await this.hasModel()) return;
        this.pull = { progress: 0, error: null };
        this.log.info({ model: this.model }, 'downloading the local assistant model (one time)');
        const res = await this.fetchImpl(`${this.cfg.url}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, stream: true }),
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
        this.log.info({ model: this.model }, 'local assistant model ready');
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

  async json<T>(schema: z.ZodType<T>, prompt: AiPrompt): Promise<T> {
    const format = toOllamaSchema(schema);
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
      images?: string[];
    }[] = [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: prompt.user,
        ...(prompt.images?.length && { images: prompt.images }),
      },
    ];
    let lastError = 'no response';
    // One retry, telling the model what was wrong with its first answer.
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await this.call(
          '/api/chat',
          {
            model: this.model,
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

/** Used when OLLAMA_URL isn't set: every assistant feature reports itself as off. */
const off = async (): Promise<never> => {
  throw new AppError('ai_disabled');
};
export const disabledAi: Ai = {
  enabled: false,
  model: '',
  status: async () => ({
    enabled: false,
    model: '',
    reachable: false,
    modelReady: false,
    pullProgress: null,
    vision: false,
    error: null,
  }),
  json: off,
  models: off,
  setModel: () => {},
  test: off,
};
