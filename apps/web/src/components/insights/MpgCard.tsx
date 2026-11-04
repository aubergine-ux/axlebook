import type { Vehicle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { aiStatusQuery, mpgEstimateQuery, useEstimateMpg } from '../../api/extras';
import { useFormat } from '../../lib/format';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';

/** What the local AI expects this vehicle to get, next to what it actually gets. */
export function MpgCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const f = useFormat();
  const ai = useQuery(aiStatusQuery).data;
  const saved = useQuery(mpgEstimateQuery(vehicle.id));
  const estimate = useEstimateMpg(vehicle.id);
  // Hour meters and trailers don't have a meaningful economy figure to estimate.
  if (vehicle.odometerUnit === 'hr' || vehicle.category === 'trailer') return null;
  const e = saved.data;
  const econ = (n: number) => f.economy(n, vehicle.odometerUnit, vehicle.fuelUnit) ?? '';
  const canRun = ai?.enabled && vehicle.access !== 'view';

  return (
    <section
      aria-labelledby="mpg-h"
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
    >
      <h2 id="mpg-h" className="mb-3 text-heading font-semibold">
        {t('vehicle.insights.title')}
      </h2>
      {e ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-figure font-medium">
            {t('vehicle.insights.expected', { value: econ(e.combined) })}
          </p>
          <p className="font-mono text-data text-ink-muted">
            {t('vehicle.insights.range', { low: econ(e.low), high: econ(e.high) })}
          </p>
          {e.actual != null && (
            <p>
              <span className="font-mono text-data">
                {t('vehicle.insights.yours', { value: econ(e.actual) })}
              </span>
              {e.difference != null && (
                <span className="ml-2 font-mono text-data text-ink-muted">
                  {Math.abs(e.difference) < 0.03
                    ? t('vehicle.insights.same')
                    : e.difference > 0
                      ? t('vehicle.insights.better', {
                          pct: f.number(Math.round(e.difference * 100)),
                        })
                      : t('vehicle.insights.worse', {
                          pct: f.number(Math.round(-e.difference * 100)),
                        })}
                </span>
              )}
            </p>
          )}
          <p className="text-ink-muted">{e.summary}</p>
          {e.factors.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {e.factors.map((x) => (
                <li key={x} className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption">
                  {x}
                </li>
              ))}
            </ul>
          )}
          <p className="flex flex-wrap gap-x-3 text-caption text-ink-muted">
            <span>{t(`vehicle.insights.confidence.${e.confidence}`)}</span>
            <span>{t('vehicle.insights.localNote', { model: e.model })}</span>
          </p>
        </div>
      ) : (
        !canRun && <p className="text-ink-muted">{t('vehicle.insights.off')}</p>
      )}
      {canRun && (
        <Button onPress={() => estimate.mutate()} isDisabled={estimate.isPending} className="mt-4">
          {estimate.isPending
            ? t('vehicle.insights.running')
            : e
              ? t('vehicle.insights.refresh')
              : t('vehicle.insights.estimate')}
        </Button>
      )}
      <ErrorNote error={estimate.error} className="mt-3" />
    </section>
  );
}
