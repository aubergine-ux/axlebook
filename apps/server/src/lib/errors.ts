import type { ErrorCode } from '@axlebook/shared';

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  csrf_origin_mismatch: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
  invalid_credentials: 401,
  rate_limited: 429,
  setup_required: 403,
  already_set_up: 409,
  oidc_failed: 400,
  local_login_disabled: 403,
  insufficient_stock: 409,
  unsupported_file: 415,
  restore_not_empty: 409,
  ai_disabled: 503,
  ai_failed: 502,
  upload_expired: 410,
  lookups_disabled: 503,
  lookup_failed: 502,
};

/** Throw from anywhere in a request; the error handler turns it into `{ error: { code, params } }`. */
export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    readonly params?: Record<string, unknown>,
  ) {
    super(code);
    this.statusCode = STATUS[code];
  }
}

export const notFound = (params?: Record<string, unknown>) => new AppError('not_found', params);
export const forbidden = () => new AppError('forbidden');
