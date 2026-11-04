declare const __AXLEBOOK_VERSION__: string | undefined;

/** Injected at build time by esbuild; falls back to the env or "dev". */
export const VERSION =
  (typeof __AXLEBOOK_VERSION__ !== 'undefined' ? __AXLEBOOK_VERSION__ : undefined) ??
  process.env.AXLEBOOK_VERSION ??
  'dev';
