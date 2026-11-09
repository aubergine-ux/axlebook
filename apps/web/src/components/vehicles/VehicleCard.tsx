import {
  DEFAULT_GARAGE_PREFS,
  type GarageField,
  type GarageLayout,
  type VehicleSummary,
  vehicleTitle,
} from '@axlebook/shared';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../lib/format';
import { Icon } from '../Icon';
import { OdometerReadout } from '../ui/OdometerReadout';
import { StatusBadge } from '../ui/StatusBadge';

/** Label for each garage field, shared by the cards and the customize dialog. */
export function garageFieldLabel(t: TFunction, field: GarageField): string {
  const labels: Record<GarageField, string> = {
    odometer: t('garage.odometer'),
    nextReminder: t('garage.nextReminder'),
    cost: t('garage.costToDate'),
    licensePlate: t('vehicle.fields.licensePlate'),
    unitNumber: t('vehicle.fields.unitNumber'),
    color: t('vehicle.fields.color'),
    category: t('vehicle.fields.category'),
  };
  return labels[field];
}

/** Grid (or list) wrapper classes for each garage layout. */
export const GARAGE_GRID: Record<GarageLayout, string> = {
  cards: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
  compact: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
  list: 'flex flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card',
};

export function VehicleCard({
  vehicle,
  layout = 'cards',
  fields = DEFAULT_GARAGE_PREFS.fields,
}: {
  vehicle: VehicleSummary;
  layout?: GarageLayout;
  fields?: readonly GarageField[];
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const title = vehicleTitle(vehicle);
  const heading = vehicle.nickname ?? title;
  const big = layout === 'cards';

  const value = (field: GarageField): ReactNode => {
    const notSet = <span className="text-ink-muted">{t('common.notSet')}</span>;
    switch (field) {
      case 'odometer':
        if (vehicle.currentOdometer == null)
          return <span className="text-caption text-ink-muted">{t('garage.noReading')}</span>;
        return big ? (
          <OdometerReadout value={vehicle.currentOdometer} unit={vehicle.odometerUnit} size="sm" />
        ) : (
          <span className="font-mono text-data tabular-nums">
            {f.distance(vehicle.currentOdometer, vehicle.odometerUnit)}
          </span>
        );
      case 'nextReminder':
        return vehicle.nextReminder ? (
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
        );
      case 'cost':
        return (
          <span className="font-mono text-data tabular-nums">{f.money(vehicle.costToDate)}</span>
        );
      case 'licensePlate':
        return vehicle.licensePlate ? (
          <span className="font-mono text-data">{vehicle.licensePlate}</span>
        ) : (
          notSet
        );
      case 'unitNumber':
        return vehicle.unitNumber ? (
          <span className="font-mono text-data">{vehicle.unitNumber}</span>
        ) : (
          notSet
        );
      case 'color':
        return vehicle.color ?? notSet;
      case 'category':
        return t(`vehicle.categories.${vehicle.category}`);
    }
  };

  const photo = (
    <div
      className={
        big
          ? 'aspect-[16/9] bg-surface-sunken'
          : layout === 'compact'
            ? 'aspect-[4/3] w-28 shrink-0 self-start overflow-hidden rounded-md bg-surface-sunken'
            : 'aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-md bg-surface-sunken'
      }
    >
      {vehicle.photoUrl ? (
        <img
          src={vehicle.photoUrl}
          alt={t('garage.photoAlt', { name: title })}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-ink-muted">
          <Icon name="vehicle" size={big ? 32 : 20} />
        </div>
      )}
    </div>
  );

  const name = (
    <div className="min-w-0">
      <h2 className={big ? 'text-heading font-semibold' : 'truncate text-body font-semibold'}>
        {/* The whole card is clickable via this stretched link. */}
        <Link
          to="/vehicles/$vehicleId"
          params={{ vehicleId: String(vehicle.id) }}
          className="outline-none after:absolute after:inset-0"
        >
          {heading}
        </Link>
      </h2>
      {vehicle.nickname && <p className="truncate text-caption text-ink-muted">{title}</p>}
      {vehicle.access !== 'owner' && (
        <p className="text-caption text-ink-muted">{t('garage.shared')}</p>
      )}
      {vehicle.archivedAt && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-semibold text-ink-muted">
          {t('garage.archivedBadge')}
        </p>
      )}
    </div>
  );

  const facts = fields.length > 0 && (
    <dl
      className={
        big
          ? 'mt-auto grid grid-cols-2 gap-x-2 gap-y-3 border-t border-line pt-3'
          : layout === 'compact'
            ? 'grid grid-cols-2 gap-x-2 gap-y-2'
            : 'grid grid-cols-2 gap-x-4 gap-y-2 md:flex md:flex-1 md:flex-wrap md:justify-end md:gap-x-6'
      }
    >
      {fields.map((field) => (
        <div
          key={field}
          className={big && field === 'odometer' ? 'col-span-2 min-w-0' : 'min-w-0 md:min-w-24'}
        >
          <dt className={big ? 'text-label text-ink-muted' : 'text-caption text-ink-muted'}>
            {garageFieldLabel(t, field)}
          </dt>
          <dd className={big ? 'mt-0.5' : 'text-caption'}>{value(field)}</dd>
        </div>
      ))}
    </dl>
  );

  const focus =
    'group relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus';

  if (layout === 'list')
    return (
      <article
        className={`${focus} flex flex-col gap-3 p-3 hover:bg-surface-sunken md:flex-row md:items-center md:gap-4`}
      >
        <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
          {photo}
          {name}
        </div>
        {facts}
      </article>
    );

  if (layout === 'compact')
    return (
      <article
        className={`${focus} flex h-full gap-3 rounded-lg border border-line bg-surface-raised p-3 shadow-card transition-shadow hover:shadow-pop`}
      >
        {photo}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {name}
          {facts}
        </div>
      </article>
    );

  return (
    <article
      className={`${focus} flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card transition-shadow hover:shadow-pop`}
    >
      {photo}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {name}
        {facts}
      </div>
    </article>
  );
}
