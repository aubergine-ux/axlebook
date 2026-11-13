import { vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fuelQuery,
  recordsQuery,
  reportQuery,
  vehicleRemindersQuery,
} from '../../../api/resources';
import { useArchiveVehicle, useDeleteVehicle, vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { MpgCard } from '../../../components/insights/MpgCard';
import { TipsCard } from '../../../components/insights/TipsCard';
import { RecordRow } from '../../../components/records/RecordRow';
import { ReminderItem } from '../../../components/reminders/ReminderItem';
import { StatTile } from '../../../components/StatTile';
import { Button, LinkButton } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { RecallsCard } from '../../../components/vehicles/RecallsCard';
import { SpecsCard } from '../../../components/vehicles/SpecsCard';
import { useFormat } from '../../../lib/format';
import { useViewPrefs } from '../../../lib/useViewPrefs';

export const Route = createFileRoute('/vehicles/$vehicleId/')({ component: Overview });

function Overview() {
  const { t } = useTranslation();
  const f = useFormat();
  const vehicleId = Route.useParams().vehicleId;
  const id = Number(vehicleId);
  const navigate = useNavigate();
  const v = useQuery(vehicleQuery(id)).data;
  const fuel = useQuery(fuelQuery(id)).data;
  const report = useQuery(reportQuery({ vehicleId: id })).data;
  const reminders = useQuery(vehicleRemindersQuery(id)).data ?? [];
  const recent = useQuery(recordsQuery({ vehicleId: id, limit: 5 })).data;
  const archive = useArchiveVehicle();
  const remove = useDeleteVehicle();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const view = useViewPrefs();
  if (!v) return null;

  const title = vehicleTitle(v);
  const canEdit = v.access !== 'view';
  const facts: [string, string | null, boolean?][] = [
    [t('vehicle.fields.category'), t(`vehicle.categories.${v.category}`)],
    [t('vehicle.fields.usage'), t(`vehicle.usages.${v.usage}`)],
    ...(v.unitNumber
      ? [[t('vehicle.fields.unitNumber'), v.unitNumber, true] as [string, string, boolean]]
      : []),
    [t('vehicle.fields.vin'), v.vin, true],
    [t('vehicle.fields.licensePlate'), v.licensePlate, true],
    [t('vehicle.fields.color'), v.color],
    [t('vehicle.fields.fuelType'), t(`vehicle.fuelType.${v.fuelType}`)],
    [t('vehicle.fields.odometerUnit'), t(`units.odometer.${v.odometerUnit}`)],
    [t('vehicle.fields.fuelUnit'), t(`units.fuel.${v.fuelUnit}`)],
    [t('vehicle.fields.purchaseDate'), v.purchaseDate ? f.date(v.purchaseDate) : null, true],
    [
      t('vehicle.fields.purchasePrice'),
      v.purchasePrice != null ? f.money(v.purchasePrice) : null,
      true,
    ],
    [
      t('vehicle.fields.currentValue'),
      v.currentValue != null ? f.money(v.currentValue) : null,
      true,
    ],
  ];
  const perDistance = report?.totals.costPerDistance;

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <LinkButton
            to="/vehicles/$vehicleId/records/new"
            params={{ vehicleId }}
            variant="primary"
          >
            <Icon name="add" size={16} />
            {t('record.add')}
          </LinkButton>
          <LinkButton to="/log" search={{ vehicle: id }}>
            <Icon name="fuel" size={16} />
            {t('fuel.log')}
          </LinkButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('vehicle.stats.economy')}>
          {f.economy(fuel?.average, v.odometerUnit, v.fuelUnit) ?? t('common.notSet')}
        </StatTile>
        <StatTile
          label={t('vehicle.stats.costPerDistance', {
            unit: report?.distanceUnit ?? f.display.distance,
          })}
        >
          {perDistance != null ? f.money(Math.round(perDistance), true) : t('common.notSet')}
        </StatTile>
        <StatTile label={t('vehicle.stats.spent')}>{f.money(report?.totals.cost ?? 0)}</StatTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section
            aria-labelledby="upcoming-h"
            className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="upcoming-h" className="text-heading font-semibold">
                {t('vehicle.upcoming')}
              </h2>
              <Link
                to="/vehicles/$vehicleId/reminders"
                params={{ vehicleId }}
                className="text-label text-orange-text hover:underline"
              >
                {t('vehicle.viewAll')}
              </Link>
            </div>
            {reminders.length === 0 ? (
              <p className="text-ink-muted">{t('reminder.empty')}</p>
            ) : (
              <ul>
                {reminders.slice(0, 3).map((r) => (
                  <ReminderItem key={r.id} reminder={r} />
                ))}
              </ul>
            )}
          </section>
          <RecallsCard vehicle={v} />
          {view.showTips && <TipsCard vehicle={v} />}
          <section
            aria-labelledby="recent-h"
            className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="recent-h" className="text-heading font-semibold">
                {t('vehicle.recent')}
              </h2>
              <Link
                to="/vehicles/$vehicleId/records"
                params={{ vehicleId }}
                className="text-label text-orange-text hover:underline"
              >
                {t('vehicle.viewAll')}
              </Link>
            </div>
            {recent && recent.items.length > 0 ? (
              <ul>
                {recent.items.map((r) => (
                  <RecordRow key={r.id} record={r} vehicle={v} />
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">{t('record.empty')}</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <MpgCard vehicle={v} />
          <SpecsCard vehicle={v} />
          <section
            aria-labelledby="details-h"
            className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="details-h" className="text-heading font-semibold">
                {t('vehicle.details')}
              </h2>
              {canEdit && (
                <Link
                  to="/vehicles/$vehicleId/edit"
                  params={{ vehicleId }}
                  className="text-label text-orange-text hover:underline"
                >
                  {t('vehicle.edit')}
                </Link>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
              {facts.map(([label, value, mono]) => (
                <div key={label} className="contents">
                  <dt className="text-label text-ink-muted">{label}</dt>
                  <dd className={mono ? 'font-mono text-data break-all' : ''}>
                    {value ?? t('common.notSet')}
                  </dd>
                </div>
              ))}
            </dl>
            {v.notes && (
              <>
                <h3 className="mt-4 mb-1 text-label">{t('vehicle.notes')}</h3>
                <p className="whitespace-pre-wrap">{v.notes}</p>
              </>
            )}
            {v.archivedAt && (
              <p
                role="status"
                className="mt-4 rounded-md bg-surface-sunken px-3 py-2 text-caption text-ink-muted"
              >
                {t('vehicle.archivedNotice', { date: f.date(v.archivedAt) })}
              </p>
            )}
            {v.access === 'owner' && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Button
                  variant="ghost"
                  isDisabled={archive.isPending}
                  onPress={() => archive.mutate({ id: v.id, archived: !v.archivedAt })}
                >
                  {v.archivedAt ? t('vehicle.unarchive') : t('vehicle.archive')}
                </Button>
                <Button variant="ghost" className="text-red" onPress={() => setConfirmDelete(true)}>
                  {t('vehicle.delete')}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('vehicle.deleteTitle')}
        confirmLabel={t('vehicle.deleteConfirm')}
        isPending={remove.isPending}
        onConfirm={() =>
          remove.mutate(v.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              void navigate({ to: '/' });
            },
          })
        }
      >
        {t('vehicle.deleteBody', { name: title })}
      </ConfirmDialog>
    </div>
  );
}
