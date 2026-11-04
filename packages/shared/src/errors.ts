/**
 * Stable error codes returned by the API as `{ error: { code, params } }`.
 * The web client translates them via the `errors` namespace; the server never sends prose.
 */
export const ERROR_CODES = [
  'validation_failed',
  'not_found',
  'unauthorized',
  'forbidden',
  'csrf_origin_mismatch',
  'conflict',
  'payload_too_large',
  'internal',
  'invalid_credentials',
  'rate_limited',
  'setup_required',
  'already_set_up',
  'oidc_failed',
  'local_login_disabled',
  'insufficient_stock',
  'unsupported_file',
  'restore_not_empty',
  'ai_disabled',
  'ai_failed',
  'upload_expired',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; params?: Record<string, unknown> };
}
