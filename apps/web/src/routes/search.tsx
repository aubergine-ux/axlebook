import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { recordsQuery } from '../api/resources';
import { vehiclesQuery } from '../api/vehicles';
import { PageHeader } from '../components/PageHeader';
import { RecordRow } from '../components/records/RecordRow';
import { TextField } from '../components/ui/fields';

export const Route = createFileRoute('/search')({
  validateSearch: z.object({ q: z.string().optional() }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();
  const { q = '' } = Route.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const [text, setText] = useState(q);
  const vehicles = useQuery(vehiclesQuery('all')).data ?? [];
  const results = useQuery({ ...recordsQuery({ q, limit: 100 }), enabled: q.trim().length > 0 });

  useEffect(() => {
    const h = setTimeout(() => {
      if (text !== q) void navigate({ search: { q: text || undefined }, replace: true });
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
      {!q.trim() ? (
        <p className="text-ink-muted">{t('search.hint')}</p>
      ) : results.data ? (
        <section
          className="rounded-lg border border-line bg-surface-raised px-3 shadow-card md:px-5"
          aria-live="polite"
        >
          {results.data.items.length === 0 ? (
            <p className="py-8 text-center text-ink-muted">{t('search.none', { q })}</p>
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
