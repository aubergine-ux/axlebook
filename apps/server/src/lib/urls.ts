import type { Config } from '../config';

/** "/garage/" → "/garage"; "/" and "" → "" (mounted at the root). */
export function normalizeBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * An absolute link into the app for messages, calendar entries and sign-on callbacks, or
 * undefined when the public address isn't configured. Includes the path the app is mounted
 * under, so links work behind a reverse proxy at a subpath.
 */
export function appUrl(
  config: Pick<Config, 'baseUrl' | 'basePath'>,
  path: string,
): string | undefined {
  if (!config.baseUrl) return undefined;
  return `${config.baseUrl.origin}${config.basePath}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Strip the mount path from a request URL, for proxies that pass it through unchanged. */
export function stripBasePath(url: string, basePath: string): string {
  if (!basePath) return url;
  if (url === basePath) return '/';
  return url.startsWith(`${basePath}/`) || url.startsWith(`${basePath}?`)
    ? url.slice(basePath.length) || '/'
    : url;
}
