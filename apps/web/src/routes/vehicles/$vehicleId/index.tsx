import { vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useArchiveVehicle, useDeleteVehicle, vehicleQuery } from '../../../api/vehicles';
import { Button, LinkButton } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { QueryState } from '../../../components/ui/QueryState';
import { useFormat } from '../../../lib/format';

export const Route = createFileRoute('/vehicles/$vehicleId/')({ component: VehiclePage });

function VehiclePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const navigate = useNavigate();
  const query = useQuery(vehicleQuery(id));
  const archive = useArchiveVehicle();
  const remove = useDeleteVehicle();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <QueryState query={query}>
      {(v) => {
        const title = vehicleTitle(v);
        const canEdit = v.access !== 'view';
        const facts: [string, string | null, boolean?][] = [
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
        ];
        return (
          <>
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-ink-muted hover:text-ink"
            >
              <span aria-hidden>←</span>
              {t('vehicle.backToGarage')}
            </Link>

            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
              {v.photoUrl && (
                <img
                  src={v.photoUrl}
                  alt={t('garage.photoAlt', { name: title })}
                  className="aspect-[16/9] w-full rounded-lg object-cover sm:w-64"
                />
              )}
              <div className="flex-1">
                <h1 className="ax-display text-[28px] leading-[30px] md:text-display">
                  {v.nickname ?? title}
                </h1>
                {v.nickname && <p className="text-ink-muted">{title}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <LinkButton to="/vehicles/$vehicleId/edit" params={{ vehicleId: String(v.id) }}>
                    {t('vehicle.edit')}
                  </LinkButton>
                  {v.access === 'owner' && (
                    <>
                      <Button
                        variant="ghost"
                        isDisabled={archive.isPending}
                        onPress={() => archive.mutate({ id: v.id, archived: !v.archivedAt })}
                      >
                        {v.archivedAt ? t('vehicle.unarchive') : t('vehicle.archive')}
                      </Button>
                      <Button variant="ghost" onPress={() => setConfirmDelete(true)}>
                        {t('vehicle.delete')}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </header>

            {v.archivedAt && (
              <p
                role="status"
                className="mb-6 rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted"
              >
                {t('vehicle.archivedNotice', { date: f.date(v.archivedAt) })}
              </p>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <section
                aria-labelledby="details-h"
                className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6 lg:col-span-1"
              >
                <h2 id="details-h" className="mb-3 text-heading font-semibold">
                  {t('vehicle.details')}
                </h2>
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
                    <p className="text-sm whitespace-pre-wrap">{v.notes}</p>
                  </>
                )}
              </section>
              <section
                aria-labelledby="history-h"
                className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6 lg:col-span-2"
              >
                <h2 id="history-h" className="mb-3 text-heading font-semibold">
                  {t('vehicle.history')}
                </h2>
                <p className="text-sm text-ink-muted">{t('vehicle.historyEmpty')}</p>
              </section>
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
          </>
        );
      }}
    </QueryState>
  );
}
