import fastifyCookie from '@fastify/cookie';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { DbHandle } from './db/connection';
import { VERSION } from './lib/version';
import { systemRoutes } from './modules/system/routes';
import { registerAuth } from './plugins/auth';
import { registerCsrfProtection } from './plugins/csrf';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSpa } from './plugins/static-spa';

export interface AppDeps {
  config: Config;
  db: DbHandle;
}

export async function buildApp({ config, db }: AppDeps) {
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(fastifyCookie);
  registerCsrfProtection(app, { baseUrl: config.baseUrl });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Axlebook API',
        description: 'REST API for Axlebook, a self-hosted vehicle maintenance logbook.',
        version: VERSION,
        license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: 'axlebook_session' },
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ session: [] }, { bearer: [] }],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });
  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  await registerAuth(app, db.db);

  await app.register(systemRoutes({ db: db.db, config }), { prefix: '/api/v1' });

  await registerSpa(app, config.webDir);
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
