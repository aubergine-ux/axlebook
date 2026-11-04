import type { ApiErrorBody, ErrorCode } from '@axlebook/shared';

/** Thrown for any non-2xx response. `code` maps to the `errors.*` translation keys. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    readonly params?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { credentials: 'same-origin', ...init, headers });
  } catch {
    throw new ApiRequestError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? 'internal', err?.params);
  }
  return body as T;
}
