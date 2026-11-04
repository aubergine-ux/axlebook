import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Kysely table types. Conventions (portable across SQLite and Postgres):
 * - ids: integer, generated
 * - timestamps: ISO-8601 UTC text; calendar dates: `YYYY-MM-DD` text
 * - booleans: integer 0/1
 * - money and fuel volume: integer milli-units (bigint in Postgres)
 */
export interface UsersTable {
  id: Generated<number>;
  username: string;
  email: string | null;
  display_name: string | null;
  password_hash: string | null;
  role: 'admin' | 'editor' | 'viewer';
  oidc_issuer: string | null;
  oidc_subject: string | null;
  locale: string | null;
  unit_system: 'imperial' | 'metric' | null;
  theme: 'system' | 'light' | 'dark';
  disabled: number;
  created_at: string;
  updated_at: string;
}

export interface InstanceSettingsTable {
  key: string;
  /** JSON-encoded value */
  value: string;
  updated_at: string;
}

export interface Database {
  users: UsersTable;
  instance_settings: InstanceSettingsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
