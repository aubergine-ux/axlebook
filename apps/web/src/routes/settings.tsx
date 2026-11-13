import {
  CHANNEL_TYPES,
  type Channel,
  type ChannelType,
  DATE_FORMATS,
  type NotifyPrefs,
  ROLES,
  type Role,
  UNIT_SYSTEMS,
  type UserAdmin,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import { FileTrigger, Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../api/auth';
import {
  absoluteFeedUrl,
  aiStatusQuery,
  assistantModelsQuery,
  calendarQuery,
  useCalendarFeed,
  useSetAssistantModel,
  useTestAssistant,
} from '../api/extras';
import {
  channelsQuery,
  settingsQuery,
  tokensQuery,
  useChangePassword,
  useChannelAction,
  useRestoreBackup,
  usersQuery,
  useSaveSettings,
  useScanNotifications,
  useTokenAction,
  useUpdateMe,
  useUserAction,
} from '../api/resources';
import { configQuery } from '../api/system';
import { PageHeader } from '../components/PageHeader';
import { CheckboxField, Segmented } from '../components/records/RecordForm';
import { Button, buttonClass } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorNote } from '../components/ui/ErrorNote';
import { FormDialog } from '../components/ui/FormDialog';
import { SelectField, TextField } from '../components/ui/fields';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useFormat } from '../lib/format';
import { useMe } from '../lib/useMe';
import { useViewPrefs } from '../lib/useViewPrefs';
import { type ThemePreference, useTheme } from '../theme/theme';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
    >
      <h2 id={id} className="text-heading font-semibold">
        {title}
      </h2>
      {intro && <p className="mt-1 text-ink-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Saved({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return show ? (
    <span role="status" className="self-center text-caption text-ink-muted">
      {t('settings.saved')}
    </span>
  ) : null;
}

function Profile() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const view = useViewPrefs();
  const update = useUpdateMe();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(me?.displayName ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  if (!me) return null;
  return (
    <Section id="profile" title={t('settings.profile')}>
      <Form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          update.mutate({ displayName: name, email });
        }}
        className="flex flex-col gap-4"
      >
        <ErrorNote error={update.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('settings.displayName')}
            value={name}
            onChange={setName}
            autoComplete="name"
          />
          <TextField
            label={t('settings.email')}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" isDisabled={update.isPending}>
            {t('settings.save')}
          </Button>
          <Saved show={update.isSuccess} />
        </div>
      </Form>
      <div className="mt-6 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <Segmented
          label={t('theme.label')}
          value={theme}
          onChange={(v: ThemePreference) => {
            setTheme(v);
            update.mutate({ theme: v });
          }}
          options={(['system', 'light', 'dark'] as const).map((v) => ({
            value: v,
            label: t(`theme.${v}`),
          }))}
        />
        <SelectField
          label={t('settings.units')}
          value={me.unitSystem}
          onChange={(v) => update.mutate({ unitSystem: v })}
          options={UNIT_SYSTEMS.map((u) => ({ value: u, label: t(`settings.unitSystems.${u}`) }))}
        />
        <SelectField
          label={t('settings.language')}
          value={i18n.language}
          onChange={(v) => {
            void i18n.changeLanguage(v);
            update.mutate({ locale: v });
          }}
          options={[{ value: 'en', label: t('settings.languages.en') }]}
        />
        <SelectField
          label={t('settings.dateFormat')}
          value={me.dateFormat}
          onChange={(v) => update.mutate({ dateFormat: v })}
          options={DATE_FORMATS.map((d) => ({
            value: d,
            label: t(`settings.dateFormats.${d}`),
          }))}
        />
        <OwnCurrency />
        <div className="flex flex-col gap-1">
          <ToggleSwitch
            label={t('settings.showTips')}
            isSelected={view.showTips}
            onChange={view.setShowTips}
          />
          <p className="text-caption text-ink-muted">{t('settings.showTipsHint')}</p>
        </div>
      </div>
    </Section>
  );
}

