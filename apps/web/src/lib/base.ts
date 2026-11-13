/**
 * Where the app is mounted. The server writes a `<base>` tag into the page ("/" at the root,
 * "/axlebook/" behind a reverse proxy at a subpath), and everything the app links to goes
 * through here so it works in both.
 */
export const BASE: string = (() => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

/** Prefix a root-relative path ("/api/v1/…", "/brand/mark.svg") with the mount path. */
export const withBase = (path: string): string =>
  path.startsWith('/') && !path.startsWith('//') ? `${BASE}${path}` : path;
