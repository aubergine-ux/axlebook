import { RECORD_KINDS } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { recordsQuery } from '../../../../api/resources';
import { vehicleQuery } from '../../../../api/vehicles';
import { Icon } from '../../../../components/Icon';
import { Segmented } from '../../../../components/records/RecordForm';
import { RecordRow } from '../../../../components/records/RecordRow';
import { Button, buttonClass, LinkButton } from '../../../../components/ui/Button';
import { TextField } from '../../../../components/ui/fields';
import { useFormat } from '../../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/records/')({
  validateSearch: z.object({
    kind: z.enum(['all', ...RECORD_KINDS]).optional(),
    q: z.string().optional(),
    tag: z.string().optional(),
  }),
  component: RecordsTab,
});

function RecordsTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const vehicleId = Route.useParams().vehicleId;
  const id = Number(vehicleId);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const v = useQuery(vehicleQuery(id)).data;
  const [q, setQ] = useState(search.q ?? '');
  const [limit, setLimit] = useState(50);
  const kind = search.kind ?? 'all';
  const page = useQuery(
    recordsQuery({
      vehicleId: id,
      kind: kind === 'all' ? undefined : kind,
      q: search.q,
      tag: search.tag,
      limit,
    }),
  );

  // Debounce typing into the URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search.q ?? '') !== q)
        void navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
    }, 300);
    return () => clearTimeout(handle);
  }, [q, search.q, navigate]);

  if (!v) return null;
  const canEdit = v.access !== 'view';
  const filtered = kind !== 'all' || search.q || search.tag;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        {canEdit && (
          <LinkButton
            to="/vehicles/$vehicleId/records/new"
            params={{ vehicleId }}
            search={{ kind: kind === 'all' ? undefined : kind }}
            variant="primary"
          >
            <Icon name="add" size={16} />
            {t('record.add')}
          </LinkButton>
        )}
        <a
          href={`/api/v1/vehicles/${id}/export.csv?kind=${kind}`}
          className={buttonClass('secondary')}
          download
        >
          <Icon name="export" size={16} />
          {t('record.export')}
        </a>
        {canEdit && (
          <LinkButton to="/vehicles/$vehicleId/import" params={{ vehicleId }} variant="ghost">
            {t('record.import')}
          </LinkButton>
        )}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Segmented
          label={t('record.kindLabel')}
          value={kind}
          onChange={(k) =>
            navigate({
              search: (s) => ({ ...s, kind: k === 'all' ? undefined : k }),
              replace: true,
            })
          }
          options={[
            { value: 'all', label: t('record.filterAll') },
            ...RECORD_KINDS.map((k) => ({ value: k, label: t(`record.kinds.${k}`) })),
          ]}
        />
        <TextField
          label={t('nav.search')}
          placeholder={t('record.searchPlaceholder')}
          value={q}
          onChange={setQ}
          type="search"
          className="md:max-w-xs md:flex-1"
        />
      </div>
      {search.tag && (
        <p className="flex items-center gap-2">
          <span className="rounded-full bg-surface-sunken px-2 text-caption">{search.tag}</span>
          <Button
            variant="ghost"
            className="min-h-9"
            onPress={() => navigate({ search: (s) => ({ ...s, tag: undefined }), replace: true })}
          >
            {t('record.clearFilters')}
          </Button>
        </p>
      )}
      <section className="rounded-lg border border-line bg-surface-raised px-3 shadow-card md:px-5">
        {page.data && page.data.items.length > 0 ? (
          <>
            <p className="flex justify-between border-b border-line py-2 text-caption text-ink-muted">
              <span>{t('record.count', { count: page.data.total })}</span>
              <span className="font-mono">
                {t('record.totalCost', { amount: f.money(page.data.totalCost) })}
              </span>
            </p>
            <ul>
              {page.data.items.map((r) => (
                <RecordRow key={r.id} record={r} vehicle={v} />
              ))}
            </ul>
            {page.data.total > page.data.items.length && (
              <div className="py-3 text-center">
                <Button onPress={() => setLimit((l) => l + 100)}>{t('record.loadMore')}</Button>
              </div>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-ink-muted">
            {page.isPending
              ? t('common.loading')
              : filtered
                ? t('record.emptyFiltered')
                : t('record.empty')}
          </p>
        )}
      </section>
    </div>
  );
}
