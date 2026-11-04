import { fromMilli, type Part, PartInput, toMilli, vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { partsQuery, usePartAction, useSavePart } from '../api/resources';
import { vehiclesQuery } from '../api/vehicles';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorNote } from '../components/ui/ErrorNote';
import { FormDialog } from '../components/ui/FormDialog';
import { SelectField, TextAreaField, TextField } from '../components/ui/fields';
import { useFormat } from '../lib/format';
import { useMe } from '../lib/useMe';
import { fieldErrors } from '../lib/validation';

export const Route = createFileRoute('/parts')({ component: PartsPage });

function PartForm({ part, onDone }: { part?: Part; onDone: () => void }) {
  const { t } = useTranslation();
  const save = useSavePart();
  const vehicles = useQuery(vehiclesQuery('all')).data ?? [];
  const [s, setS] = useState({
    name: part?.name ?? '',
    partNumber: part?.partNumber ?? '',
    manufacturer: part?.manufacturer ?? '',
    vehicleId: part?.vehicleId ? String(part.vehicleId) : '',
    quantity: part ? String(fromMilli(part.quantity)) : '1',
    unitCost: part?.unitCost != null ? String(fromMilli(part.unitCost)) : '',
    location: part?.location ?? '',
    notes: part?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof s) => (v: string) => setS((p) => ({ ...p, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const quantity = toMilli(s.quantity || '0');
    const unitCost = s.unitCost.trim() ? toMilli(s.unitCost) : null;
    const data = {
      ...s,
      vehicleId: s.vehicleId ? Number(s.vehicleId) : null,
      quantity: quantity ?? 0,
      unitCost,
    };
    const parsed = PartInput.safeParse(data);
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues, t);
    if (quantity == null) errs.quantity = t('validation.number');
    if (s.unitCost.trim() && unitCost == null) errs.unitCost = t('validation.money');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({ id: part?.id, data }, { onSuccess: onDone });
  };
  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={save.error} />
      <TextField
        label={t('parts.fields.name')}
        value={s.name}
        onChange={set('name')}
        error={errors.name}
        isRequired
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('parts.fields.partNumber')}
          value={s.partNumber}
          onChange={set('partNumber')}
          inputClassName="font-mono"
        />
        <TextField
          label={t('parts.fields.manufacturer')}
          value={s.manufacturer}
          onChange={set('manufacturer')}
        />
        <TextField
          label={t('parts.fields.quantity')}
          value={s.quantity}
          onChange={set('quantity')}
          error={errors.quantity}
          inputMode="decimal"
          inputClassName="font-mono"
        />
        <TextField
          label={t('parts.fields.unitCost')}
          value={s.unitCost}
          onChange={set('unitCost')}
          error={errors.unitCost}
          inputMode="decimal"
          inputClassName="font-mono"
        />
        <SelectField
          label={t('parts.fields.vehicle')}
          value={s.vehicleId}
          onChange={set('vehicleId')}
          options={[
            { value: '', label: t('parts.anyVehicle') },
            ...vehicles
              .filter((v) => v.access !== 'view')
              .map((v) => ({ value: String(v.id), label: v.nickname ?? vehicleTitle(v) })),
          ]}
        />
        <TextField
          label={t('parts.fields.location')}
          value={s.location}
          onChange={set('location')}
        />
      </div>
      <TextAreaField
        label={t('parts.fields.notes')}
        value={s.notes}
        onChange={set('notes')}
        rows={2}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={save.isPending}>
          {t('parts.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
      </div>
    </Form>
  );
}

function PartsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useMe();
  const parts = useQuery(partsQuery());
  const action = usePartAction();
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Part | null>(null);
  const canEdit = me?.role !== 'viewer';

  return (
    <>
      <PageHeader
        title={t('parts.title')}
        actions={
          canEdit && (
            <Button variant="primary" onPress={() => setEditing('new')}>
              <Icon name="add" size={16} />
              {t('parts.add')}
            </Button>
          )
        }
      />
      {parts.data && parts.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
          {t('parts.empty')}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {parts.data?.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-caption text-ink-muted">
                    {[
                      p.manufacturer,
                      p.partNumber && (
                        <span key="pn" className="font-mono">
                          {p.partNumber}
                        </span>
                      ),
                      p.vehicleTitle ?? t('parts.anyVehicle'),
                      p.location,
                    ]
                      .filter(Boolean)
                      .map((x, i) => (
                        <span key={typeof x === 'string' ? x : `n${i}`}>
                          {i > 0 && ' · '}
                          {x}
                        </span>
                      ))}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-figure ${p.quantity <= 0 ? 'text-red' : ''}`}>
                    {f.decimals(fromMilli(p.quantity), 3)}
                  </p>
                  {p.quantity <= 0 && (
                    <p className="text-caption font-semibold text-red">{t('parts.low')}</p>
                  )}
                  {p.unitCost != null && (
                    <p className="font-mono text-caption text-ink-muted">{f.money(p.unitCost)}</p>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                  <Button
                    className="min-w-11"
                    aria-label={t('parts.decrease', { name: p.name })}
                    onPress={() => action.mutate({ id: p.id, delta: -1000 })}
                  >
                    −
                  </Button>
                  <Button
                    className="min-w-11"
                    aria-label={t('parts.increase', { name: p.name })}
                    onPress={() => action.mutate({ id: p.id, delta: 1000 })}
                  >
                    +
                  </Button>
                  <Button variant="ghost" onPress={() => setEditing(p)}>
                    {t('parts.edit')}
                  </Button>
                  <Button variant="ghost" onPress={() => setDeleting(p)}>
                    {t('actions.delete')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('parts.add') : t('parts.edit')}
      >
        {editing !== null && (
          <PartForm
            part={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('parts.deleteTitle')}
        confirmLabel={t('parts.delete')}
        onConfirm={() =>
          deleting && action.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
        }
      >
        {deleting?.name}
      </ConfirmDialog>
    </>
  );
}
