import { SPEC_FIELDS, type SpecField, type Vehicle } from '@axlebook/shared';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { useSaveVehicle } from '../../api/vehicles';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';
import { FormDialog } from '../ui/FormDialog';
import { TextField } from '../ui/fields';

type Draft = Record<SpecField, string> & { other: { label: string; value: string }[] };

const draftOf = (v: Vehicle): Draft => ({
  ...(Object.fromEntries(SPEC_FIELDS.map((f) => [f, v.specs[f] ?? ''])) as Record<
    SpecField,
    string
  >),
  other: v.specs.other.map((o) => ({ ...o })),
});

/** The parts-and-fluids sheet: oil, filters, tires, wipers. What you need at the parts counter. */
export function SpecsCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation();
  const save = useSaveVehicle();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(vehicle));
  const canEdit = vehicle.access !== 'view';
  const rows: [string, string][] = [
    ...(vehicle.engine ? [[t('vehicle.fields.engine'), vehicle.engine] as [string, string]] : []),
    ...SPEC_FIELDS.flatMap((f) => {
      const value = vehicle.specs[f];
      return value ? [[t(`specs.fields.${f}`), value] as [string, string]] : [];
    }),
    ...vehicle.specs.other.map((o) => [o.label, o.value] as [string, string]),
  ];
  if (rows.length === 0 && !canEdit) return null;

  const open = () => {
    setDraft(draftOf(vehicle));
    save.reset();
    setEditing(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        id: vehicle.id,
        photo: { kind: 'keep' },
        data: {
          specs: {
            ...(Object.fromEntries(SPEC_FIELDS.map((f) => [f, draft[f]])) as Record<
              SpecField,
              string
            >),
            other: draft.other.filter((o) => o.label.trim() && o.value.trim()),
          },
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  };
  const setOther = (i: number, patch: Partial<Draft['other'][number]>) =>
    setDraft((d) => ({ ...d, other: d.other.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  return (
    <section
      aria-labelledby="specs-h"
      className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="specs-h" className="text-heading font-semibold">
          {t('specs.title')}
        </h2>
        {canEdit && <Button onPress={open}>{t('specs.edit')}</Button>}
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{t('specs.empty')}</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-label text-ink-muted">{label}</dt>
              <dd className="font-mono text-data break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <FormDialog isOpen={editing} onOpenChange={setEditing} title={t('specs.title')}>
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-caption text-ink-muted">{t('specs.hint')}</p>
          <ErrorNote error={save.error} />
          <div className="grid gap-3 sm:grid-cols-2">
            {SPEC_FIELDS.map((f) => (
              <TextField
                key={f}
                label={t(`specs.fields.${f}`)}
                value={draft[f]}
                onChange={(v) => setDraft((d) => ({ ...d, [f]: v }))}
                inputClassName="font-mono"
                maxLength={80}
                autoComplete="off"
              />
            ))}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label">{t('specs.other')}</legend>
            {draft.other.map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity but position
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <TextField
                  label={t('specs.otherLabel')}
                  value={o.label}
                  onChange={(v) => setOther(i, { label: v })}
                  maxLength={40}
                />
                <TextField
                  label={t('specs.otherValue')}
                  value={o.value}
                  onChange={(v) => setOther(i, { value: v })}
                  inputClassName="font-mono"
                  maxLength={80}
                />
                <Button
                  variant="ghost"
                  onPress={() =>
                    setDraft((d) => ({ ...d, other: d.other.filter((_, j) => j !== i) }))
                  }
                >
                  {t('specs.remove')}
                </Button>
              </div>
            ))}
            {draft.other.length < 20 && (
              <Button
                className="self-start"
                onPress={() =>
                  setDraft((d) => ({ ...d, other: [...d.other, { label: '', value: '' }] }))
                }
              >
                {t('specs.add')}
              </Button>
            )}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" isDisabled={save.isPending}>
              {save.isPending ? t('actions.saving') : t('actions.save')}
            </Button>
            <Button onPress={() => setEditing(false)}>{t('actions.cancel')}</Button>
          </div>
        </Form>
      </FormDialog>
    </section>
  );
}
