import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fuelQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { BarList, LineChart } from '../../../components/charts';
import { Icon } from '../../../components/Icon';
import { StatTile } from '../../../components/StatTile';
import { LinkButton } from '../../../components/ui/Button';
import { useFormat } from '../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/fuel')({ component: FuelTab });

function FuelTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const fuel = useQuery(fuelQuery(id)).data;
  if (!v) return null;
  const unit = f.display.distance;
  const fills = fuel?.fills ?? [];
  // Price paid per unit over time, oldest first.
  const prices = fills
    .filter((x) => x.pricePerUnit != null)
    .map((x) => ({ date: x.date, value: (x.pricePerUnit as number) / 1000 }))
    .reverse();
  // Where the fuel was bought: visits, and the average price there (weighted by volume).
  const stations = [
    ...fills
      .reduce((map, x) => {
        const name = x.station?.trim();
        if (!name) return map;
        const key = name.toLowerCase();
        const s = map.get(key) ?? { key, name, visits: 0, cost: 0, volume: 0 };
        s.visits++;
        if (x.pricePerUnit != null) {
          s.cost += (x.pricePerUnit * x.volume) / 1000;
          s.volume += x.volume;
        }
        return map.set(key, s);
      }, new Map<
        string,
        { key: string; name: string; visits: number; cost: number; volume: number }
      >())
      .values(),
  ].sort((a, b) => b.visits - a.visits);

  return (
    <div className="flex flex-col gap-6">
      {v.access !== 'view' && (
        <div>
          <LinkButton to="/log" search={{ vehicle: id }} variant="primary">
            <Icon name="fuel" size={16} />
            {t('fuel.log')}
          </LinkButton>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('fuel.average')}>
          {f.economy(fuel?.average, v.odometerUnit, v.fuelUnit) ?? t('common.notSet')}
        </StatTile>
        <StatTile label={t('fuel.last')}>
          {f.economy(fuel?.last, v.odometerUnit, v.fuelUnit) ?? t('common.notSet')}
        </StatTile>
        <StatTile label={t('fuel.costPerDistance', { unit })}>
          {f.costPerDistance(fuel?.costPerDistance, v.odometerUnit) ?? t('common.notSet')}
        </StatTile>
        <StatTile label={t('fuel.total')}>{f.money(fuel?.totalCost ?? 0)}</StatTile>
      </div>
      <section className="overflow-x-auto rounded-lg border border-line bg-surface-raised shadow-card">
        {!fuel || fuel.fills.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">{t('fuel.empty')}</p>
        ) : (
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-surface-sunken text-label text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  {t('fuel.columns.date')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('fuel.columns.odometer')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('fuel.columns.volume')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('fuel.columns.price')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('fuel.columns.cost')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('fuel.columns.economy')}
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  {t('fuel.columns.station')}
                </th>
              </tr>
            </thead>
            <tbody className="font-mono text-data tabular-nums">
              {fuel.fills.map((fill) => (
                <tr key={fill.recordId} className="border-t border-line hover:bg-surface-sunken/50">
                  <td className="px-4 py-2">
                    <Link
                      to="/records/$recordId"
                      params={{ recordId: String(fill.recordId) }}
                      className="hover:underline"
                    >
                      {f.date(fill.date)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {f.distance(fill.odometer, v.odometerUnit)}
                  </td>
                  <td className="px-4 py-2 text-right">{f.volume(fill.volume, v.fuelUnit)}</td>
                  <td className="px-4 py-2 text-right">
                    {fill.pricePerUnit != null
                      ? f.money(fill.pricePerUnit, true)
                      : t('common.notSet')}
                  </td>
                  <td className="px-4 py-2 text-right">{f.money(fill.cost)}</td>
                  <td className="px-4 py-2 text-right">
                    {fill.status === 'ok' ? (
                      f.economy(fill.economy, v.odometerUnit, v.fuelUnit)
                    ) : (
                      <span className="font-sans text-caption text-ink-muted">
                        {t(`fuel.status.${fill.status}`)}
                      </span>
                    )}
                  </td>
                  <td className="max-w-48 truncate px-4 py-2 font-sans text-body">
                    {fill.station ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {(prices.length > 1 || stations.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {prices.length > 1 && (
            <section
              aria-labelledby="price-h"
              className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
            >
              <h2 id="price-h" className="mb-3 text-heading font-semibold">
                {t('fuel.priceHistory')}
              </h2>
              <LineChart
                lines={[
                  {
                    key: 'price',
                    label: t('fuel.columns.price'),
                    color: 'var(--chart-1)',
                    points: prices,
                  },
                ]}
                formatValue={(n) => f.money(Math.round(n * 1000), true)}
                formatDate={(d) => f.date(d, 'short')}
                ariaLabel={t('fuel.priceHistory')}
              />
            </section>
          )}
          {stations.length > 0 && (
            <section
              aria-labelledby="stations-h"
              className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
            >
              <h2 id="stations-h" className="mb-1 text-heading font-semibold">
                {t('fuel.stations')}
              </h2>
              <p className="mb-3 text-caption text-ink-muted">{t('fuel.stationsHint')}</p>
              <BarList
                items={stations.slice(0, 8).map((s) => ({
                  key: s.key,
                  label: s.name,
                  value: s.visits,
                  text:
                    s.volume > 0
                      ? t('fuel.stationValue', {
                          count: s.visits,
                          price: f.money(Math.round((s.cost / s.volume) * 1000), true),
                        })
                      : undefined,
                }))}
                formatValue={(n) => t('fuel.visits', { count: n })}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
