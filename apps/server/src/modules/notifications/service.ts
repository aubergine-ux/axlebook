import { createHmac } from 'node:crypto';
import {
  type Channel,
  type ChannelConfig,
  ChannelConfig as ChannelConfigSchema,
  type ChannelInput,
  digestDue,
  inQuietHours,
  parseNotifyPrefs,
  type Reminder,
  type VehicleDocument,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyBaseLogger } from 'fastify';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { ChannelRow, User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { translator } from '../../lib/i18n';
import { getInstanceSettings } from '../../lib/instance-settings';
import type { Lookups } from '../../lib/nhtsa';
import { nowIso } from '../../lib/time';
import { appUrl } from '../../lib/urls';
import { presentDocuments } from '../documents/routes';
import { refreshRecalls } from '../lookups/routes';
import type { ReminderService } from '../reminders/service';
import { garageVehicleIds } from '../vehicles/access';

export interface Message {
  /** What this is about; webhooks receive it as `event`. */
  event: 'reminder.status' | 'document.status' | 'recall.new' | 'digest' | 'test';
  /** Overdue or expired: channels that have a priority raise it. */
  urgent?: boolean;
  title: string;
  body: string;
  url?: string;
  reminder?: Pick<
    Reminder,
    'id' | 'title' | 'status' | 'vehicleId' | 'vehicleTitle' | 'dueDate' | 'dueOdometer'
  >;
}

/** How often a vehicle's recalls are rechecked, and how many vehicles one scan looks up. */
const RECALL_RECHECK_DAYS = 7;
const RECALLS_PER_SCAN = 5;

const RANK = { inactive: 0, upcoming: 1, due_soon: 2, overdue: 3 } as const;
const SECRET_KEYS = ['token', 'secret'];

export function maskConfig(config: ChannelConfig): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, SECRET_KEYS.includes(k) && v ? '••••••' : v]),
  );
}

