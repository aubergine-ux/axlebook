import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_init';
import * as m0002 from './0002_vehicles';

/**
 * Ordered list of migrations. Statically imported so the server can be bundled.
 * Add new files as `NNNN_description.ts` and register them here. Never edit a
 * migration that has shipped; write a new one.
 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_vehicles': m0002,
};
