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
