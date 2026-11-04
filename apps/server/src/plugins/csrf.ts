import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value || value === 'null') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Origin check for state-changing requests. This is defense in depth on top of
 * SameSite=Lax session cookies.
 *
 * - GET/HEAD/OPTIONS are never checked, so they must never change state.
 * - Requests with `Authorization: Bearer …` are exempt, because browsers never attach that header
 *   on their own.
 * - Otherwise `Origin` (or `Referer` as a fallback) must match BASE_URL, or the
 *   request's own scheme://host when BASE_URL is unset. If both headers are missing,
 *   the request is rejected.
 */
export function registerCsrfProtection(app: FastifyInstance, opts: { baseUrl?: URL }) {
  const allowed = (request: FastifyRequest): Set<string> => {
    const set = new Set<string>();
    if (opts.baseUrl) set.add(opts.baseUrl.origin);
    else {
      // Normalize through URL so default ports match (http://h:80 → http://h).
      const self = originOf(`${request.protocol}://${request.host}`);
      if (self) set.add(self);
    }
    return set;
  };

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (/^Bearer\s+\S+/i.test(request.headers.authorization ?? '')) return;

    const origin =
      originOf(request.headers.origin) ?? originOf(request.headers.referer as string | undefined);
    if (!origin || !allowed(request).has(origin)) {
      request.log.warn({ origin, url: request.url }, 'csrf origin check failed');
      throw new AppError('csrf_origin_mismatch');
    }
  });
}
