import {
  AiStatus,
  ApiError,
  AskAnswer,
  AskInput,
  AssistantModel,
  AssistantModelChoice,
  AssistantTestResult,
  QuickEntryInput,
  RecordDraft,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { Ai } from '../../lib/ai';
import { AppError } from '../../lib/errors';
import { sniffImage } from '../../lib/files';
import { setSetting } from '../../lib/settings';
import { currentUser, requireAdmin } from '../../plugins/auth';
import { AssistantService } from './service';

/** Instance setting that holds the model an admin picked (overrides OLLAMA_MODEL). */
export const MODEL_SETTING = 'ollama_model';

const tags = ['assistant'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError, 502: ApiError, 503: ApiError };
const off = (ai: Ai) => {
  if (!ai.enabled) throw new AppError('ai_disabled');
};

export const assistantRoutes =
  ({ db, config, ai }: { db: DB; config: Config; ai: Ai }): FastifyPluginAsyncZod =>
  async (app) => {
    const service = new AssistantService(db, config, ai);

    app.get(
      '/assistant/models',
      {
        schema: {
          tags,
          summary: 'Models installed in Ollama (admin)',
          response: { 200: z.array(AssistantModel), ...errors },
        },
      },
      async (req) => {
        requireAdmin(req);
        off(ai);
        return ai.models();
      },
    );

    app.put(
      '/assistant/model',
      {
        schema: {
          tags,
          summary: 'Choose the model the local assistant uses (admin)',
          body: AssistantModelChoice,
          response: { 200: AiStatus, ...errors },
        },
      },
      async (req) => {
        requireAdmin(req);
        off(ai);
        const installed = await ai.models();
        if (!installed.some((m) => m.name === req.body.model))
          throw new AppError('validation_failed', { field: 'model', reason: 'not_installed' });
        await setSetting(db, MODEL_SETTING, req.body.model);
        ai.setModel(req.body.model);
        return ai.status();
      },
    );

    app.post(
      '/assistant/test',
      {
        schema: {
          tags,
          summary: 'Send a tiny request through the model and time it (admin)',
          response: { 200: AssistantTestResult, ...errors },
        },
      },
      async (req) => {
        requireAdmin(req);
        off(ai);
        const { ms } = await ai.test();
        return { model: ai.model, ms };
      },
    );

    app.post(
      '/assistant/receipt',
      {
        schema: {
          tags,
          summary: 'Read a receipt photo into a draft record (nothing is saved)',
          description:
            'multipart/form-data with one `file` field (JPEG or PNG). Returns a draft for the person to check; save it with the normal records endpoint.',
          consumes: ['multipart/form-data'],
          querystring: z.object({ vehicleId: z.coerce.number().int().positive().optional() }),
          response: { 200: RecordDraft, ...errors },
        },
      },
      async (req) => {
        off(ai);
        const user = currentUser(req);
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const data = await file.toBuffer();
        const kind = sniffImage(data);
        if (!kind || !['jpg', 'png'].includes(kind.ext)) throw new AppError('unsupported_file');
        return service.receipt(user, data, req.query.vehicleId);
      },
    );

    app.post(
      '/assistant/entry',
      {
        schema: {
          tags,
          summary: 'Turn a typed sentence into a draft record (nothing is saved)',
          body: QuickEntryInput,
          response: { 200: RecordDraft, ...errors },
        },
      },
      async (req) => {
        off(ai);
        return service.entry(currentUser(req), req.body.text, req.body.vehicleId);
      },
    );

    app.post(
      '/assistant/ask',
      {
        schema: {
          tags,
          summary: 'Ask a question answered only from your own records',
          body: AskInput,
          response: { 200: AskAnswer, ...errors },
        },
      },
      async (req) => {
        off(ai);
        return service.ask(currentUser(req), req.body.question);
      },
    );
  };
