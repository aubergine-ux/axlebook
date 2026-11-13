import type { VehicleHistory } from '@axlebook/shared';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../lib/format';

/**
 * A vehicle's service history laid out as a document: a letterhead, the vehicle's particulars,
 * and every job with its date and odometer reading. It prints on paper as it looks on screen.
 */
export function HistoryReport({ history: h }: { history: VehicleHistory }) {
  const { t } = useTranslation();
  const f = useFormat();
  const money = (milli: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: h.currency }).format(
      milli / 1000,
    );
  const v = h.vehicle;
  const facts: [string, string][] = [
    ...(v.engine ? [[t('vehicle.fields.engine'), v.engine] as [string, string]] : []),
    ...(v.color ? [[t('vehicle.fields.color'), v.color] as [string, string]] : []),
    ...(v.vin ? [[t('vehicle.fields.vin'), v.vin] as [string, string]] : []),
    ...(v.currentOdometer != null
      ? [[t('history.odometer'), f.distance(v.currentOdometer, v.odometerUnit)] as [string, string]]
      : []),
    [t('history.jobs'), f.number(h.totals.records)],
    ...(h.totals.firstDate && h.totals.lastDate
      ? [
          [
            t('history.period'),
            t('history.range', {
              from: f.date(h.totals.firstDate),
              to: f.date(h.totals.lastDate),
            }),
          ] as [string, string],
        ]
      : []),
    ...(h.totals.cost != null
      ? [[t('history.spent'), money(h.totals.cost)] as [string, string]]
      : []),
  ];

  return (
    <article className="history-report mx-auto w-full max-w-3xl rounded-lg border border-line bg-surface-raised p-5 shadow-card md:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="text-label text-ink-muted">{t('history.kicker')}</p>
          <h1 className="ax-display text-[28px] leading-[32px]">{v.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <img src="/brand/mark.svg" alt="" className="on-light h-7 w-7" />
          <img src="/brand/mark-dark.svg" alt="" className="on-dark h-7 w-7" />
          <span className="text-heading font-semibold">{t('appName')}</span>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-label text-ink-muted">{label}</dt>
            <dd className="font-mono text-data break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {h.records.length === 0 ? (
        <p className="mt-8 rounded-md bg-surface-sunken p-6 text-center text-ink-muted">
          {t('history.empty')}
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto print:overflow-visible">
          <table className="w-full text-left">
            <thead className="border-b border-line-strong text-label text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t('history.columns.date')}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  {t('history.columns.odometer')}
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  {t('history.columns.work')}
                </th>
                {h.options.showCosts && (
                  <th scope="col" className="py-2 text-right font-semibold">
                    {t('history.columns.cost')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {h.records.map((r, i) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: a report has no ids, and never reorders
                  key={i}
                  className="break-inside-avoid border-b border-line align-top"
                >
                  <td className="py-2 pr-4 font-mono text-data whitespace-nowrap">
                    {f.date(r.date)}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-data whitespace-nowrap tabular-nums">
                    {r.odometer != null ? f.distance(r.odometer, v.odometerUnit) : ''}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="font-semibold">{r.title}</span>
                    <span className="ml-2 text-caption text-ink-muted">
                      {t(`record.kinds.${r.kind}`)}
                    </span>
                    {r.notes && (
                      <span className="block text-caption whitespace-pre-wrap text-ink-muted">
                        {r.notes}
                      </span>
                    )}
                  </td>
                  {h.options.showCosts && (
                    <td className="py-2 text-right font-mono text-data whitespace-nowrap tabular-nums">
                      {r.cost != null ? money(r.cost) : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-6 flex flex-wrap justify-between gap-2 text-caption text-ink-muted">
        <span>{t('history.generated', { date: f.date(h.generatedOn) })}</span>
        <span>{t('history.footer')}</span>
      </footer>
    </article>
  );
}
