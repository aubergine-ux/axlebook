import { type Trip, TripInput } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { mileageQuery, tripsQuery, useTripAction } from '../../../api/fleet';
import { odometerQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { BarList } from '../../../components/charts';
import { Icon } from '../../../components/Icon';
import { StatTile } from '../../../components/StatTile';
import { Button, buttonClass } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { FormDialog } from '../../../components/ui/FormDialog';
import { SelectField, TextAreaField, TextField } from '../../../components/ui/fields';
import { ToggleSwitch } from '../../../components/ui/ToggleSwitch';
import { useFormat } from '../../../lib/format';
import { todayIso } from '../../../lib/today';
import { fieldErrors } from '../../../lib/validation';

export const Route = createFileRoute('/vehicles/$vehicleId/trips')({ component: TripsTab });

function TripsTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const [year, setYear] = useState<number | undefined>();
  const report = useQuery(mileageQuery(id, year)).data;
  const shown = year ?? report?.year;
  const trips = useQuery({ ...tripsQuery(id, shown), enabled: shown != null }).data ?? [];
  const readings = useQuery(odometerQuery(id)).data ?? [];
  const action = useTripAction(id);
  const [editing, setEditing] = useState<Trip | 'new' | null>(null);
  const [removing, setRemoving] = useState<Trip | null>(null);
  if (!v || !report) return null;

  const canEdit = v.access !== 'view';
  const unit = v.odometerUnit;
  const current = readings.reduce((max, r) => Math.max(max, r.odometer), 0);
  const thisYear = Number(todayIso().slice(0, 4));
  const years = [...new Set([thisYear, ...report.years, report.year])].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canEdit && (
          <Button variant="primary" onPress={() => setEditing('new')}>
            <Icon name="add" size={16} />
            {t('trips.add')}
          </Button>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t('trips.year')}
            value={String(report.year)}
            onChange={(y) => setYear(Number(y))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            className="w-32"
          />
          <a
            href={`/api/v1/vehicles/${id}/mileage.csv?year=${report.year}`}
            download
            className={buttonClass('secondary')}
          >
            <Icon name="export" size={16} />
            {t('trips.downloadCsv')}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('trips.business')}>{f.distance(report.businessDistance, unit)}</StatTile>
        <StatTile label={t('trips.total')} hint={t('trips.totalHint')}>
          {report.totalDistance != null
            ? f.distance(report.totalDistance, unit)
            : t('common.notSet')}
        </StatTile>
        <StatTile label={t('trips.share')}>
          {report.businessShare != null
            ? t('trips.percent', { value: f.decimals(report.businessShare, 1) })
            : t('common.notSet')}
        </StatTile>
        <StatTile label={t('trips.count')}>{f.number(report.trips)}</StatTile>
      </div>

      {report.byPurpose.length > 0 && (
        <section
          aria-labelledby="purpose-h"
          className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
        >
          <h2 id="purpose-h" className="mb-3 text-heading font-semibold">
            {t('trips.byPurpose')}
          </h2>
          <BarList
            items={report.byPurpose.slice(0, 8).map((p) => ({
              key: p.purpose,
              label: p.purpose,
              value: p.distance,
            }))}
            formatValue={(n) => f.distance(n, unit)}
          />
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border border-line bg-surface-raised shadow-card">
        {trips.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">{t('trips.empty')}</p>
        ) : (
          <table className="w-full min-w-[680px] text-left">
            <thead className="bg-surface-sunken text-label text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  {t('trips.fields.date')}
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  {t('trips.fields.purpose')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('trips.fields.start')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('trips.fields.end')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  {t('trips.fields.distance')}
                </th>
                {canEdit && <th scope="col" className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="border-t border-line align-top">
                  <td className="px-4 py-2 font-mono text-data whitespace-nowrap">
                    {f.date(trip.date)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-semibold">{trip.purpose}</span>
                    {!trip.business && (
                      <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-ink-muted">
                        {t('trips.personal')}
                      </span>
                    )}
                    {(trip.from || trip.to) && (
                      <span className="block text-caption text-ink-muted">
                        {[trip.from, trip.to].filter(Boolean).join(' → ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-data tabular-nums">
                    {f.number(trip.startOdometer)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-data tabular-nums">
                    {f.number(trip.endOdometer)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-data tabular-nums">
                    {f.distance(trip.distance, unit)}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-1 text-right whitespace-nowrap">
                      <Button variant="ghost" onPress={() => setEditing(trip)}>
                        {t('actions.edit')}
                      </Button>
                      <Button variant="ghost" onPress={() => setRemoving(trip)}>
                        {t('actions.delete')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('trips.add') : t('trips.edit')}
      >
        {editing !== null && (
          <TripForm
            vehicleId={id}
            unit={unit}
            trip={editing === 'new' ? undefined : editing}
            startAt={current}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('trips.deleteTitle')}
        confirmLabel={t('actions.delete')}
        isPending={action.isPending}
        onConfirm={() =>
          removing &&
          action.mutate({ id: removing.id, remove: true }, { onSuccess: () => setRemoving(null) })
        }
      >
        {t('trips.deleteBody', { purpose: removing?.purpose ?? '' })}
      </ConfirmDialog>
    </div>
  );
}

function TripForm({
  vehicleId,
  unit,
  trip,
  startAt,
  onDone,
}: {
  vehicleId: number;
  unit: string;
  trip?: Trip;
  startAt: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const action = useTripAction(vehicleId);
  const [s, setS] = useState({
    date: trip?.date ?? todayIso(),
    start: trip ? String(trip.startOdometer) : startAt ? String(startAt) : '',
    end: trip ? String(trip.endOdometer) : '',
    purpose: trip?.purpose ?? '',
    from: trip?.from ?? '',
    to: trip?.to ?? '',
    notes: trip?.notes ?? '',
    business: trip?.business ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set =
    <K extends keyof typeof s>(k: K) =>
    (value: (typeof s)[K]) => {
      setS((x) => ({ ...x, [k]: value }));
      // The readings are validated under their API names.
      setErrors(({ [k]: _, [`${k}Odometer`]: __, ...rest }) => rest);
    };
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(/[,\s]/g, '')));
  const distance = num(s.end) - num(s.start);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = {
      date: s.date,
      startOdometer: num(s.start),
      endOdometer: num(s.end),
      purpose: s.purpose,
      from: s.from,
      to: s.to,
      notes: s.notes,
      business: s.business,
    };
    const parsed = TripInput.safeParse(data);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error.issues, t);
      if (parsed.error.issues.some((i) => i.message === 'before_start'))
        errs.endOdometer = t('trips.beforeStart');
      setErrors(errs);
      return;
    }
    action.mutate({ id: trip?.id, data }, { onSuccess: onDone });
  };

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={action.error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label={t('trips.fields.date')}
          type="date"
          value={s.date}
          onChange={set('date')}
          error={errors.date}
          inputClassName="font-mono"
          isRequired
        />
        <TextField
          label={t('trips.fields.startUnit', { unit })}
          value={s.start}
          onChange={set('start')}
          error={errors.startOdometer}
          inputMode="numeric"
          inputClassName="font-mono tabular-nums"
          isRequired
        />
        <TextField
          label={t('trips.fields.endUnit', { unit })}
          description={
            Number.isFinite(distance) && distance >= 0
              ? t('trips.distanceHint', { distance, unit })
              : undefined
          }
          value={s.end}
          onChange={set('end')}
          error={errors.endOdometer}
          inputMode="numeric"
          inputClassName="font-mono tabular-nums"
          isRequired
          autoFocus={!trip}
        />
      </div>
      <TextField
        label={t('trips.fields.purpose')}
        description={t('trips.purposeHint')}
        value={s.purpose}
        onChange={set('purpose')}
        error={errors.purpose}
        maxLength={200}
        isRequired
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t('trips.fields.from')} value={s.from} onChange={set('from')} />
        <TextField label={t('trips.fields.to')} value={s.to} onChange={set('to')} />
      </div>
      <TextAreaField label={t('trips.fields.notes')} value={s.notes} onChange={set('notes')} />
      <ToggleSwitch
        label={t('trips.isBusiness')}
        isSelected={s.business}
        onChange={set('business')}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={action.isPending}>
          {action.isPending ? t('actions.saving') : t('actions.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
      </div>
    </Form>
  );
}
