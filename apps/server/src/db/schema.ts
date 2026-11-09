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
  calendar_token: Generated<string | null>;
  /** JSON ViewPrefs; null means the defaults. */
  view_prefs: Generated<string | null>;
  created_at: string;
  updated_at: string;
}

export interface InstanceSettingsTable {
  key: string;
  /** JSON-encoded value */
  value: string;
  updated_at: string;
}

export interface VehiclesTable {
  id: Generated<number>;
  owner_id: number;
  category: Generated<
    'car' | 'motorcycle' | 'dirtbike' | 'atv' | 'snowmobile' | 'semi' | 'trailer'
  >;
  unit_number: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  odometer_unit: 'mi' | 'km' | 'hr';
  fuel_unit: 'gal_us' | 'gal_uk' | 'l' | 'kwh';
  fuel_type: string;
  purchase_date: string | null;
  purchase_price: number | null;
  notes: string | null;
  photo_key: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordsTable {
  id: Generated<number>;
  vehicle_id: number;
  kind: 'service' | 'repair' | 'upgrade' | 'fuel' | 'expense';
  date: string;
  odometer: number | null;
  title: string | null;
  cost: number;
  notes: string | null;
  expense_category: string | null;
  fuel_volume: number | null;
  price_per_unit: number | null;
  is_full: number | null;
  missed_previous: number | null;
  fuel_grade: string | null;
  station: string | null;
  jurisdiction: string | null;
  client_id: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagsTable {
  id: Generated<number>;
  name: string;
  name_key: string;
}

export interface RecordTagsTable {
  record_id: number;
  tag_id: number;
}

export interface AttachmentsTable {
  id: Generated<number>;
  vehicle_id: number;
  record_id: number | null;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export interface OdometerReadingsTable {
  id: Generated<number>;
  vehicle_id: number;
  date: string;
  odometer: number;
  record_id: number | null;
  notes: string | null;
  jurisdiction: Generated<string | null>;
  created_at: string;
  updated_at: string;
}

export interface RemindersTable {
  id: Generated<number>;
  vehicle_id: number;
  title: string;
  notes: string | null;
  due_mode: 'date' | 'distance' | 'either';
  due_date: string | null;
  due_odometer: number | null;
  interval_months: number | null;
  interval_distance: number | null;
  soon_days: number;
  soon_distance: number;
  archived_at: string | null;
  last_notified_status: string | null;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderCompletionsTable {
  id: Generated<number>;
  reminder_id: number;
  record_id: number | null;
  completed_at: string;
  previous_due_date: string | null;
  previous_due_odometer: number | null;
}

export interface PartsTable {
  id: Generated<number>;
  owner_id: number;
  vehicle_id: number | null;
  name: string;
  part_number: string | null;
  manufacturer: string | null;
  quantity: number;
  unit_cost: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordPartsTable {
  id: Generated<number>;
  record_id: number;
  part_id: number | null;
  quantity: number;
  unit_cost: number | null;
  name: string;
}

export interface PlanItemsTable {
  id: Generated<number>;
  vehicle_id: number;
  title: string;
  description: string | null;
  kind: 'service' | 'repair' | 'upgrade';
  priority: 'low' | 'normal' | 'high';
  status: 'backlog' | 'planned' | 'in_progress' | 'done';
  estimated_cost: number | null;
  target_date: string | null;
  converted_record_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleSharesTable {
  vehicle_id: number;
  user_id: number;
  permission: 'view' | 'edit';
  created_at: string;
}

export interface SessionsTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: string;
  last_seen_at: string;
  user_agent: string | null;
  created_at: string;
}

export interface ApiTokensTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  token_hash: string;
  prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface NotificationChannelsTable {
  id: Generated<number>;
  user_id: number;
  type: 'email' | 'webhook' | 'ntfy' | 'gotify' | 'discord';
  name: string;
  config: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationLogTable {
  id: Generated<number>;
  channel_id: number | null;
  reminder_id: number | null;
  status: 'sent' | 'failed';
  error: string | null;
  sent_at: string;
}

export interface InspectionsTable {
  id: Generated<number>;
  vehicle_id: number;
  type: 'pre_trip' | 'post_trip' | 'annual';
  date: string;
  odometer: number | null;
  inspector: string | null;
  /** JSON: [{ item, ok, note }] */
  items: string;
  defects: number;
  notes: string | null;
  corrected_at: string | null;
  corrected_by: string | null;
  correction_notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface VehicleInsightsTable {
  vehicle_id: number;
  kind: 'mpg' | 'schedule' | 'tips';
  data: string;
  model: string;
  created_at: string;
}

export interface Database {
  inspections: InspectionsTable;
  vehicle_insights: VehicleInsightsTable;
  users: UsersTable;
  instance_settings: InstanceSettingsTable;
  vehicles: VehiclesTable;
  records: RecordsTable;
  tags: TagsTable;
  record_tags: RecordTagsTable;
  attachments: AttachmentsTable;
  odometer_readings: OdometerReadingsTable;
  reminders: RemindersTable;
  reminder_completions: ReminderCompletionsTable;
  parts: PartsTable;
  record_parts: RecordPartsTable;
  plan_items: PlanItemsTable;
  vehicle_shares: VehicleSharesTable;
  sessions: SessionsTable;
  api_tokens: ApiTokensTable;
  notification_channels: NotificationChannelsTable;
  notification_log: NotificationLogTable;
}

export type VehicleRow = Selectable<VehiclesTable>;
export type RecordRow = Selectable<RecordsTable>;
export type ReminderRow = Selectable<RemindersTable>;
export type PartRow = Selectable<PartsTable>;
export type PlanItemRow = Selectable<PlanItemsTable>;
export type ReadingRow = Selectable<OdometerReadingsTable>;
export type ChannelRow = Selectable<NotificationChannelsTable>;

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
