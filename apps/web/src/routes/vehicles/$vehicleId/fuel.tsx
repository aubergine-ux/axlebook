import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fuelQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
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
          <table className="w-full min-w-[640px] text-left">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
