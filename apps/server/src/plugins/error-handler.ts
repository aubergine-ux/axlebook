import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors';

/** Every error leaves the API as `{ error: { code, params } }`. No English prose. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, params: err.params } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const issues = err.validation.map((v) => ({
        path: v.instancePath,
        code: (v.params.issue as { code?: string } | undefined)?.code,
        message: v.message,
      }));
      return reply.status(400).send({
        error: { code: 'validation_failed', params: { context: err.validationContext, issues } },
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 413 || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: { code: 'payload_too_large' } });
    }
    if (status >= 400 && status < 500) {
      const code =
        status === 404 ? 'not_found' : status === 401 ? 'unauthorized' : 'validation_failed';
      return reply.status(status).send({ error: { code } });
    }
    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal' } });
  });
}
