import { RECORD_KINDS } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { recordsQuery } from '../api/resources';
import { vehiclesQuery } from '../api/vehicles';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/records/RecordForm';
import { RecordRow } from '../components/records/RecordRow';
import { TextField } from '../components/ui/fields';

export const Route = createFileRoute('/search')({
  validateSearch: z.object({
    q: z.string().optional(),
    kind: z.enum(['all', ...RECORD_KINDS]).optional(),
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();
  const { q = '', kind = 'all' } = Route.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const [text, setText] = useState(q);
  const vehicles = useQuery(vehiclesQuery('all')).data ?? [];
  const active = q.trim().length > 0 || kind !== 'all';
  const results = useQuery({
    ...recordsQuery({ q: q || undefined, kind: kind === 'all' ? undefined : kind, limit: 100 }),
    enabled: active,
  });

  useEffect(() => {
    const h = setTimeout(() => {
      if (text !== q)
        void navigate({ search: (s) => ({ ...s, q: text || undefined }), replace: true });
    }, 250);
    return () => clearTimeout(h);
  }, [text, q, navigate]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t('search.title')} />
      <TextField
        label={t('nav.search')}
        placeholder={t('search.placeholder')}
        value={text}
        onChange={setText}
        type="search"
        autoFocus
      />
      <Segmented
        label={t('record.kindLabel')}
        value={kind}
        onChange={(k) =>
          navigate({ search: (s) => ({ ...s, kind: k === 'all' ? undefined : k }), replace: true })
        }
        options={[
          { value: 'all', label: t('record.filterAll') },
          ...RECORD_KINDS.map((k) => ({ value: k, label: t(`record.kinds.${k}`) })),
        ]}
      />
      {!active ? (
        <p className="text-ink-muted">{t('search.hint')}</p>
      ) : results.data ? (
        <section
          className="rounded-lg border border-line bg-surface-raised px-3 shadow-card md:px-5"
          aria-live="polite"
        >
          {results.data.items.length === 0 ? (
            <p className="py-8 text-center text-ink-muted">
              {q.trim() ? t('search.none', { q }) : t('search.noneOfKind')}
            </p>
          ) : (
            <>
              <p className="border-b border-line py-2 text-caption text-ink-muted">
                {t('search.results', { count: results.data.total })}
              </p>
              <ul>
                {results.data.items.map((r) => {
                  const v = vehicles.find((x) => x.id === r.vehicleId);
                  return v ? (
                    <RecordRow
                      key={r.id}
                      record={r}
                      vehicle={v}
                      vehicleName={v.nickname ?? `${v.year} ${v.make} ${v.model}`}
                    />
                  ) : null;
                })}
              </ul>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
