import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_init';
import * as m0002 from './0002_vehicles';
import * as m0003 from './0003_logbook';
import * as m0004 from './0004_types_and_tools';
import * as m0005 from './0005_view_prefs';
import * as m0006 from './0006_import_mappings';
import * as m0007 from './0007_vehicle_details';

/**
 * Ordered list of migrations. Statically imported so the server can be bundled.
 * Add new files as `NNNN_description.ts` and register them here. Never edit a
 * migration that has shipped; write a new one.
 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_vehicles': m0002,
  '0003_logbook': m0003,
  '0004_types_and_tools': m0004,
  '0005_view_prefs': m0005,
  '0006_import_mappings': m0006,
  '0007_vehicle_details': m0007,
};
