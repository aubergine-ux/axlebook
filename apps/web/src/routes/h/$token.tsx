import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { sharedHistoryQuery } from '../../api/history';
import { Button } from '../../components/ui/Button';
import { HistoryReport } from '../../components/vehicles/HistoryReport';
import { useFormat } from '../../lib/format';

export const Route = createFileRoute('/h/$token')({ component: SharedHistory });

/** A shared service history: read by anyone holding the link, with no way into the app. */
function SharedHistory() {
  const { t } = useTranslation();
  const f = useFormat();
  const { token } = Route.useParams();
  const query = useQuery(sharedHistoryQuery(token));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-4 px-4 py-6 md:py-10 print:p-0">
      {query.isPending && (
        <p role="status" className="py-16 text-center text-ink-muted">
          {t('common.loading')}
        </p>
      )}
      {query.isError && (
        <section className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface-raised p-6 text-center shadow-card">
          <h1 className="text-title font-semibold">{t('history.shared.goneTitle')}</h1>
          <p className="mt-2 text-ink-muted">{t('history.shared.goneBody')}</p>
        </section>
      )}
      {query.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-caption text-ink-muted">
              {query.data.expiresAt
                ? t('history.shared.expires', { date: f.date(query.data.expiresAt.slice(0, 10)) })
                : t('history.shared.readOnly')}
            </p>
            <Button onPress={() => window.print()}>{t('history.print')}</Button>
          </div>
          <HistoryReport history={query.data} />
        </>
      )}
    </main>
  );
}
