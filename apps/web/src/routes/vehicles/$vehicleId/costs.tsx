import { OWNERSHIP_PARTS, type Ownership } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ownershipQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { BarList, Legend, type Series, StackedBars } from '../../../components/charts';
import { StatTile } from '../../../components/StatTile';
import { QueryState } from '../../../components/ui/QueryState';
import { ToggleSwitch } from '../../../components/ui/ToggleSwitch';
import { useFormat } from '../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/costs')({ component: CostsTab });

/** Eight lines are too many to tell apart by colour; the chart groups them into four. */
const GROUPS = {
  fuel: ['fuel'],
  upkeep: ['maintenance', 'upgrades'],
  fixed: ['insurance', 'registration', 'tax', 'loan'],
  other: ['other'],
} as const;
const COLORS = {
  fuel: 'var(--chart-1)',
  upkeep: 'var(--chart-2)',
  fixed: 'var(--chart-4)',
  other: 'var(--chart-3)',
} as const;

function CostsTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const vehicleId = Route.useParams().vehicleId;
  const id = Number(vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const query = useQuery(ownershipQuery(id));
  const [asTable, setAsTable] = useState(false);
  if (!v) return null;

  const series: Series[] = (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((k) => ({
    key: k,
    label: t(`ownership.groups.${k}`),
    color: COLORS[k],
  }));
  const money = (n: number) => f.money(n);

  return (
    <QueryState query={query}>
      {(o: Ownership) => {
        const nothing = o.runningTotal === 0 && o.depreciation == null;
        const years = o.byYear.map((y) => ({
          label: y.year,
          values: Object.fromEntries(
            Object.entries(GROUPS).map(([k, parts]) => [k, parts.reduce((s, p) => s + y[p], 0)]),
          ),
        }));
        const lines = [
          ...(o.depreciation != null && o.depreciation > 0
            ? [{ key: 'depreciation', label: t('ownership.depreciation'), value: o.depreciation }]
            : []),
          ...OWNERSHIP_PARTS.filter((p) => o.running[p] > 0).map((p) => ({
            key: p,
            label: t(`ownership.parts.${p}`),
            value: o.running[p],
          })),
        ].sort((a, b) => b.value - a.value);

        return (
          <div className="flex flex-col gap-6">
            <p className="max-w-2xl text-ink-muted">
              {o.since
                ? t('ownership.intro', { date: f.date(o.since), count: o.months })
                : t('ownership.introEmpty')}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label={t('ownership.total')}
                hint={o.depreciation == null ? t('ownership.withoutDepreciation') : undefined}
              >
                {f.money(o.total)}
              </StatTile>
              <StatTile label={t('ownership.perMonth')}>
                {o.costPerMonth != null ? f.money(o.costPerMonth) : t('common.notSet')}
              </StatTile>
              <StatTile label={t('ownership.perDistance', { unit: o.odometerUnit })}>
                {o.costPerDistance != null
                  ? f.money(Math.round(o.costPerDistance), true)
                  : t('common.notSet')}
              </StatTile>
              <StatTile
                label={t('ownership.depreciation')}
                hint={
                  o.depreciation != null && o.depreciation < 0 ? t('ownership.gained') : undefined
                }
              >
                {o.depreciation != null ? f.money(Math.abs(o.depreciation)) : t('common.notSet')}
              </StatTile>
            </div>

            {o.depreciation == null && v.access !== 'view' && (
              <p className="rounded-md bg-surface-sunken px-3 py-2" role="note">
                {t('ownership.needsPrices')}{' '}
                <Link
                  to="/vehicles/$vehicleId/edit"
                  params={{ vehicleId }}
                  className="font-semibold underline underline-offset-2"
                >
                  {t('vehicle.editVehicle')}
                </Link>
              </p>
            )}

            {nothing ? (
              <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
                {t('ownership.empty')}
              </p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <section
                  aria-labelledby="own-lines-h"
                  className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
                >
                  <h2 id="own-lines-h" className="mb-3 text-heading font-semibold">
                    {t('ownership.where')}
                  </h2>
                  <BarList items={lines} formatValue={money} />
                  <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-3">
                    <dt className="text-label text-ink-muted">
                      {t('vehicle.fields.purchasePrice')}
                    </dt>
                    <dd className="text-right font-mono text-data">
                      {o.purchasePrice != null ? f.money(o.purchasePrice) : t('common.notSet')}
                    </dd>
                    <dt className="text-label text-ink-muted">
                      {t('vehicle.fields.currentValue')}
                    </dt>
                    <dd className="text-right font-mono text-data">
                      {o.currentValue != null ? f.money(o.currentValue) : t('common.notSet')}
                    </dd>
                    <dt className="text-label text-ink-muted">{t('ownership.running')}</dt>
                    <dd className="text-right font-mono text-data">{f.money(o.runningTotal)}</dd>
                  </dl>
                </section>

                {years.length > 0 && (
                  <section
                    aria-labelledby="own-years-h"
                    className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h2 id="own-years-h" className="text-heading font-semibold">
                        {t('ownership.byYear')}
                      </h2>
                      <ToggleSwitch
                        label={t('reports.table')}
                        isSelected={asTable}
                        onChange={setAsTable}
                      />
                    </div>
                    {asTable ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left">
                          <thead className="bg-surface-sunken text-label text-ink-muted">
                            <tr>
                              <th scope="col" className="px-3 py-2">
                                {t('ownership.year')}
                              </th>
                              {series.map((s) => (
                                <th key={s.key} scope="col" className="px-3 py-2 text-right">
                                  {s.label}
                                </th>
                              ))}
                              <th scope="col" className="px-3 py-2 text-right">
                                {t('reports.total')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="font-mono text-data tabular-nums">
                            {years.map((y) => (
                              <tr key={y.label} className="border-t border-line">
                                <th scope="row" className="px-3 py-2 text-left font-normal">
                                  {y.label}
                                </th>
                                {series.map((s) => (
                                  <td key={s.key} className="px-3 py-2 text-right">
                                    {money(y.values[s.key] ?? 0)}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-right">
                                  {money(Object.values(y.values).reduce((a, b) => a + b, 0))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <>
                        <Legend series={series} />
                        <StackedBars
                          data={years}
                          series={series}
                          formatValue={money}
                          formatAxis={(n) => f.moneyCompact(n)}
                          formatLabel={(y) => y}
                          ariaLabel={t('ownership.byYear')}
                        />
                      </>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}
