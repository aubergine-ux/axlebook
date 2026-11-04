// Development entry: sensible local defaults, then start the normal server.
import path from 'node:path';

process.env.NODE_ENV ??= 'development';
process.env.DATA_DIR ??= path.resolve(import.meta.dirname, '../../../data');
process.env.LOG_LEVEL ??= 'debug';

await import('./server');
