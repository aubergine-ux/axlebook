import { buildApp } from './app';
import { loadConfig } from './config';
import { connect } from './db/connection';
import { migrateToLatest } from './db/migrate';
import { OllamaAi } from './lib/ai';
import { VERSION } from './lib/version';
import { isSetupRequired, performSetup } from './modules/auth/service';
import { seedDemo } from './seed/demo';

async function main() {
  const config = loadConfig();
  const db = connect(config.database);
  const applied = await migrateToLatest(db.db);
  const app = await buildApp({ config, db });
  app.log.info(
    { version: VERSION, database: db.dialect, migrationsApplied: applied },
    'axlebook starting',
  );

  // Headless first-run: ADMIN_USERNAME / ADMIN_PASSWORD create the admin account.
  if (config.auth.bootstrapAdmin && (await isSetupRequired(db.db))) {
    await performSetup(db.db, config.auth.bootstrapAdmin);
    app.log.info(
      { username: config.auth.bootstrapAdmin.username },
      'admin account created from ADMIN_USERNAME',
    );
  }
  if (config.seedDemoData) {
    const result = await seedDemo(db.db, app.services.records, {
      timeZone: config.timeZone,
      password: config.auth.bootstrapAdmin?.password,
    });
    if (!result.seeded) app.log.info('demo data already present, skipping seed');
    else if (result.createdUser)
      app.log.warn(
        { username: result.createdUser.username },
        'demo data seeded with a new admin account; sign in as "demo" (password: ADMIN_PASSWORD, or axlebook-demo)',
      );
    else app.log.info('demo data seeded into the existing admin account');
  }

  app.services.notifications.start();
  app.services.backups.start();
  // Local assistant: download the model once in the background (OLLAMA_PULL=false to skip).
  const ai = app.services.ai;
  if (ai instanceof OllamaAi && config.ai?.pull) void ai.ensureModel();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    app.services.notifications.stop();
    app.services.backups.stop();
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
