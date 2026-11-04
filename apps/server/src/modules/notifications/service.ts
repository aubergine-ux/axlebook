import { createHmac } from 'node:crypto';
import {
  type Channel,
  type ChannelConfig,
  ChannelConfig as ChannelConfigSchema,
  type ChannelInput,
  type Reminder,
} from '@axlebook/shared';
import type { FastifyBaseLogger } from 'fastify';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { ChannelRow, User } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { translator } from '../../lib/i18n';
import { nowIso } from '../../lib/time';
import type { ReminderService } from '../reminders/service';

export interface Message {
  title: string;
  body: string;
  url?: string;
  reminder?: Pick<
    Reminder,
    'id' | 'title' | 'status' | 'vehicleId' | 'vehicleTitle' | 'dueDate' | 'dueOdometer'
  >;
}

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
        title: t('notify.testTitle'),
        body: t('notify.testBody'),
        url: this.config.baseUrl?.toString(),
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
            Tags: msg.reminder?.status === 'overdue' ? 'warning' : 'wrench',
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
              priority: msg.reminder?.status === 'overdue' ? 7 : 5,
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
      case 'webhook': {
        const body = JSON.stringify({
          event: msg.reminder ? 'reminder.status' : 'test',
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

  // ── Reminder scan ─────────────────────────────────────────────────────────

  /**
   * Notify each person who can see a vehicle when one of its reminders gets worse
   * (upcoming → due soon → overdue). Each step is sent once. When a reminder
   * improves (completed or rescheduled), the marker resets so later steps notify again.
   */
  async scan(): Promise<{ notified: number }> {
    const rows = await this.db
      .selectFrom('reminders')
      .innerJoin('vehicles', 'vehicles.id', 'reminders.vehicle_id')
      .selectAll('reminders')
      .where('reminders.archived_at', 'is', null)
      .where('vehicles.archived_at', 'is', null)
      .execute();
    if (rows.length === 0) return { notified: 0 };
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
      const shared = await this.db
        .selectFrom('vehicle_shares')
        .select('user_id')
        .where('vehicle_id', '=', vehicle.id)
        .execute();
      const recipients = await this.db
        .selectFrom('users')
        .selectAll()
        .where('id', 'in', [vehicle.owner_id, ...shared.map((s) => s.user_id)])
        .where('disabled', '=', 0)
        .execute();
      for (const user of recipients) {
        const channels = await this.db
          .selectFrom('notification_channels')
          .selectAll()
          .where('user_id', '=', user.id)
          .where('enabled', '=', 1)
          .execute();
        if (channels.length === 0) continue;
        const msg = this.reminderMessage(r, user.locale);
        for (const ch of channels) if (await this.deliver(ch, msg, r.id)) notified++;
      }
      await this.db
        .updateTable('reminders')
        .set({ last_notified_status: r.status, last_notified_at: nowIso() })
        .where('id', '=', r.id)
        .execute();
    }
    return { notified };
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
      title: t(`notify.${r.status === 'overdue' ? 'overdue' : 'due_soon'}`, {
        title: r.title,
        vehicle: r.vehicleTitle,
      }),
      body: parts.join(' '),
      url: this.config.baseUrl
        ? new URL(`/vehicles/${r.vehicleId}/reminders`, this.config.baseUrl).toString()
        : undefined,
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
