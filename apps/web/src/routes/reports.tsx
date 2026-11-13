import {
  computeEconomy,
  fromMilli,
  isDistanceUnit,
  isLiquidUnit,
  type Report,
  vehicleTitle,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { reportQuery } from '../api/resources';
import { vehiclesQuery } from '../api/vehicles';
import { BarList, Legend, LineChart, type Series, StackedBars } from '../components/charts';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';
import { Button } from '../components/ui/Button';
import { SelectField } from '../components/ui/fields';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useFormat } from '../lib/format';
import { todayIso } from '../lib/today';

const PERIODS = ['12m', 'ytd', 'last_year', 'all'] as const;
type Period = (typeof PERIODS)[number];

export const Route = createFileRoute('/reports')({
  validateSearch: z.object({
    vehicle: z.coerce.number().int().optional(),
    period: z.enum(PERIODS).optional(),
  }),
  component: ReportsPage,
});

function range(p: Period): { from?: string; to?: string } {
  const today = todayIso();
  const y = Number(today.slice(0, 4));
  if (p === 'ytd') return { from: `${y}-01-01`, to: today };
  if (p === 'last_year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (p === '12m') {
    const d = new Date();
    d.setMonth(d.getMonth() - 11, 1);
    return {
      from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      to: today,
    };
  }
  return {};
}

/** Series order chosen so neighbouring stacks stay distinguishable (validated palette). */
const GROUPS = {
  maintenance: ['service', 'repair', 'upgrade'],
  fuel: ['fuel'],
  running: ['expense'],
} as const;
const COLORS = {
  maintenance: 'var(--chart-2)',
  fuel: 'var(--chart-1)',
  running: 'var(--chart-4)',
} as const;

