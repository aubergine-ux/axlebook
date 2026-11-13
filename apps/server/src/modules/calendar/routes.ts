import { computeReminderStatus, predictDue, today, vehicleTitle } from '@axlebook/shared';
import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { randomToken } from '../../lib/crypto';
import { translator } from '../../lib/i18n';
import { currentUser } from '../../plugins/auth';
import { currentOdometers } from '../odometer/routes';
import { vehiclePace } from '../reminders/service';
import { garageVehicleIds } from '../vehicles/access';

/** Escape text for iCalendar (RFC 5545 §3.3.11). */
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Don't split a multi-byte character.
    while (end < bytes.length && ((bytes[end] as number) & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join('\r\n ');
}
const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function feedUrl(config: Config, token: string) {
  return config.baseUrl
    ? new URL(`/calendar/${token}.ics`, config.baseUrl).toString()
    : `/calendar/${token}.ics`;
}

export const calendarRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    const tags = ['calendar'];
    const Feed = z.object({ url: z.string().nullable() });
    app.get(
      '/me/calendar',
      { schema: { tags, summary: 'Your calendar feed link', response: { 200: Feed } } },
      async (req) => {
        const u = currentUser(req);
        return { url: u.calendar_token ? feedUrl(config, u.calendar_token) : null };
      },
    );
    app.post(
      '/me/calendar',
      {
        schema: {
          tags,
          summary: 'Create (or replace) your calendar feed link',
          description: 'The old link stops working.',
          response: { 200: Feed },
        },
      },
      async (req) => {
        const token = randomToken(24);
        await db
          .updateTable('users')
          .set({ calendar_token: token })
          .where('id', '=', currentUser(req).id)
          .execute();
        return { url: feedUrl(config, token) };
      },
    );
    app.delete(
      '/me/calendar',
      { schema: { tags, summary: 'Turn off your calendar feed', response: { 204: z.null() } } },
      async (req, reply) => {
        await db
          .updateTable('users')
          .set({ calendar_token: null })
          .where('id', '=', currentUser(req).id)
          .execute();
        return reply.status(204).send(null);
      },
    );
  };

/** Public, token-addressed iCalendar feed (calendar apps can't sign in). */
export function registerCalendarFeed(
  app: FastifyInstance,
  { db, config }: { db: DB; config: Config },
) {
  app.get('/calendar/:token', { schema: { hide: true } }, async (req, reply) => {
    const raw = (req.params as { token: string }).token;
    const token = raw.endsWith('.ics') ? raw.slice(0, -4) : raw;
    const user =
      token.length >= 20
        ? await db
            .selectFrom('users')
            .selectAll()
            .where('calendar_token', '=', token)
            .where('disabled', '=', 0)
            .executeTakeFirst()
        : undefined;
    if (!user) return reply.status(404).send({ error: { code: 'not_found' } });

    const ids = [...(await garageVehicleIds(db, user)).keys()];
    const vehicles = ids.length
      ? await db
          .selectFrom('vehicles')
          .selectAll()
          .where('id', 'in', ids)
          .where('archived_at', 'is', null)
          .execute()
      : [];
    const vIds = vehicles.map((v) => v.id);
    const reminders = vIds.length
      ? await db
          .selectFrom('reminders')
          .selectAll()
          .where('vehicle_id', 'in', vIds)
          .where('archived_at', 'is', null)
          .execute()
      : [];
    const odo = await currentOdometers(db, vIds);
    const t = today(config.timeZone);
    const pace = await vehiclePace(db, vIds, t);
    const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
    const tr = translator(user.locale);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Axlebook//Reminders//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(tr('calendar.name'))}`,
    ];
    for (const r of reminders) {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      if (!v) continue;
      // Distance reminders land on the day the odometer is expected to get there.
      const { predictedDueDate: day, predictedBy } = predictDue(
        { dueMode: r.due_mode, dueDate: r.due_date, dueOdometer: r.due_odometer },
        odo.get(v.id) ?? null,
        pace.get(v.id) ?? null,
        t,
      );
      if (!day) continue;
      const state = computeReminderStatus(
        {
          dueMode: r.due_mode,
          dueDate: r.due_date,
          dueOdometer: r.due_odometer,
          soonDays: r.soon_days,
          soonDistance: r.soon_distance,
          archived: false,
        },
        t,
        odo.get(v.id) ?? null,
      );
      const name = v.nickname ?? vehicleTitle(v);
      const summary = tr(state.status === 'overdue' ? 'calendar.overdue' : 'calendar.event', {
        title: r.title,
        vehicle: name,
      });
      const desc = [
        r.due_odometer != null
          ? tr('calendar.dueAt', {
              odometer: r.due_odometer.toLocaleString(user.locale ?? 'en'),
              unit: v.odometer_unit,
            })
          : '',
        predictedBy === 'distance' && pace.has(v.id)
          ? tr('calendar.estimated', {
              pace: Math.round(pace.get(v.id) ?? 0).toLocaleString(user.locale ?? 'en'),
              unit: v.odometer_unit,
            })
          : '',
        r.notes ?? '',
      ]
        .filter(Boolean)
        .join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:reminder-${r.id}@axlebook`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(day)}`,
        `DTEND;VALUE=DATE:${ymd(nextDay(day))}`,
        `SUMMARY:${esc(summary)}`,
        ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
        ...(config.baseUrl
          ? [`URL:${new URL(`/vehicles/${v.id}/reminders`, config.baseUrl).toString()}`]
          : []),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'private, max-age=300')
      .send(`${lines.map(fold).join('\r\n')}\r\n`);
  });
}