/** A person's own currency for how amounts are shown. Amounts themselves are never converted. */
function OwnCurrency() {
  const { t } = useTranslation();
  const me = useMe();
  const update = useUpdateMe();
  const instance = useQuery(configQuery).data?.currency ?? '';
  const [value, setValue] = useState(me?.currency ?? '');
  const [error, setError] = useState<string>();
  const commit = () => {
    const code = value.trim().toUpperCase();
    if (code === (me?.currency ?? '')) return;
    if (code !== '' && !/^[A-Z]{3}$/.test(code)) return setError(t('settings.currencyInvalid'));
    setError(undefined);
    update.mutate({ currency: code === '' ? null : code });
  };
  return (
    <TextField
      label={t('settings.ownCurrency')}
      description={t('settings.ownCurrencyHint', { currency: instance })}
      value={value}
      onChange={setValue}
      onBlur={commit}
      error={error}
      placeholder={instance}
      inputClassName="font-mono uppercase"
      maxLength={3}
      autoComplete="off"
    />
  );
}

function Password() {
  const { t } = useTranslation();
  const me = useMe();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Section id="password" title={t('settings.password')}>
      <Form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (next.length < 10) return setError(t('validation.passwordLength'));
          setError(undefined);
          change.mutate(
            { current: current || undefined, next },
            {
              onSuccess: () => {
                setCurrent('');
                setNext('');
              },
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        <ErrorNote error={change.error} />
        {change.isSuccess && (
          <p role="status" className="rounded-md bg-surface-sunken px-3 py-2">
            {t('settings.passwordChanged')}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {me?.hasPassword && (
            <TextField
              label={t('settings.currentPassword')}
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
          )}
          <TextField
            label={t('settings.newPassword')}
            description={t('auth.passwordHint')}
            type="password"
            value={next}
            onChange={(v) => {
              setNext(v);
              setError(undefined);
            }}
            error={error}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Button type="submit" isDisabled={change.isPending}>
            {t('settings.changePassword')}
          </Button>
        </div>
      </Form>
    </Section>
  );
}

function Tokens() {
  const { t } = useTranslation();
  const f = useFormat();
  const tokens = useQuery(tokensQuery).data ?? [];
  const action = useTokenAction();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <Section id="tokens" title={t('settings.tokens')} intro={t('settings.tokensIntro')}>
      <Form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!name.trim()) return;
          action.mutate(
            { create: name },
            {
              onSuccess: (r) => {
                setCreated(r?.token ?? null);
                setName('');
                setCopied(false);
              },
            },
          );
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <TextField
          label={t('settings.tokenName')}
          value={name}
          onChange={setName}
          className="min-w-48 flex-1"
        />
        <Button type="submit" isDisabled={action.isPending || !name.trim()}>
          {t('settings.createToken')}
        </Button>
      </Form>
      {created && (
        <div role="status" className="mt-3 rounded-md bg-yellow-soft p-3">
          <p className="text-caption font-semibold text-yellow">{t('settings.tokenCreated')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-sm bg-surface-raised px-2 py-1 font-mono text-data">
              {created}
            </code>
            <Button
              onPress={async () => {
                await navigator.clipboard?.writeText(created);
                setCopied(true);
              }}
            >
              {copied ? t('settings.copied') : t('settings.copy')}
            </Button>
          </div>
        </div>
      )}
      <ul className="mt-4">
        {tokens.length === 0 && <li className="text-ink-muted">{t('settings.noTokens')}</li>}
        {tokens.map((tok) => (
          <li
            key={tok.id}
            className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <span className="flex-1">
              <span className="block font-semibold">{tok.name}</span>
              <span className="font-mono text-caption text-ink-muted">
                {`${tok.prefix}… · `}
                {tok.lastUsedAt
                  ? t('settings.lastUsed', { date: f.date(tok.lastUsedAt) })
                  : t('settings.neverUsed')}
              </span>
            </span>
            <Button variant="ghost" onPress={() => action.mutate({ revoke: tok.id })}>
              {t('settings.revoke')}
            </Button>
          </li>
        ))}
      </ul>
      <a
        href="/api/docs"
        className="mt-3 inline-block text-label text-orange-text underline-offset-2 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        {t('settings.apiDocs')}
      </a>
    </Section>
  );
}

function ChannelForm({ channel, onDone }: { channel?: Channel; onDone: () => void }) {
  const { t } = useTranslation();
  const action = useChannelAction();
  const cfg = (channel?.config ?? {}) as Record<string, string>;
  const [type, setType] = useState<ChannelType>(channel?.type ?? 'ntfy');
  const [name, setName] = useState(channel?.name ?? '');
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [url, setUrl] = useState(cfg.url ?? '');
  const [urls, setUrls] = useState(cfg.urls ?? '');
  const [tag, setTag] = useState(cfg.tag ?? '');
  const [to, setTo] = useState(cfg.to ?? '');
  const [token, setToken] = useState(cfg.token ?? cfg.secret ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const config =
      type === 'email'
        ? { type, to }
        : type === 'gotify'
          ? { type, url, token }
          : type === 'ntfy'
            ? { type, url, ...(token && { token }) }
            : type === 'webhook'
              ? { type, url, ...(token && { secret: token }) }
              : type === 'apprise'
                ? { type, url, ...(urls && { urls }), ...(tag && { tag }) }
                : { type, url };
    action.mutate(
      {
        id: channel?.id,
        data: { name: name || t(`settings.channelTypes.${type}`), enabled, config } as never,
      },
      { onSuccess: onDone },
    );
  };
  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={action.error} />
      <SelectField
        label={t('settings.channelType')}
        value={type}
        onChange={setType}
        options={CHANNEL_TYPES.map((c) => ({ value: c, label: t(`settings.channelTypes.${c}`) }))}
      />
      <TextField label={t('settings.channelName')} value={name} onChange={setName} />
      {type === 'email' ? (
        <TextField
          label={t('settings.channelTo')}
          type="email"
          value={to}
          onChange={setTo}
          isRequired
        />
      ) : (
        <TextField
          label={t('settings.channelUrl')}
          type="url"
          value={url}
          onChange={setUrl}
          isRequired
          inputClassName="font-mono"
        />
      )}
      {(type === 'ntfy' || type === 'gotify') && (
        <TextField
          label={t('settings.channelToken')}
          value={token}
          onChange={setToken}
          isRequired={type === 'gotify'}
          inputClassName="font-mono"
        />
      )}
      {type === 'apprise' && (
        <>
          <p className="text-caption text-ink-muted">{t('settings.appriseHint')}</p>
          <TextField
            label={t('settings.appriseUrls')}
            description={t('settings.appriseUrlsHint')}
            value={urls}
            onChange={setUrls}
            inputClassName="font-mono"
          />
          <TextField
            label={t('settings.appriseTag')}
            value={tag}
            onChange={setTag}
            inputClassName="font-mono"
          />
        </>
      )}
      {type === 'webhook' && (
        <TextField
          label={t('settings.channelSecret')}
          value={token}
          onChange={setToken}
          inputClassName="font-mono"
        />
      )}
      <CheckboxField
        label={t('settings.channelEnabled')}
        isSelected={enabled}
        onChange={setEnabled}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={action.isPending}>
          {t('settings.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
      </div>
    </Form>
  );
}

/** Quiet hours and the weekly digest. Saved as each one changes. */
function NotifyPrefsForm() {
  const { t } = useTranslation();
  const me = useMe();
  const update = useUpdateMe();
  if (!me) return null;
  const n = me.notify;
  const save = (notify: Partial<NotifyPrefs>) => update.mutate({ notify });
  const quiet = n.quietStart != null && n.quietEnd != null;
  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      <ErrorNote error={update.error} />
      <div className="flex flex-col gap-2">
        <ToggleSwitch
          label={t('settings.quiet.toggle')}
          isSelected={quiet}
          onChange={(on) =>
            save(
              on
                ? { quietStart: '22:00', quietEnd: '07:00' }
                : { quietStart: null, quietEnd: null },
            )
          }
        />
        <p className="text-caption text-ink-muted">{t('settings.quiet.hint')}</p>
        {quiet && (
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <TextField
              label={t('settings.quiet.from')}
              type="time"
              value={n.quietStart ?? ''}
              onChange={(v) => v && save({ quietStart: v.slice(0, 5) })}
              inputClassName="font-mono"
            />
            <TextField
              label={t('settings.quiet.until')}
              type="time"
              value={n.quietEnd ?? ''}
              onChange={(v) => v && save({ quietEnd: v.slice(0, 5) })}
              inputClassName="font-mono"
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <ToggleSwitch
          label={t('settings.digest.toggle')}
          isSelected={n.digest}
          onChange={(digest) => save({ digest })}
        />
        <p className="text-caption text-ink-muted">{t('settings.digest.hint')}</p>
        {n.digest && (
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <SelectField
              label={t('settings.digest.day')}
              value={String(n.digestDay)}
              onChange={(v) => save({ digestDay: Number(v) })}
              options={(['1', '2', '3', '4', '5', '6', '0'] as const).map((d) => ({
                value: d,
                label: t(`settings.digest.days.${d}`),
              }))}
            />
            <SelectField
              label={t('settings.digest.hour')}
              value={String(n.digestHour)}
              onChange={(v) => save({ digestHour: Number(v) })}
              options={Array.from({ length: 24 }, (_, h) => ({
                value: String(h),
                label: `${String(h).padStart(2, '0')}:00`,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Channels() {
  const { t } = useTranslation();
  const channels = useQuery(channelsQuery).data ?? [];
  const action = useChannelAction();
  const me = useMe();
  const scan = useScanNotifications();
  const [editing, setEditing] = useState<Channel | 'new' | null>(null);
  return (
    <Section
      id="notifications"
      title={t('settings.notifications')}
      intro={t('settings.channelsIntro')}
    >
      <ul>
        {channels.length === 0 && <li className="text-ink-muted">{t('settings.noChannels')}</li>}
        {channels.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {c.name}{' '}
                {!c.enabled && (
                  <span className="text-caption font-normal text-ink-muted">
                    ({t('settings.disabled')})
                  </span>
                )}
              </span>
              <span className="text-caption text-ink-muted">
                {t(`settings.channelTypes.${c.type}`)}
              </span>
              {c.lastResult && (
                <span
                  className={`block text-caption ${c.lastResult.status === 'failed' ? 'text-red' : 'text-ink-muted'}`}
                >
                  {c.lastResult.status === 'sent'
                    ? t('settings.testSent')
                    : t('settings.testFailed', { error: c.lastResult.error ?? '' })}
                </span>
              )}
            </span>
            <Button
              isDisabled={action.isPending}
              onPress={() => action.mutate({ id: c.id, action: 'test' })}
            >
              {t('settings.test')}
            </Button>
            <Button variant="ghost" onPress={() => setEditing(c)}>
              {t('actions.edit')}
            </Button>
            <Button variant="ghost" onPress={() => action.mutate({ id: c.id, action: 'delete' })}>
              {t('settings.deleteChannel')}
            </Button>
          </li>
        ))}
      </ul>
      <Button className="mt-3" onPress={() => setEditing('new')}>
        {t('settings.addChannel')}
      </Button>
      {me?.role === 'admin' && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-caption text-ink-muted">{t('settings.scanHint')}</p>
          <Button isDisabled={scan.isPending} onPress={() => scan.mutate()}>
            {scan.isPending ? t('settings.scanning') : t('settings.scanNow')}
          </Button>
          <ErrorNote error={scan.error} className="mt-2" />
          {scan.data && (
            <p role="status" className="mt-2 text-caption text-ink-muted">
              {t('settings.scanResult', { count: scan.data.notified })}
            </p>
          )}
        </div>
      )}
      <NotifyPrefsForm />
      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('settings.addChannel') : t('settings.editChannel')}
      >
        {editing !== null && (
          <ChannelForm
            channel={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
    </Section>
  );
}

function Data() {
  const { t } = useTranslation();
  const me = useMe();
  const restore = useRestoreBackup();
  return (
    <Section id="data" title={t('settings.data')} intro={t('settings.backupHint')}>
      <a href="/api/v1/backup" className={buttonClass('secondary')} download>
        {t('settings.backup')}
      </a>
      {me?.role === 'admin' && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-caption text-ink-muted">{t('settings.restoreHint')}</p>
          <FileTrigger
            acceptedFileTypes={['application/zip', '.zip']}
            onSelect={(files) => files?.[0] && restore.mutate(files[0])}
          >
            <Button isDisabled={restore.isPending}>{t('settings.restore')}</Button>
          </FileTrigger>
          <ErrorNote error={restore.error} className="mt-2" />
          {restore.isSuccess && (
            <p role="status" className="mt-2 rounded-md bg-surface-sunken px-3 py-2">
              {t('settings.restoreDone')}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function Instance() {
  const { t } = useTranslation();
  const settings = useQuery(settingsQuery).data;
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!settings) return null;
  const val = (k: keyof typeof settings) => draft[k] ?? String(settings[k]);
  const set = (k: string) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Section id="instance" title={t('settings.instance')}>
      <Form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate({
            currency: val('currency').toUpperCase(),
            soonDays: Number(val('soonDays')),
            soonDistanceMi: Number(val('soonDistanceMi')),
            soonDistanceKm: Number(val('soonDistanceKm')),
          });
        }}
        className="flex flex-col gap-4"
      >
        <ErrorNote error={save.error} />
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField
            label={t('settings.currency')}
            value={val('currency')}
            onChange={set('currency')}
            inputClassName="font-mono uppercase"
            maxLength={3}
          />
          <TextField
            label={t('settings.soonDays')}
            value={val('soonDays')}
            onChange={set('soonDays')}
            inputMode="numeric"
            inputClassName="font-mono"
          />
          <TextField
            label={t('settings.soonDistanceMi')}
            value={val('soonDistanceMi')}
            onChange={set('soonDistanceMi')}
            inputMode="numeric"
            inputClassName="font-mono"
          />
          <TextField
            label={t('settings.soonDistanceKm')}
            value={val('soonDistanceKm')}
            onChange={set('soonDistanceKm')}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" isDisabled={save.isPending}>
            {t('settings.save')}
          </Button>
          <Saved show={save.isSuccess} />
        </div>
      </Form>
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="mb-1 text-label">{t('settings.lookups.title')}</h3>
        <p className="mb-3 max-w-2xl text-caption text-ink-muted">{t('settings.lookups.body')}</p>
        <ToggleSwitch
          label={t('settings.lookups.toggle')}
          isSelected={settings.onlineLookups}
          onChange={(onlineLookups) => save.mutate({ onlineLookups })}
        />
      </div>
    </Section>
  );
}

function People() {
  const { t } = useTranslation();
  const me = useMe();
  const users = useQuery(usersQuery).data ?? [];
  const action = useUserAction();
  const [adding, setAdding] = useState(false);
  const [pw, setPw] = useState<UserAdmin | null>(null);
  const [deleting, setDeleting] = useState<UserAdmin | null>(null);
  const blank = { username: '', password: '', displayName: '', email: '', role: 'editor' as Role };
  const [form, setForm] = useState(blank);
  const [newPw, setNewPw] = useState('');
  const roles = ROLES.map((r) => ({ value: r, label: t(`settings.roles.${r}`) }));
  return (
    <Section id="people" title={t('settings.users')}>
      <ErrorNote error={action.error} className="mb-3" />
      <ul>
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-end gap-2 border-b border-line py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1 self-center">
              <span className="block font-semibold">
                {u.displayName ?? u.username}{' '}
                {u.id === me?.id && (
                  <span className="text-caption font-normal text-ink-muted">
                    ({t('settings.you')})
                  </span>
                )}
              </span>
              <span className="font-mono text-caption text-ink-muted">{u.username}</span>
              {u.disabled && (
                <span className="ml-2 text-caption font-semibold text-red">
                  {t('settings.disabled')}
                </span>
              )}
            </span>
            <SelectField
              label={t('settings.role')}
              value={u.role}
              onChange={(role) => action.mutate({ id: u.id, data: { role } })}
              options={roles}
              className="w-36"
            />
            {u.id !== me?.id && (
              <>
                <Button
                  variant="ghost"
                  onPress={() => action.mutate({ id: u.id, data: { disabled: !u.disabled } })}
                >
                  {u.disabled ? t('settings.enable') : t('settings.disable')}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setNewPw('');
                    setPw(u);
                  }}
                >
                  {t('settings.resetPassword')}
                </Button>
                <Button variant="ghost" onPress={() => setDeleting(u)}>
                  {t('settings.deleteUser')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <Button className="mt-3" onPress={() => setAdding(true)}>
        {t('settings.addUser')}
      </Button>
      <FormDialog isOpen={adding} onOpenChange={setAdding} title={t('settings.addUser')}>
        <Form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            action.mutate(
              {
                data: {
                  ...form,
                  password: form.password || undefined,
                  displayName: form.displayName.trim() || null,
                  email: form.email.trim() || null,
                },
              },
              {
                onSuccess: () => {
                  setAdding(false);
                  setForm(blank);
                },
              },
            );
          }}
          className="flex flex-col gap-4"
        >
          <ErrorNote error={action.error} />
          <TextField
            label={t('settings.username')}
            value={form.username}
            onChange={(v) => setForm((f) => ({ ...f, username: v }))}
            isRequired
            autoFocus
          />
          <TextField
            label={t('settings.displayName')}
            value={form.displayName}
            onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
            autoComplete="off"
          />
          <TextField
            label={t('settings.email')}
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            autoComplete="off"
          />
          <TextField
            label={t('auth.password')}
            description={t('auth.passwordHint')}
            type="password"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            autoComplete="new-password"
          />
          <SelectField
            label={t('settings.role')}
            description={t(`settings.roleHints.${form.role}`)}
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
            options={roles}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" isDisabled={action.isPending}>
              {t('settings.addUser')}
            </Button>
            <Button onPress={() => setAdding(false)}>{t('actions.cancel')}</Button>
          </div>
        </Form>
      </FormDialog>
      <ConfirmDialog
        isOpen={pw !== null}
        onOpenChange={(o) => !o && setPw(null)}
        title={t('settings.resetPassword')}
        confirmLabel={t('settings.save')}
        confirmVariant="primary"
        onConfirm={() =>
          pw &&
          newPw.length >= 10 &&
          action.mutate({ id: pw.id, data: { password: newPw } }, { onSuccess: () => setPw(null) })
        }
      >
        <TextField
          label={t('settings.newPassword')}
          description={t('auth.passwordHint')}
          type="password"
          value={newPw}
          onChange={setNewPw}
          autoComplete="new-password"
        />
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('settings.deleteUserTitle', { name: deleting?.username ?? '' })}
        confirmLabel={t('settings.deleteUser')}
        onConfirm={() =>
          deleting &&
          action.mutate({ id: deleting.id, remove: true }, { onSuccess: () => setDeleting(null) })
        }
      >
        {t('settings.deleteUserBody')}
      </ConfirmDialog>
    </Section>
  );
}

function Calendar() {
  const { t } = useTranslation();
  const feed = useQuery(calendarQuery).data;
  const change = useCalendarFeed();
  const [copied, setCopied] = useState(false);
  const url = feed?.url ? absoluteFeedUrl(feed.url) : null;
  return (
    <Section id="calendar" title={t('settings.calendar')} intro={t('settings.calendarIntro')}>
      {url ? (
        <div className="flex flex-col gap-3">
          <TextField
            label={t('settings.calendarLink')}
            value={url}
            isReadOnly
            inputClassName="font-mono text-caption"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onPress={async () => {
                await navigator.clipboard?.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? t('settings.copied') : t('settings.copy')}
            </Button>
            <Button
              variant="ghost"
              isDisabled={change.isPending}
              onPress={() => change.mutate(true)}
            >
              {t('settings.calendarReset')}
            </Button>
            <Button
              variant="ghost"
              isDisabled={change.isPending}
              onPress={() => change.mutate(false)}
            >
              {t('settings.calendarOff')}
            </Button>
          </div>
        </div>
      ) : (
        <Button isDisabled={change.isPending} onPress={() => change.mutate(true)}>
          {t('settings.calendarCreate')}
        </Button>
      )}
      <ErrorNote error={change.error} className="mt-3" />
    </Section>
  );
}

function LocalAi() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const s = useQuery(aiStatusQuery).data;
  if (!s) return null;
  const message = !s.enabled
    ? t('settings.aiStatus.off')
    : s.pullProgress != null
      ? t('settings.aiStatus.downloading', { pct: f.number(Math.round(s.pullProgress * 100)) })
      : !s.reachable
        ? t('settings.aiStatus.unreachable')
        : !s.modelReady
          ? t('settings.aiStatus.missing', { model: s.model })
          : t('settings.aiStatus.ready', { model: s.model });
  return (
    <Section id="ai" title={t('settings.ai')} intro={t('settings.aiIntro')}>
      <p role="status" className={s.enabled && s.reachable && s.modelReady ? '' : 'text-ink-muted'}>
        {message}
      </p>
      {s.enabled && s.reachable && me?.role === 'admin' && <AssistantAdmin current={s.model} />}
    </Section>
  );
}

/** Admins: choose the model from what's installed in Ollama, and try it. */
function AssistantAdmin({ current }: { current: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const models = useQuery(assistantModelsQuery);
  const choose = useSetAssistantModel();
  const test = useTestAssistant();
  const [pick, setPick] = useState(current);
  const list = models.data ?? [];
  const options = list.some((m) => m.name === current)
    ? list
    : [{ name: current, size: 0, vision: false }, ...list];
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField
          label={t('settings.aiModel')}
          description={t('settings.aiModelHint')}
          value={pick}
          onChange={setPick}
          className="flex-1"
          options={options.map((m) => ({
            value: m.name,
            label: [
              m.name,
              m.size ? t('settings.aiSize', { size: f.decimals(m.size / 1e9, 1) }) : null,
              m.vision ? t('settings.aiVision') : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
        <Button
          onPress={() => choose.mutate(pick)}
          isDisabled={choose.isPending || pick === current}
        >
          {t('actions.save')}
        </Button>
      </div>
      <ErrorNote error={choose.error ?? models.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onPress={() => test.mutate()} isDisabled={test.isPending}>
          {test.isPending ? t('settings.aiTesting') : t('settings.aiTest')}
        </Button>
        {test.data && (
          <p role="status" className="font-mono text-data">
            {t('settings.aiTestOk', {
              model: test.data.model,
              seconds: f.decimals(test.data.ms / 1000, 1),
            })}
          </p>
        )}
      </div>
      <ErrorNote error={test.error} />
    </div>
  );
}

function SettingsPage() {
  const { t } = useTranslation();
  const me = useMe();
  const config = useQuery(configQuery).data;
  const logout = useLogout();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('nav.settings')} />
      <Profile />
      <Password />
      <Channels />
      <Calendar />
      <Tokens />
      <Data />
      {me?.role === 'admin' && <Instance />}
      {me?.role === 'admin' && <People />}
      <LocalAi />
      <Section id="about" title={t('settings.about')}>
        <p className="font-mono text-data">
          {t('settings.version', { version: config?.version ?? '' })}
        </p>
        <p className="mt-1 text-caption text-ink-muted">
          {t('settings.license')} ·{' '}
          <a
            href="https://github.com/aubergine-ux/axlebook"
            className="text-orange-text underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            {t('settings.source')}
          </a>
        </p>
        <Button className="mt-4 lg:hidden" onPress={() => logout.mutate()}>
          {t('nav.signOut')}
        </Button>
      </Section>
    </div>
  );
}