function download(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/reports' });
  const period = search.period ?? '12m';
  const vehicles = useQuery(vehiclesQuery('all')).data ?? [];
  const query = useQuery(reportQuery({ vehicleId: search.vehicle, ...range(period) }));
  const [asTable, setAsTable] = useState(false);
  const r: Report | undefined = query.data;

  const series: Series[] = (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((k) => ({
    key: k,
    label: t(`reports.series.${k}`),
    color: COLORS[k],
  }));
  const monthly = (r?.monthly ?? []).map((m) => ({
    label: m.month,
    values: Object.fromEntries(
      Object.entries(GROUPS).map(([k, kinds]) => [
        k,
        kinds.reduce((s, kind) => s + m.byKind[kind], 0),
      ]),
    ),
  }));
  const categoryLabel = (c: Report['byCategory'][number]) =>
    c.kind === 'expense'
      ? t(`record.categories.${c.key}` as 'record.categories.other')
      : t(`record.kinds.${c.kind}`);
  const economyLines = (r?.vehicles ?? [])
    // Hour meters (gal/h) and EVs (mi/kWh) don't share an MPG axis; their fuel pages show them.
    .filter(
      (v) => v.fuelTrend.length > 1 && isDistanceUnit(v.odometerUnit) && isLiquidUnit(v.fuelUnit),
    )
    .slice(0, 4)
    .map((v, i) => ({
      key: String(v.id),
      label: v.title,
      color: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-3)'][i] as string,
      points: v.fuelTrend.map((p) => ({
        date: p.date,
        value: computeEconomy(p.economy, v.odometerUnit, 1, v.fuelUnit, f.display.economy) ?? 0,
      })),
    }));
  // The same months rolled up by calendar year.
  const yearly = [
    ...(r?.monthly ?? [])
      .reduce((map, m) => {
        const year = m.month.slice(0, 4);
        return map.set(year, (map.get(year) ?? 0) + m.total);
      }, new Map<string, number>())
      .entries(),
  ].map(([year, total]) => ({ key: year, label: year, value: total }));
  const money = (n: number) => f.money(n);
  const moneyShort = (n: number) => f.moneyCompact(n);
  const economyUnit = t(`units.economy.${f.display.economy}`, { value: '' }).trim();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('reports.title')}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button
              isDisabled={!r || monthly.length === 0}
              onPress={() =>
                download(`axlebook-report-${period}.csv`, [
                  [t('reports.month'), ...series.map((s) => s.label), t('reports.total')],
                  ...monthly.map((m) => [
                    m.label,
                    ...series.map((s) => fromMilli(m.values[s.key] ?? 0).toFixed(2)),
                    fromMilli(Object.values(m.values).reduce((a, b) => a + b, 0)).toFixed(2),
                  ]),
                ])
              }
            >
              {t('reports.downloadCsv')}
            </Button>
            <Button onPress={() => window.print()}>{t('reports.print')}</Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <SelectField
          label={t('reports.vehicle')}
          value={search.vehicle ? String(search.vehicle) : ''}
          onChange={(v) =>
            navigate({
              search: (s) => ({ ...s, vehicle: v ? Number(v) : undefined }),
              replace: true,
            })
          }
          options={[
            { value: '', label: t('reports.allVehicles') },
            ...vehicles.map((v) => ({ value: String(v.id), label: v.nickname ?? vehicleTitle(v) })),
          ]}
          className="w-64"
        />
        <SelectField
          label={t('reports.period')}
          value={period}
          onChange={(p) => navigate({ search: (s) => ({ ...s, period: p }), replace: true })}
          options={PERIODS.map((p) => ({ value: p, label: t(`reports.periods.${p}`) }))}
          className="w-52"
        />
        <ToggleSwitch label={t('reports.table')} isSelected={asTable} onChange={setAsTable} />
      </div>

      {r && r.totals.records === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
          {t('reports.noData')}
        </p>
      ) : r ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label={t('reports.totalSpent')}>{f.money(r.totals.cost)}</StatTile>
            <StatTile label={t('reports.distance')}>
              {t(`units.distance.${r.distanceUnit}`, {
                value: f.number(Math.round(r.totals.distance)),
              })}
            </StatTile>
            <StatTile label={t('reports.costPerDistance', { unit: r.distanceUnit })}>
              {r.totals.costPerDistance != null
                ? f.money(Math.round(r.totals.costPerDistance), true)
                : t('common.notSet')}
            </StatTile>
            <StatTile label={t('reports.records')}>{f.number(r.totals.records)}</StatTile>
          </div>

          <section
            aria-labelledby="monthly-h"
            className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="monthly-h" className="text-heading font-semibold">
                {t('reports.monthly')}
              </h2>
              <Legend series={series} />
            </div>
            {asTable ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left">
                  <thead className="bg-surface-sunken text-label text-ink-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        {t('reports.month')}
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
                    {monthly.map((m) => (
                      <tr key={m.label} className="border-t border-line">
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {f.month(m.label)}
                        </th>
                        {series.map((s) => (
                          <td key={s.key} className="px-3 py-2 text-right">
                            {money(m.values[s.key] ?? 0)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          {money(Object.values(m.values).reduce((a, b) => a + b, 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StackedBars
                data={monthly}
                series={series}
                formatValue={money}
                formatAxis={moneyShort}
                formatLabel={(m) => f.month(m)}
                ariaLabel={t('reports.monthly')}
              />
            )}
          </section>

          {yearly.length > 1 && (
            <section
              aria-labelledby="yearly-h"
              className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
            >
              <h2 id="yearly-h" className="mb-3 text-heading font-semibold">
                {t('reports.yearly')}
              </h2>
              <BarList items={yearly} formatValue={money} />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="cat-h"
              className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
            >
              <h2 id="cat-h" className="mb-3 text-heading font-semibold">
                {t('reports.byCategory')}
              </h2>
              <BarList
                items={r.byCategory.slice(0, 10).map((c) => ({
                  key: `${c.kind}:${c.key}`,
                  label: categoryLabel(c),
                  value: c.total,
                }))}
                formatValue={money}
              />
            </section>
            {economyLines.length > 0 && (
              <section
                aria-labelledby="econ-h"
                className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="econ-h" className="text-heading font-semibold">
                    {t('reports.fuelTrend')}{' '}
                    <span className="font-mono text-caption text-ink-muted">{economyUnit}</span>
                  </h2>
                  <Legend series={economyLines} />
                </div>
                {asTable ? (
                  <ul className="flex flex-col gap-1 font-mono text-data">
                    {economyLines.flatMap((l) =>
                      l.points.map((p) => (
                        <li
                          key={`${l.key}-${p.date}`}
                          className="flex justify-between gap-3 border-b border-line py-1"
                        >
                          <span className="font-sans">
                            {economyLines.length > 1 ? `${l.label} · ` : ''}
                            {f.date(p.date)}
                          </span>
                          <span>{f.decimals(p.value, 1)}</span>
                        </li>
                      )),
                    )}
                  </ul>
                ) : (
                  <LineChart
                    lines={economyLines}
                    formatValue={(n) => f.decimals(n, 1)}
                    formatDate={(d) => f.date(d, 'short')}
                    ariaLabel={t('reports.fuelTrend')}
                  />
                )}
              </section>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
