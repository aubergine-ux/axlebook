// Starts the built server on a fresh temporary data directory for e2e tests.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = process.argv[2] ?? '18765';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axlebook-e2e-'));
const child = spawn(process.execPath, ['apps/server/dist/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, DATA_DIR: dataDir, LOG_LEVEL: 'warn', NODE_ENV: 'production' },
});
const stop = () => {
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
