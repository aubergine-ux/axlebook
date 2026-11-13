import type { Recall, Vehicle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { recallsQuery, useCheckRecalls, useSetRecallState } from '../../api/lookups';
import { useFormat } from '../../lib/format';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';
import { StatusBadge } from '../ui/StatusBadge';

/** Safety recalls for a vehicle: what NHTSA lists, and what's been done about each one. */
export function RecallsCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { data } = useQuery(recallsQuery(vehicle.id));
  const check = useCheckRecalls(vehicle.id);
  const setState = useSetRecallState(vehicle.id);
  const canEdit = vehicle.access !== 'view';
  if (!data) return null;
  // Nothing stored and no way to look: say nothing rather than advertise a switched-off feature.
  if (!data.enabled && data.recalls.length === 0) return null;
  const open = data.recalls.filter((r) => r.state === 'open').length;

  return (
    <section
      aria-labelledby="recalls-h"
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="recalls-h" className="text-heading font-semibold">
          {t('recalls.title')}
        </h2>
        {canEdit && data.enabled && (
          <Button isDisabled={check.isPending} onPress={() => check.mutate()}>
            {check.isPending ? t('recalls.checking') : t('recalls.check')}
          </Button>
        )}
      </div>
      <ErrorNote error={check.error ?? setState.error} className="mb-2" />
      <p className="text-caption text-ink-muted" role="status">
        {data.checkedAt
          ? t('recalls.checked', { date: f.date(data.checkedAt.slice(0, 10)), count: open })
          : t('recalls.never')}
      </p>
      {data.recalls.length > 0 && (
        <ul className="mt-2">
          {data.recalls.map((r) => (
            <RecallRow
              key={r.id}
              recall={r}
              canEdit={canEdit}
              isPending={setState.isPending}
              onState={(state) => setState.mutate({ id: r.id, state })}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-caption text-ink-muted">{t('recalls.source')}</p>
    </section>
  );
}

function RecallRow({
  recall: r,
  canEdit,
  isPending,
  onState,
}: {
  recall: Recall;
  canEdit: boolean;
  isPending: boolean;
  onState: (state: Recall['state']) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <p className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.state === 'open' ? 'overdue' : 'upcoming'}>
          {t(`recalls.states.${r.state}`)}
        </StatusBadge>
        <span className="font-mono text-data">{r.campaign}</span>
        {r.reportDate && (
          <span className="font-mono text-caption text-ink-muted">{f.date(r.reportDate)}</span>
        )}
      </p>
      {r.component && <p className="mt-1 font-semibold">{r.component}</p>}
      {(r.summary || r.consequence || r.remedy) && (
        <details className="mt-1">
          <summary className="cursor-pointer text-label text-ink-muted">
            {t('recalls.details')}
          </summary>
          <dl className="mt-2 flex flex-col gap-2 text-caption">
            {(
              [
                ['summary', r.summary],
                ['consequence', r.consequence],
                ['remedy', r.remedy],
              ] as const
            ).map(
              ([k, text]) =>
                text && (
                  <div key={k}>
                    <dt className="text-label text-ink-muted">{t(`recalls.fields.${k}`)}</dt>
                    <dd>{text}</dd>
                  </div>
                ),
            )}
          </dl>
        </details>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          {r.state === 'open' ? (
            <>
              <Button isDisabled={isPending} onPress={() => onState('completed')}>
                {t('recalls.markDone')}
              </Button>
              <Button variant="ghost" isDisabled={isPending} onPress={() => onState('dismissed')}>
                {t('recalls.dismiss')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" isDisabled={isPending} onPress={() => onState('open')}>
              {t('recalls.reopen')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