export class NotificationService {
  private timer: NodeJS.Timeout | null = null;
  private mailer: Transporter | null = null;

  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly reminders: ReminderService,
    private readonly log: FastifyBaseLogger,
    private readonly lookups?: Lookups,
  ) {}

  // ── Channels ─────────────────────────────────────────────────────────────

  async list(user: User): Promise<Channel[]> {
    const rows = await this.db
      .selectFrom('notification_channels')
      .selectAll()
      .where('user_id', '=', user.id)
      .orderBy('name')
      .execute();
    if (rows.length === 0) return [];
    const logs = await this.db
      .selectFrom('notification_log')
      .selectAll()
      .where(
        'channel_id',
        'in',
        rows.map((r) => r.id),
      )
      .orderBy('id', 'desc')
      .execute();
    return rows.map((r) => {
      const last = logs.find((l) => l.channel_id === r.id);
      return this.dto(
        r,
        last ? { status: last.status, error: last.error, at: last.sent_at } : null,
      );
    });
  }

  private dto(r: ChannelRow, lastResult: Channel['lastResult']): Channel {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      enabled: Boolean(r.enabled),
      config: maskConfig(JSON.parse(r.config)),
      lastResult,
    };
  }

  private async load(user: User, id: number) {
    const row = await this.db
      .selectFrom('notification_channels')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row || row.user_id !== user.id) throw new AppError('not_found', { entity: 'channel' });
    return row;
  }

  async create(user: User, input: ChannelInput): Promise<Channel> {
    if (input.config.type === 'email' && !this.config.smtp)
      throw new AppError('validation_failed', { field: 'config', reason: 'smtp_not_configured' });
    const ts = nowIso();
    const row = await this.db
      .insertInto('notification_channels')
      .values({
        user_id: user.id,
        type: input.config.type,
        name: input.name,
        enabled: input.enabled === false ? 0 : 1,
        config: JSON.stringify(input.config),
        created_at: ts,
        updated_at: ts,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.dto(row, null);
  }

  /** Masked secrets sent back unchanged keep their stored value. */
  async update(user: User, id: number, input: ChannelInput): Promise<Channel> {
    const row = await this.load(user, id);
    const old = JSON.parse(row.config) as Record<string, unknown>;
    const merged = Object.fromEntries(
      Object.entries(input.config).map(([k, v]) => [
        k,
        SECRET_KEYS.includes(k) && v === '••••••' ? old[k] : v,
      ]),
    );
    const config = ChannelConfigSchema.parse(merged);
    const updated = await this.db
      .updateTable('notification_channels')
      .set({
        name: input.name,
        enabled: input.enabled === false ? 0 : 1,
        type: config.type,
        config: JSON.stringify(config),
        updated_at: nowIso(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.dto(updated, null);
  }

  async remove(user: User, id: number) {
    await this.load(user, id);
    await this.db.deleteFrom('notification_channels').where('id', '=', id).execute();
  }

  async test(user: User, id: number): Promise<Channel> {
    const row = await this.load(user, id);
    const t = translator(user.locale);
    await this.deliver(
      row,
      {
        event: 'test',
        title: t('notify.testTitle'),
        body: t('notify.testBody'),
        url: appUrl(this.config, '/'),
      },
      null,
    );
    return (await this.list(user)).find((c) => c.id === id) as Channel;
  }

  // ── Delivery ─────────────────────────────────────────────────────────────

  /** Send one message; failures are logged, recorded and returned (never thrown). */
  async deliver(row: ChannelRow, msg: Message, reminderId: number | null): Promise<boolean> {
    let error: string | null = null;
    try {
      await this.send(JSON.parse(row.config) as ChannelConfig, msg);
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 500) : String(err);
      this.log.warn({ channel: row.id, type: row.type, err: error }, 'notification failed');
    }
    await this.db
      .insertInto('notification_log')
      .values({
        channel_id: row.id,
        reminder_id: reminderId,
        status: error ? 'failed' : 'sent',
        error,
        sent_at: nowIso(),
      })
      .execute();
    return !error;
  }

  async send(config: ChannelConfig, msg: Message): Promise<void> {
    const post = async (url: string, init: RequestInit) => {
      const res = await fetch(url, {
        method: 'POST',
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    };
    const text = msg.url ? `${msg.body}\n${msg.url}` : msg.body;
    switch (config.type) {
      case 'email': {
        if (!this.config.smtp) throw new Error('SMTP is not configured');
        this.mailer ??= nodemailer.createTransport({
          host: this.config.smtp.host,
          port: this.config.smtp.port,
          secure: this.config.smtp.secure,
          auth: this.config.smtp.user
            ? { user: this.config.smtp.user, pass: this.config.smtp.pass }
            : undefined,
        });
        await this.mailer.sendMail({
          from: this.config.smtp.from,
          to: config.to,
          subject: msg.title,
          text,
        });
        return;
      }
      case 'ntfy':
        return post(config.url, {
          body: msg.body,
          headers: {
            // HTTP headers are ASCII; ntfy decodes RFC 2047 encoded words for anything else.
            Title: /^[\x20-\x7e]*$/.test(msg.title)
              ? msg.title
              : `=?UTF-8?B?${Buffer.from(msg.title).toString('base64')}?=`,
            Tags: msg.urgent ? 'warning' : 'wrench',
            ...(msg.url && { Click: msg.url }),
            ...(config.token && { Authorization: `Bearer ${config.token}` }),
          },
        });
      case 'gotify':
        return post(
          new URL('message', config.url.endsWith('/') ? config.url : `${config.url}/`).toString(),
          {
            headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': config.token },
            body: JSON.stringify({
              title: msg.title,
              message: text,
              priority: msg.urgent ? 7 : 5,
            }),
          },
        );
      case 'discord':
        return post(config.url, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**${msg.title}**\n${text}`.slice(0, 1900),
            allowed_mentions: { parse: [] },
          }),
        });
      case 'apprise':
        return post(config.url, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: msg.title,
            body: text,
            type: msg.urgent ? 'warning' : 'info',
            ...(config.urls && { urls: config.urls }),
            ...(config.tag && { tag: config.tag }),
          }),
        });
      case 'webhook': {
        const body = JSON.stringify({
          event: msg.event,
          title: msg.title,
          body: msg.body,
          url: msg.url ?? null,
          reminder: msg.reminder ?? null,
          sentAt: nowIso(),
        });
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Axlebook',
        };
        if (config.secret)
          headers['X-Axlebook-Signature'] =
            `sha256=${createHmac('sha256', config.secret).update(body).digest('hex')}`;
        return post(config.url, { headers, body });
      }
    }
  }

  // ── Scan ──────────────────────────────────────────────────────────────────

  /** The server's local date, weekday and time of day, which quiet hours and digests go by. */
  private clock(now: Date) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: this.config.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      clock: `${parts.hour}:${parts.minute}`,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday as string),
    };
  }

  private channelsOf(userId: number) {
    return this.db
      .selectFrom('notification_channels')
      .selectAll()
      .where('user_id', '=', userId)
      .where('enabled', '=', 1)
      .execute();
  }

  /** Send to every channel a person has, or hold the message until their quiet hours end. */
  private async sendTo(
    user: User,
    msg: Message,
    reminderId: number | null,
    clock: string,
  ): Promise<number> {
    const channels = await this.channelsOf(user.id);
    if (channels.length === 0) return 0;
    if (inQuietHours(parseNotifyPrefs(user.notify_prefs), clock)) {
      await this.db
        .insertInto('notification_queue')
        .values({
          user_id: user.id,
          reminder_id: reminderId,
          message: JSON.stringify(msg),
          created_at: nowIso(),
        })
        .execute();
      return 0;
    }
    let sent = 0;
    for (const ch of channels) if (await this.deliver(ch, msg, reminderId)) sent++;
    return sent;
  }

  /** Everyone who should hear about a vehicle: its owner and the people it's shared with, minus anyone who muted it. */
  private async audience(vehicle: Pick<VehicleRow, 'id' | 'owner_id'>): Promise<User[]> {
    const shared = await this.db
      .selectFrom('vehicle_shares')
      .select('user_id')
      .where('vehicle_id', '=', vehicle.id)
      .execute();
    const muted = new Set(
      (
        await this.db
          .selectFrom('vehicle_mutes')
          .select('user_id')
          .where('vehicle_id', '=', vehicle.id)
          .execute()
      ).map((m) => m.user_id),
    );
    const users = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', 'in', [vehicle.owner_id, ...shared.map((s) => s.user_id)])
      .where('disabled', '=', 0)
      .execute();
    return users.filter((u) => !muted.has(u.id));
  }

  /** Messages held during quiet hours go out once those hours are over. */
  private async flushQueue(clock: string): Promise<number> {
    const waiting = await this.db
      .selectFrom('notification_queue')
      .selectAll()
      .orderBy('id')
      .execute();
    if (waiting.length === 0) return 0;
    const users = await this.db
      .selectFrom('users')
      .selectAll()
      .where('id', 'in', [...new Set(waiting.map((w) => w.user_id))])
      .execute();
    let sent = 0;
    for (const user of users) {
      if (inQuietHours(parseNotifyPrefs(user.notify_prefs), clock)) continue;
      const mine = waiting.filter((w) => w.user_id === user.id);
      const channels = user.disabled ? [] : await this.channelsOf(user.id);
      for (const w of mine)
        for (const ch of channels)
          if (await this.deliver(ch, JSON.parse(w.message) as Message, w.reminder_id)) sent++;
      await this.db
        .deleteFrom('notification_queue')
        .where(
          'id',
          'in',
          mine.map((w) => w.id),
        )
        .execute();
    }
    return sent;
  }

  /**
   * One pass: send what quiet hours held back, then notify about reminders and documents that
   * got worse, then weekly digests. Each step of a reminder or document is announced once.
   */
  async scan(now = new Date()): Promise<{ notified: number }> {
    const at = this.clock(now);
    let notified = await this.flushQueue(at.clock);
    notified += await this.scanReminders(at.clock);
    notified += await this.scanDocuments(at);
    notified += await this.scanRecalls(now, at.clock);
    notified += await this.sendDigests(at);
    return { notified };
  }

  /**
   * Notify each person who can see a vehicle when one of its reminders gets worse
   * (upcoming → due soon → overdue). Each step is sent once. When a reminder
   * improves (completed or rescheduled), the marker resets so later steps notify again.
   */
  private async scanReminders(clock: string): Promise<number> {
    const rows = await this.db
      .selectFrom('reminders')
      .innerJoin('vehicles', 'vehicles.id', 'reminders.vehicle_id')
      .selectAll('reminders')
      .where('reminders.archived_at', 'is', null)
      .where('vehicles.archived_at', 'is', null)
      .execute();
    if (rows.length === 0) return 0;
    const vehicles = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', [...new Set(rows.map((r) => r.vehicle_id))])
      .execute();
    const states = await this.reminders.present(
      rows,
      new Map(vehicles.map((v) => [v.id, v])),
      new Map(),
    );
    const lastBy = new Map(rows.map((r) => [r.id, r.last_notified_status]));
    let notified = 0;

    for (const r of states) {
      const last = (lastBy.get(r.id) ?? 'upcoming') as keyof typeof RANK;
      if (r.status === 'inactive') continue;
      if (RANK[r.status] < RANK[last]) {
        await this.db
          .updateTable('reminders')
          .set({ last_notified_status: r.status })
          .where('id', '=', r.id)
          .execute();
        continue;
      }
      if (RANK[r.status] <= RANK[last] || r.status === 'upcoming') continue;

      const vehicle = vehicles.find((v) => v.id === r.vehicleId);
      if (!vehicle) continue;
      for (const user of await this.audience(vehicle))
        notified += await this.sendTo(user, this.reminderMessage(r, user.locale), r.id, clock);
      await this.db
        .updateTable('reminders')
        .set({ last_notified_status: r.status, last_notified_at: nowIso() })
        .where('id', '=', r.id)
        .execute();
    }
    return notified;
  }

  /** The same escalation for documents: expiring soon, then expired. */
  private async scanDocuments(at: { date: string; clock: string }): Promise<number> {
    const rows = await this.db
      .selectFrom('vehicle_documents')
      .innerJoin('vehicles', 'vehicles.id', 'vehicle_documents.vehicle_id')
      .selectAll('vehicle_documents')
      .where('vehicle_documents.expires_on', 'is not', null)
      .where('vehicles.archived_at', 'is', null)
      .execute();
    if (rows.length === 0) return 0;
    const vehicles = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', [...new Set(rows.map((r) => r.vehicle_id))])
      .execute();
    const { soonDays } = await getInstanceSettings(this.db, this.config);
    const docs = presentDocuments(
      rows,
      new Map(vehicles.map((v) => [v.id, v])),
      new Map(),
      at.date,
      soonDays,
    );
    const lastBy = new Map(rows.map((r) => [r.id, r.last_notified_status]));
    let notified = 0;
    for (const d of docs) {
      const last = (lastBy.get(d.id) ?? 'upcoming') as keyof typeof RANK;
      if (RANK[d.status] <= RANK[last] || d.status === 'upcoming') continue;
      const vehicle = vehicles.find((v) => v.id === d.vehicleId);
      if (!vehicle) continue;
      for (const user of await this.audience(vehicle))
        notified += await this.sendTo(user, this.documentMessage(d, user.locale), null, at.clock);
      await this.db
        .updateTable('vehicle_documents')
        .set({ last_notified_status: d.status })
        .where('id', '=', d.id)
        .execute();
    }
    return notified;
  }

  /**
   * When an admin has allowed online lookups, recheck each vehicle for recalls about once a week
   * and tell its people about new ones. A few vehicles per pass, so a big garage doesn't turn
   * into a burst of requests; a lookup that fails is simply tried again on a later pass.
   */
  private async scanRecalls(now: Date, clock: string): Promise<number> {
    if (!this.lookups) return 0;
    if (!(await getInstanceSettings(this.db, this.config)).onlineLookups) return 0;
    const cutoff = new Date(now.getTime() - RECALL_RECHECK_DAYS * 86_400_000).toISOString();
    const due = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('archived_at', 'is', null)
      .where((eb) =>
        eb.or([eb('recalls_checked_at', 'is', null), eb('recalls_checked_at', '<', cutoff)]),
      )
      .orderBy('recalls_checked_at')
      .limit(RECALLS_PER_SCAN)
      .execute();
    let notified = 0;
    for (const vehicle of due) {
      let added = 0;
      try {
        added = await refreshRecalls(this.db, this.lookups, vehicle, now.toISOString());
      } catch (err) {
        this.log.warn({ err, vehicle: vehicle.id }, 'recall check failed');
        continue;
      }
      if (added === 0) continue;
      for (const user of await this.audience(vehicle)) {
        const t = translator(user.locale);
        notified += await this.sendTo(
          user,
          {
            event: 'recall.new',
            urgent: true,
            title: t('notify.recallTitle', {
              count: added,
              vehicle: vehicle.nickname ?? vehicleTitle(vehicle),
            }),
            body: t('notify.recallBody'),
            url: appUrl(this.config, `/vehicles/${vehicle.id}`),
          },
          null,
          clock,
        );
      }
    }
    return notified;
  }

  /** The weekly summary, for everyone who asked for one and whose day and hour have come. */
  private async sendDigests(at: { date: string; weekday: number; clock: string }): Promise<number> {
    const users = await this.db
      .selectFrom('users')
      .selectAll()
      .where('disabled', '=', 0)
      .where('notify_prefs', 'is not', null)
      .execute();
    let notified = 0;
    for (const user of users) {
      const prefs = parseNotifyPrefs(user.notify_prefs);
      if (!digestDue(prefs, at, user.last_digest_on)) continue;
      // During quiet hours it waits for the next scan rather than joining the queue late.
      if (inQuietHours(prefs, at.clock)) continue;
      const channels = await this.channelsOf(user.id);
      const msg = channels.length ? await this.digestMessage(user) : null;
      if (msg) for (const ch of channels) if (await this.deliver(ch, msg, null)) notified++;
      await this.db
        .updateTable('users')
        .set({ last_digest_on: at.date })
        .where('id', '=', user.id)
        .execute();
    }
    return notified;
  }

  /** What needs attention across one person's garage, or null when nothing does. */
  async digestMessage(user: User): Promise<Message | null> {
    const t = translator(user.locale);
    const muted = new Set(
      (
        await this.db
          .selectFrom('vehicle_mutes')
          .select('vehicle_id')
          .where('user_id', '=', user.id)
          .execute()
      ).map((m) => m.vehicle_id),
    );
    const due = (await this.reminders.listAll(user)).filter(
      (r) => (r.status === 'overdue' || r.status === 'due_soon') && !muted.has(r.vehicleId),
    );
    const access = await garageVehicleIds(this.db, user);
    const ids = [...access.keys()].filter((id) => !muted.has(id));
    const vehicles = ids.length
      ? await this.db
          .selectFrom('vehicles')
          .selectAll()
          .where('id', 'in', ids)
          .where('archived_at', 'is', null)
          .execute()
      : [];
    const docRows = vehicles.length
      ? await this.db
          .selectFrom('vehicle_documents')
          .selectAll()
          .where(
            'vehicle_id',
            'in',
            vehicles.map((v) => v.id),
          )
          .where('expires_on', 'is not', null)
          .execute()
      : [];
    const { soonDays } = await getInstanceSettings(this.db, this.config);
    const docs = presentDocuments(
      docRows,
      new Map(vehicles.map((v) => [v.id, v])),
      access,
      this.reminders.today(),
      soonDays,
    ).filter((d) => d.status !== 'upcoming');
    if (due.length === 0 && docs.length === 0) return null;
    const lines = [
      ...due.map((r) => `• ${this.reminderMessage(r, user.locale).title}`),
      ...docs.map((d) => `• ${this.documentMessage(d, user.locale).title}`),
    ];
    return {
      event: 'digest',
      title: t('notify.digestTitle', { count: lines.length }),
      body: lines.slice(0, 40).join('\n'),
      url: appUrl(this.config, '/reminders'),
    };
  }

  documentMessage(d: VehicleDocument, locale: string | null): Message {
    const t = translator(locale);
    return {
      event: 'document.status',
      urgent: d.status === 'overdue',
      title: t(d.status === 'overdue' ? 'notify.docExpired' : 'notify.docSoon', {
        title: d.title,
        vehicle: d.vehicleTitle,
      }),
      body: d.expiresOn
        ? t(d.status === 'overdue' ? 'notify.docExpiredOn' : 'notify.docExpiresOn', {
            date: d.expiresOn,
          })
        : '',
      url: appUrl(this.config, `/vehicles/${d.vehicleId}/documents`),
    };
  }

  reminderMessage(r: Reminder, locale: string | null): Message {
    const t = translator(locale);
    const parts: string[] = [];
    if (r.daysLeft != null) {
      parts.push(
        r.daysLeft < 0
          ? t('notify.daysOver', { count: -r.daysLeft })
          : t('notify.daysLeft', { count: r.daysLeft }),
      );
    }
    if (r.distanceLeft != null) {
      const distance = Math.abs(r.distanceLeft).toLocaleString('en-US');
      parts.push(
        r.distanceLeft < 0
          ? t('notify.distanceOver', { distance, unit: r.odometerUnit })
          : t('notify.distanceLeft', { distance, unit: r.odometerUnit }),
      );
    }
    return {
      event: 'reminder.status',
      urgent: r.status === 'overdue',
      title: t(`notify.${r.status === 'overdue' ? 'overdue' : 'due_soon'}`, {
        title: r.title,
        vehicle: r.vehicleTitle,
      }),
      body: parts.join(' '),
      url: appUrl(this.config, `/vehicles/${r.vehicleId}/reminders`),
      reminder: {
        id: r.id,
        title: r.title,
        status: r.status,
        vehicleId: r.vehicleId,
        vehicleTitle: r.vehicleTitle,
        dueDate: r.dueDate,
        dueOdometer: r.dueOdometer,
      },
    };
  }

  start() {
    const run = () => this.scan().catch((err) => this.log.error({ err }, 'reminder scan failed'));
    this.timer = setInterval(run, this.config.reminderScanMinutes * 60_000);
    this.timer.unref();
    setTimeout(run, 30_000).unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
