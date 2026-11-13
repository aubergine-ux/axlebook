import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * Serves the built web app and falls back to index.html for client-side routes.
 * Unknown /api/* paths always get a JSON 404.
 */
/**
 * The app page, told where it's mounted: assets and API calls in the built page are relative,
 * and this `<base>` is what they're relative to. At the root it's "/".
 */
export function withBaseTag(html: string, basePath: string): string {
  const tag = `<base href="${basePath}/" />`;
  return html.includes('<base ')
    ? html.replace(/<base [^>]*>/, tag)
    : html.replace(/<head>/i, `<head>\n    ${tag}`);
}

export async function registerSpa(app: FastifyInstance, webDir: string, basePath = '') {
  const indexFile = path.join(webDir, 'index.html');
  const hasWeb = fs.existsSync(indexFile);
  const page = hasWeb ? withBaseTag(fs.readFileSync(indexFile, 'utf8'), basePath) : '';
  const sendPage = (reply: FastifyReply) =>
    reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(page);
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: webDir,
      wildcard: false,
      // The page is served by the handlers below, with its <base> filled in.
      index: false,
      setHeaders(res, filePath) {
        // Hashed assets can be cached forever; everything else must revalidate.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.header('Cache-Control', 'no-cache');
        }
      },
    });
    // The service worker fetches /index.html to keep an offline copy; it must get the same page
    // as everyone else, not the file as built. ("/" has no file route and falls through below.)
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'GET' && request.url.split('?')[0] === '/index.html')
        return sendPage(reply);
    });
  }
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/');
    // A missing file (an old build's /assets/x.js) is a 404, not the app page: answering with
    // HTML would surface as a confusing MIME error in the browser.
    const path = request.url.split('?')[0] ?? '';
    const isFile = path.startsWith('/assets/') || /\.[a-z0-9]{1,5}$/i.test(path);
    if (!isApi && !isFile && hasWeb && request.method === 'GET') return sendPage(reply);
    return reply.status(404).send({ error: { code: 'not_found' } });
  });
}
