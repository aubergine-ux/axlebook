import { type VehicleSummary, vehicleTitle } from '@axlebook/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../lib/format';
import { Icon } from '../Icon';
import { OdometerReadout } from '../ui/OdometerReadout';
import { StatusBadge } from '../ui/StatusBadge';

export function VehicleCard({ vehicle }: { vehicle: VehicleSummary }) {
  const { t } = useTranslation();
  const f = useFormat();
  const title = vehicleTitle(vehicle);
  const heading = vehicle.nickname ?? title;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:shadow-pop">
      <div className="aspect-[16/9] bg-surface-sunken">
        {vehicle.photoUrl ? (
          <img
            src={vehicle.photoUrl}
            alt={t('garage.photoAlt', { name: title })}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-muted">
            <Icon name="vehicle" size={32} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="text-heading font-semibold">
            {/* The whole card is clickable via this stretched link. */}
            <Link
              to="/vehicles/$vehicleId"
              params={{ vehicleId: String(vehicle.id) }}
              className="outline-none after:absolute after:inset-0"
            >
              {heading}
            </Link>
          </h2>
          {vehicle.nickname && <p className="text-caption text-ink-muted">{title}</p>}
          {vehicle.access !== 'owner' && (
            <p className="text-caption text-ink-muted">{t('garage.shared')}</p>
          )}
          {vehicle.archivedAt && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-semibold text-ink-muted">
              {t('garage.archivedBadge')}
            </p>
          )}
        </div>
        <dl className="mt-auto flex flex-col gap-3 border-t border-line pt-3">
          <div>
            <dt className="text-label text-ink-muted">{t('garage.odometer')}</dt>
            <dd className="mt-1">
              {vehicle.currentOdometer != null ? (
                <OdometerReadout
                  value={vehicle.currentOdometer}
                  unit={vehicle.odometerUnit}
                  size="sm"
                />
              ) : (
                <span className="text-caption text-ink-muted">{t('garage.noReading')}</span>
              )}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-label text-ink-muted">{t('garage.nextReminder')}</dt>
              <dd className="mt-0.5">
                {vehicle.nextReminder ? (
                  <span className="flex flex-col items-start gap-1">
                    <span className="max-w-full truncate">{vehicle.nextReminder.title}</span>
                    {vehicle.nextReminder.status !== 'upcoming' && (
                      <StatusBadge status={vehicle.nextReminder.status}>
                        {t(`reminder.status.${vehicle.nextReminder.status}`)}
                      </StatusBadge>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-muted">{t('garage.noReminder')}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-label text-ink-muted">{t('garage.costToDate')}</dt>
              <dd className="font-mono text-data tabular-nums">{f.money(vehicle.costToDate)}</dd>
            </div>
          </div>
        </dl>
      </div>
    </article>
  );
}
