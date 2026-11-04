import { buildApp } from './app';
import { loadConfig } from './config';
import { connect } from './db/connection';
import { migrateToLatest } from './db/migrate';
import { VERSION } from './lib/version';

async function main() {
  const config = loadConfig();
  const db = connect(config.database);
  const applied = await migrateToLatest(db.db);
  const app = await buildApp({ config, db });
  app.log.info(
    { version: VERSION, database: db.dialect, migrationsApplied: applied },
    'axlebook starting',
  );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
