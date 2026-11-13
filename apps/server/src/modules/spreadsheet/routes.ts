import {
  ApiError,
  SpreadsheetAnalysis,
  SpreadsheetCommitResult,
  SpreadsheetPlan,
  SpreadsheetPreview,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { currentUser } from '../../plugins/auth';
import type { SpreadsheetImporter } from './service';

const tags = ['import'];
const errors = {
  400: ApiError,
  403: ApiError,
  404: ApiError,
  410: ApiError,
  413: ApiError,
  415: ApiError,
};
const UploadParam = z.object({ uploadId: z.uuid() });

export const spreadsheetRoutes =
  (importer: SpreadsheetImporter): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/import/spreadsheet',
      {
        schema: {
          tags,
          summary: 'Upload a spreadsheet to import',
          description:
            'Multipart upload of an .xlsx workbook (any number of sheets and vehicles) or a .csv/.tsv file. Returns a proposed import plan: which columns hold what, which vehicles are in it and their units. With `ai=true` and local AI configured, the plan is refined by the model on your own server. Nothing is saved until you commit.',
          consumes: ['multipart/form-data'],
          querystring: z.object({ ai: z.stringbool().default(true) }),
          response: { 200: SpreadsheetAnalysis, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const data = await file.toBuffer();
        return importer.analyze(user, file.filename || 'spreadsheet', data, req.query.ai);
      },
    );

    app.post(
      '/import/spreadsheet/:uploadId/preview',
      {
        schema: {
          tags,
          summary: 'Preview an import plan',
          description:
            'Applies the plan to the uploaded file without saving: record counts per vehicle, row problems, duplicates already in Axlebook, and a sample.',
          params: UploadParam,
          body: z.object({ plan: SpreadsheetPlan }),
          response: { 200: SpreadsheetPreview, ...errors },
        },
      },
      async (req) => importer.preview(currentUser(req), req.params.uploadId, req.body.plan),
    );

    app.post(
      '/import/spreadsheet/:uploadId/commit',
      {
        schema: {
          tags,
          summary: 'Import the spreadsheet',
          description:
            'Creates any new vehicles and imports every valid row. Rows already in Axlebook are skipped, so importing twice is safe.',
          params: UploadParam,
          body: z.object({ plan: SpreadsheetPlan }),
          response: { 200: SpreadsheetCommitResult, ...errors },
        },
      },
      async (req) => importer.commit(currentUser(req), req.params.uploadId, req.body.plan),
    );

    app.delete(
      '/import/mappings/:id',
      {
        schema: {
          tags,
          summary: 'Forget a saved column mapping',
          description:
            'Every import saves how its columns were mapped, keyed by the layout of the file, and the next upload with the same headers starts from it. This removes one.',
          params: z.object({ id: z.coerce.number().int().positive() }),
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await importer.forget(currentUser(req), req.params.id);
        return reply.code(204).send(null);
      },
    );
  };
