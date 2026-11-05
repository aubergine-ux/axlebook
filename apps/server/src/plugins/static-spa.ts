import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serves the built web app and falls back to index.html for client-side routes.
 * Unknown /api/* paths always get a JSON 404.
 */
export async function registerSpa(app: FastifyInstance, webDir: string) {
  const hasWeb = fs.existsSync(path.join(webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: webDir,
      wildcard: false,
      setHeaders(res, filePath) {
        // Hashed assets can be cached forever; everything else must revalidate.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.header('Cache-Control', 'no-cache');
        }
      },
    });
  }
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/');
    // A missing file (an old build's /assets/x.js) is a 404, not the app page: answering with
    // HTML would surface as a confusing MIME error in the browser.
    const path = request.url.split('?')[0] ?? '';
    const isFile = path.startsWith('/assets/') || /\.[a-z0-9]{1,5}$/i.test(path);
    if (!isApi && !isFile && hasWeb && request.method === 'GET') {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ error: { code: 'not_found' } });
  });
}
