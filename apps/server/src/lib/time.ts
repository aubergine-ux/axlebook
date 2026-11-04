/** Timestamps are stored as ISO-8601 UTC strings in both SQLite and Postgres. */
export const nowIso = () => new Date().toISOString();
