import {
  INSPECTION_TYPES,
  type Inspection,
  type InspectionInput,
  TRAILER_INSPECTION_ITEMS,
  TRUCK_INSPECTION_ITEMS,
  type Vehicle,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { inspectionsQuery, useInspectionAction } from '../../../api/extras';
import { vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { Segmented } from '../../../components/records/RecordForm';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { FormDialog } from '../../../components/ui/FormDialog';
import { SelectField, TextAreaField, TextField } from '../../../components/ui/fields';
import { useFormat } from '../../../lib/format';
import { todayIso } from '../../../lib/today';

export const Route = createFileRoute('/vehicles/$vehicleId/inspections')({
  component: InspectionsTab,
});

function InspectionsTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const list = useQuery(inspectionsQuery(id)).data;
  const action = useInspectionAction(id);
  const [creating, setCreating] = useState(false);
  const [correcting, setCorrecting] = useState<Inspection | null>(null);
  const [deleting, setDeleting] = useState<Inspection | null>(null);
  if (!v) return null;
  const canEdit = v.access !== 'view';

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Button variant="primary" className="self-start" onPress={() => setCreating(true)}>
          <Icon name="add" size={16} />
          {t('inspection.add')}
        </Button>
      )}
      <section className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6">
        {list && list.length > 0 ? (
          <ul className="divide-y divide-line">
            {list.map((ins) => {
              const defects = ins.items.filter((i) => !i.ok);
              return (
                <li key={ins.id} className="flex flex-col gap-2 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">
                      {t(`inspection.types.${ins.type}`)}
                      <span className="ml-2 font-mono text-data font-normal text-ink-muted">
                        {f.date(ins.date)}
                      </span>
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-caption font-semibold ${
                        ins.defects === 0
                          ? 'bg-surface-sunken text-ink-muted'
                          : ins.correctedAt
                            ? 'bg-surface-sunken text-ink'
                            : 'bg-red-soft text-red'
                      }`}
                    >
                      {ins.defects === 0
                        ? t('inspection.noDefects')
                        : t('inspection.defects', { count: ins.defects })}
                    </span>
                  </div>
                  <p className="flex flex-wrap gap-x-4 text-caption text-ink-muted">
                    {ins.inspector && <span>{ins.inspector}</span>}
                    {ins.odometer != null && (
                      <span className="font-mono">{f.distance(ins.odometer, v.odometerUnit)}</span>
                    )}
                  </p>
                  {defects.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {defects.map((d) => (
                        <li key={d.item}>
                          <span className="font-semibold">
                            {t(`inspection.items.${d.item as 'tires'}`)}
                          </span>
                          {d.note && <span className="ml-2 text-ink-muted">{d.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {ins.notes && <p className="whitespace-pre-wrap">{ins.notes}</p>}
                  {ins.correctedAt && (
                    <p className="text-caption text-ink-muted">
                      {t('inspection.corrected', { date: f.date(ins.correctedAt) })}
                      {ins.correctedBy && <span className="ml-2">{ins.correctedBy}</span>}
                      {ins.correctionNotes && <span className="block">{ins.correctionNotes}</span>}
                    </p>
                  )}
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {ins.defects > 0 && !ins.correctedAt && (
                        <Button onPress={() => setCorrecting(ins)}>
                          {t('inspection.correct')}
                        </Button>
                      )}
                      <Button variant="ghost" className="text-red" onPress={() => setDeleting(ins)}>
                        {t('actions.delete')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-ink-muted">{t('inspection.empty')}</p>
        )}
      </section>

      <FormDialog isOpen={creating} onOpenChange={setCreating} title={t('inspection.add')}>
        {creating && <InspectionForm vehicle={v} onDone={() => setCreating(false)} />}
      </FormDialog>
      <FormDialog
        isOpen={correcting !== null}
        onOpenChange={(o) => !o && setCorrecting(null)}
        title={t('inspection.correct')}
      >
        {correcting && (
          <CorrectForm inspection={correcting} vehicleId={id} onDone={() => setCorrecting(null)} />
        )}
      </FormDialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('inspection.deleteTitle')}
        confirmLabel={t('actions.delete')}
        isPending={action.isPending}
        onConfirm={() =>
          deleting &&
          action.mutate({ kind: 'delete', id: deleting.id }, { onSuccess: () => setDeleting(null) })
        }
      >
        {deleting && t('inspection.deleteBody', { date: f.date(deleting.date) })}
      </ConfirmDialog>
    </div>
  );
}

function InspectionForm({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const { t } = useTranslation();
  const action = useInspectionAction(vehicle.id);
  const items = vehicle.category === 'trailer' ? TRAILER_INSPECTION_ITEMS : TRUCK_INSPECTION_ITEMS;
  const [type, setType] = useState<InspectionInput['type']>('pre_trip');
  const [date, setDate] = useState(todayIso());
  const [odometer, setOdometer] = useState('');
  const [inspector, setInspector] = useState('');
  const [notes, setNotes] = useState('');
  const [results, setResults] = useState<Record<string, { ok: boolean; note: string }>>(() =>
    Object.fromEntries(items.map((i) => [i, { ok: true, note: '' }])),
  );
  const [odoError, setOdoError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    const odo = odometer.trim() === '' ? null : Number(odometer.replace(/[,\s]/g, ''));
    if (odo != null && !(Number.isInteger(odo) && odo >= 0)) {
      setOdoError(t('validation.number'));
      return;
    }
    action.mutate(
      {
        kind: 'create',
        data: {
          type,
          date,
          odometer: odo,
          inspector: inspector || null,
          notes: notes || null,
          items: items.map((item) => {
            const r = results[item] ?? { ok: true, note: '' };
            return { item, ok: r.ok, note: r.ok ? null : r.note || null };
          }),
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('inspection.fields.type')}
          value={type}
          onChange={setType}
          options={INSPECTION_TYPES.map((x) => ({ value: x, label: t(`inspection.types.${x}`) }))}
        />
        <TextField
          label={t('inspection.fields.date')}
          type="date"
          value={date}
          onChange={setDate}
          inputClassName="font-mono"
          isRequired
        />
        <TextField
          label={t('inspection.fields.odometer')}
          value={odometer}
          onChange={(x) => {
            setOdometer(x);
            setOdoError(undefined);
          }}
          inputMode="numeric"
          inputClassName="font-mono tabular-nums"
          error={odoError}
        />
        <TextField
          label={t('inspection.fields.inspector')}
          value={inspector}
          onChange={setInspector}
        />
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {items.map((item) => {
          const r = results[item] ?? { ok: true, note: '' };
          const label = t(`inspection.items.${item}`);
          return (
            <li key={item} className="flex flex-col gap-2 p-3">
              <Segmented
                label={label}
                value={r.ok ? 'ok' : 'defect'}
                onChange={(x) => setResults((s) => ({ ...s, [item]: { ...r, ok: x === 'ok' } }))}
                options={[
                  { value: 'ok', label: t('inspection.ok') },
                  { value: 'defect', label: t('inspection.defect') },
                ]}
              />
              {!r.ok && (
                <TextField
                  label={t('inspection.defectNote', { item: label })}
                  value={r.note}
                  onChange={(note) => setResults((s) => ({ ...s, [item]: { ...r, note } }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <TextAreaField
        label={t('inspection.fields.notes')}
        value={notes}
        onChange={setNotes}
        rows={3}
      />
      <ErrorNote error={action.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onDone}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" isDisabled={action.isPending}>
          {t('inspection.save')}
        </Button>
      </div>
    </Form>
  );
}

function CorrectForm({
  inspection,
  vehicleId,
  onDone,
}: {
  inspection: Inspection;
  vehicleId: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const action = useInspectionAction(vehicleId);
  const [by, setBy] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate(
          { kind: 'correct', id: inspection.id, correctedBy: by, correctionNotes: notes },
          { onSuccess: onDone },
        );
      }}
      className="flex flex-col gap-4"
    >
      <TextField label={t('inspection.correctedBy')} value={by} onChange={setBy} />
      <TextAreaField
        label={t('inspection.correctionNotes')}
        value={notes}
        onChange={setNotes}
        rows={3}
      />
      <ErrorNote error={action.error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onDone}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" isDisabled={action.isPending}>
          {t('inspection.correct')}
        </Button>
      </div>
    </Form>
  );
}
