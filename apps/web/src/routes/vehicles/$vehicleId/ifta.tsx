import { fromMilli } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { iftaQuery } from '../../../api/extras';
import { StatTile } from '../../../components/StatTile';
import { SelectField } from '../../../components/ui/fields';
import { QueryState } from '../../../components/ui/QueryState';
import { useFormat } from '../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/ifta')({ component: IftaTab });

/** The quarters to choose from: this one and the seven before it. */
function recentQuarters(now = new Date()) {
  const out: { year: number; quarter: number }[] = [];
  let year = now.getFullYear();
  let quarter = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    out.push({ year, quarter });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

function IftaTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const quarters = recentQuarters();
  const [pick, setPick] = useState(`${quarters[0]?.year}-${quarters[0]?.quarter}`);
  const [year, quarter] = pick.split('-').map(Number) as [number, number];
  const query = useQuery(iftaQuery({ year, quarter, vehicleId: id }));
  const vol = (milli: number) => f.volume(milli, f.display.volume);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-ink-muted">{t('ifta.intro')}</p>
      <SelectField
        label={t('ifta.quarter')}
        value={pick}
        onChange={setPick}
        className="max-w-xs"
        options={quarters.map((q) => ({
          value: `${q.year}-${q.quarter}`,
          label: t('ifta.quarterOption', { quarter: q.quarter, year: q.year }),
        }))}
      />
      <QueryState query={query}>
        {(r) =>
          r.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
              {t('ifta.empty')}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label={t('ifta.miles')}>
                  {f.distance(r.totalDistance, r.distanceUnit)}
                </StatTile>
                <StatTile label={t('ifta.purchased')}>{vol(r.totalFuel)}</StatTile>
                <StatTile label={t('ifta.fleet')}>
                  {r.fleetEconomy != null
                    ? (f.economy(r.fleetEconomy, r.distanceUnit, f.display.volume) ??
                      t('common.notSet'))
                    : t('common.notSet')}
                </StatTile>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised shadow-card">
                <table className="min-w-full">
                  <caption className="sr-only">{t('ifta.title')}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-label text-ink-muted">
                      <th scope="col" className="px-4 py-2">
                        {t('ifta.jurisdiction')}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        {t('ifta.miles')}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        {t('ifta.taxableFuel')}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        {t('ifta.purchased')}
                      </th>
                      <th scope="col" className="px-4 py-2 text-right">
                        {t('ifta.net')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row) => (
                      <tr key={row.jurisdiction} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-mono font-semibold">
                          {row.jurisdiction}
                        </th>
                        <td className="px-4 py-2 text-right font-mono text-data">
                          {f.distance(row.distance, r.distanceUnit)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-data">
                          {vol(row.taxableFuel)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-data">
                          {vol(row.purchased)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-mono text-data ${row.net > 0 ? 'font-semibold' : 'text-ink-muted'}`}
                        >
                          {f.decimals(fromMilli(row.net), 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.unassignedDistance > 0 && (
                <p role="note" className="rounded-md bg-yellow-soft px-3 py-2 text-yellow">
                  {t('ifta.unassigned', {
                    value: f.distance(r.unassignedDistance, r.distanceUnit),
                  })}
                </p>
              )}
            </>
          )
        }
      </QueryState>
    </div>
  );
}
