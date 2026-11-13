import type { HistoryLink, HistoryOptions } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { historyLinksQuery, historyQuery, useHistoryLinkAction } from '../../../api/history';
import { vehicleQuery } from '../../../api/vehicles';
import { Button } from '../../../components/ui/Button';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { SelectField, TextField } from '../../../components/ui/fields';
import { QueryState } from '../../../components/ui/QueryState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ToggleSwitch } from '../../../components/ui/ToggleSwitch';
import { HistoryReport } from '../../../components/vehicles/HistoryReport';
import { useFormat } from '../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/history')({ component: HistoryTab });

const EXPIRY = ['7', '30', '90', '365', 'never'] as const;

function HistoryTab() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const [options, setOptions] = useState<HistoryOptions>({
    showCosts: false,
    showVin: false,
    showNotes: false,
  });
  const query = useQuery(historyQuery(id, options));
  if (!v) return null;
  const toggle = (k: keyof HistoryOptions) => (on: boolean) =>
    setOptions((o) => ({ ...o, [k]: on }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 print:hidden">
        <p className="max-w-2xl text-ink-muted">{t('history.intro')}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ToggleSwitch
            label={t('history.showCosts')}
            isSelected={options.showCosts}
            onChange={toggle('showCosts')}
          />
          <ToggleSwitch
            label={t('history.showVin')}
            isSelected={options.showVin}
            onChange={toggle('showVin')}
          />
          <ToggleSwitch
            label={t('history.showNotes')}
            isSelected={options.showNotes}
            onChange={toggle('showNotes')}
          />
          <Button variant="primary" onPress={() => window.print()}>
            {t('history.print')}
          </Button>
        </div>
      </div>
      <QueryState query={query}>{(h) => <HistoryReport history={h} />}</QueryState>
      {v.access === 'owner' && <ShareLinks vehicleId={id} options={options} />}
    </div>
  );
}

/** Links that let someone read the report without an account. The owner makes and revokes them. */
function ShareLinks({ vehicleId, options }: { vehicleId: number; options: HistoryOptions }) {
  const { t } = useTranslation();
  const f = useFormat();
  const links = useQuery(historyLinksQuery(vehicleId)).data ?? [];
  const action = useHistoryLinkAction(vehicleId);
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>('30');
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (link: HistoryLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
    } catch {
      // No clipboard access (an insecure origin): the address is on screen to copy by hand.
      setCopied(null);
    }
  };
  const shows = (l: HistoryLink) =>
    [
      l.showCosts && t('history.showCosts'),
      l.showVin && t('history.showVin'),
      l.showNotes && t('history.showNotes'),
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <section
      aria-labelledby="share-h"
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6 print:hidden"
    >
      <h2 id="share-h" className="text-heading font-semibold">
        {t('history.share.title')}
      </h2>
      <p className="mt-1 mb-4 max-w-2xl text-caption text-ink-muted">{t('history.share.intro')}</p>
      <ErrorNote error={action.error} className="mb-3" />
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('history.share.label')}
          value={label}
          onChange={setLabel}
          maxLength={80}
          className="w-56"
        />
        <SelectField
          label={t('history.share.expires')}
          value={expiry}
          onChange={setExpiry}
          options={EXPIRY.map((e) => ({ value: e, label: t(`history.share.expiry.${e}`) }))}
          className="w-44"
        />
        <Button
          isDisabled={action.isPending}
          onPress={() =>
            action.mutate(
              {
                create: {
                  ...options,
                  label,
                  expiresInDays: expiry === 'never' ? null : Number(expiry),
                },
              },
              { onSuccess: () => setLabel('') },
            )
          }
        >
          {t('history.share.create')}
        </Button>
      </div>
      <p className="mt-2 text-caption text-ink-muted">{t('history.share.usesOptions')}</p>

      {links.length > 0 && (
        <ul className="mt-4">
          {links.map((l) => (
            <li key={l.id} className="border-t border-line py-3">
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge status={l.state === 'active' ? 'upcoming' : 'overdue'}>
                  {t(`history.share.states.${l.state}`)}
                </StatusBadge>
                <span className="font-semibold">{l.label ?? t('history.share.unnamed')}</span>
                <span className="font-mono text-caption text-ink-muted">
                  {l.state === 'active'
                    ? l.expiresAt
                      ? t('history.share.until', { date: f.date(l.expiresAt.slice(0, 10)) })
                      : t('history.share.expiry.never')
                    : ''}
                </span>
                <span className="font-mono text-caption text-ink-muted">
                  {t('history.share.views', { count: l.views })}
                </span>
              </p>
              {shows(l) && (
                <p className="mt-1 text-caption text-ink-muted">
                  {t('history.share.includes', { what: shows(l) })}
                </p>
              )}
              {l.state === 'active' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-surface-sunken px-2 py-1.5 font-mono text-caption">
                    {l.url}
                  </code>
                  <Button onPress={() => copy(l)}>
                    {copied === l.id ? t('history.share.copied') : t('history.share.copy')}
                  </Button>
                  <Button
                    variant="ghost"
                    isDisabled={action.isPending}
                    onPress={() => action.mutate({ revoke: l.id })}
                  >
                    {t('history.share.revoke')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
