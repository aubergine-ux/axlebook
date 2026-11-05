import {
  divideMilli,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  fromMilli,
  isCommercial,
  type LogRecord,
  multiplyMilli,
  RECORD_KINDS,
  RecordInput,
  type RecordKind,
  toMilli,
  type Vehicle,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { Checkbox, FileTrigger, Form, Label, Radio, RadioGroup } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import {
  partsQuery,
  useDeleteAttachment,
  useSaveRecord,
  useUploadAttachment,
  vehicleRemindersQuery,
} from '../../api/resources';
import { useFormat } from '../../lib/format';
import { todayIso } from '../../lib/today';
import { fieldErrors, parseReading } from '../../lib/validation';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';
import { FieldGroup, SelectField, TextAreaField, TextField } from '../ui/fields';

type FuelField = 'volume' | 'price' | 'total';

const fmtMilli = (m: number | null | undefined, digits = 3) =>
  m == null ? '' : String(Math.round(fromMilli(m) * 10 ** digits) / 10 ** digits);

export function CheckboxField({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Checkbox
      isSelected={isSelected}
      onChange={onChange}
      className="group flex cursor-pointer items-start gap-3 py-1"
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border border-line-strong bg-surface-raised group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink"
      >
        <svg
          viewBox="0 0 16 16"
          className="hidden h-3.5 w-3.5 text-surface-raised group-data-[selected]:block"
          aria-hidden
        >
          <path
            d="M3 8.5l3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        <span className="block">{label}</span>
        {description && <span className="block text-caption text-ink-muted">{description}</span>}
      </span>
    </Checkbox>
  );
}

/** Segmented control: a sunken track with the selected option raised (no orange). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  isDisabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  isDisabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={(v) => onChange(v as T)}
      orientation="horizontal"
      isDisabled={isDisabled}
      className="flex flex-col gap-1"
    >
      <Label className="text-label">{label}</Label>
      <div className="flex w-full flex-wrap gap-1 rounded-md bg-surface-sunken p-1 sm:w-fit">
        {options.map((o) => (
          <Radio
            key={o.value}
            value={o.value}
            isDisabled={o.disabled}
            className="min-h-9 flex-1 cursor-pointer rounded-sm px-3 py-1.5 text-center text-label text-ink-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[selected]:bg-surface-raised data-[selected]:text-ink data-[selected]:shadow-card sm:flex-none"
          >
            {o.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

/** Values to start a new record with (from the local assistant), as the person would type them. */
export interface RecordPrefill {
  date?: string;
  odometer?: string;
  title?: string;
  cost?: string;
  notes?: string;
  volume?: string;
  price?: string;
  total?: string;
  station?: string;
}

export function RecordForm({
  vehicle,
  record,
  initialKind = 'service',
  prefill,
  initialFiles = [],
  onSaved,
  onCancel,
}: {
  vehicle: Vehicle;
  record?: LogRecord;
  initialKind?: RecordKind;
  /** Starting values for a new record; the person reviews them before saving. */
  prefill?: RecordPrefill;
  /** Files attached once the record is saved (a scanned receipt). */
  initialFiles?: File[];
  onSaved: (r: LogRecord) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const save = useSaveRecord();
  const upload = useUploadAttachment();
  const removeAttachment = useDeleteAttachment();
  const parts = useQuery(partsQuery(vehicle.id)).data ?? [];
  const reminders = useQuery(vehicleRemindersQuery(vehicle.id)).data ?? [];

  const [kind, setKind] = useState<RecordKind>(record?.kind ?? initialKind);
  const [s, setS] = useState(() => ({
    date: record?.date ?? prefill?.date ?? todayIso(),
    odometer: record?.odometer != null ? String(record.odometer) : (prefill?.odometer ?? ''),
    title: record?.title ?? prefill?.title ?? '',
    cost: record && record.kind !== 'fuel' ? fmtMilli(record.cost, 2) : (prefill?.cost ?? ''),
    notes: record?.notes ?? prefill?.notes ?? '',
    tags: record?.tags.join(', ') ?? '',
    category: (record?.expenseCategory ?? 'registration') as ExpenseCategory,
    volume: record ? fmtMilli(record.fuel?.volume) : (prefill?.volume ?? ''),
    price: record ? fmtMilli(record.fuel?.pricePerUnit) : (prefill?.price ?? ''),
    total: record?.kind === 'fuel' ? fmtMilli(record.cost, 2) : (prefill?.total ?? ''),
    isFull: record?.fuel?.isFull ?? true,
    missedPrevious: record?.fuel?.missedPrevious ?? false,
    grade: record?.fuel?.grade ?? '',
    station: record?.fuel?.station ?? prefill?.station ?? '',
    jurisdiction: record?.fuel?.jurisdiction ?? '',
  }));
  const [usedParts, setUsedParts] = useState(() =>
    (record?.parts ?? [])
      .filter((p) => p.partId != null)
      .map((p) => ({
        uid: crypto.randomUUID(),
        partId: p.partId as number,
        quantity: fmtMilli(p.quantity),
      })),
  );
  const [completes, setCompletes] = useState<number[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>(initialFiles);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Which two fuel fields were edited most recently; the other one is derived.
  const [fuelOrder, setFuelOrder] = useState<FuelField[]>(['volume', 'price']);

  const set =
    <K extends keyof typeof s>(key: K) =>
    (value: (typeof s)[K]) => {
      setS((prev) => ({ ...prev, [key]: value }));
      setErrors(({ [key]: _, ...rest }) => rest);
    };

  function setFuel(field: FuelField, value: string) {
    const order = [field, ...fuelOrder.filter((x) => x !== field)].slice(0, 2) as FuelField[];
    setFuelOrder(order);
    const next = { volume: s.volume, price: s.price, total: s.total, [field]: value };
    const derived = (['volume', 'price', 'total'] as const).find((x) => !order.includes(x));
    const v = toMilli(next.volume);
    const p = toMilli(next.price);
    const tot = toMilli(next.total);
    if (derived === 'total' && v && p) next.total = fmtMilli(multiplyMilli(v, p), 2);
    if (derived === 'price' && v && tot != null) next.price = fmtMilli(divideMilli(tot, v));
    if (derived === 'volume' && p && tot != null) next.volume = fmtMilli(divideMilli(tot, p));
    setS((prev) => ({ ...prev, ...next }));
    setErrors(({ fuel: _, ...rest }) => rest);
  }

  const activeReminders = useMemo(
    () => reminders.filter((r) => !r.archivedAt && !record?.completedReminderIds.includes(r.id)),
    [reminders, record],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isFuel = kind === 'fuel';
    const errs: Record<string, string> = {};
    const money = (raw: string, key: string) => {
      if (raw.trim() === '') return null;
      const m = toMilli(raw);
      if (m == null || m < 0) errs[key] = t('validation.money');
      return m;
    };
    const cost = isFuel ? money(s.total, 'total') : money(s.cost, 'cost');
    const volume = isFuel ? toMilli(s.volume) : null;
    const price = isFuel ? money(s.price, 'price') : null;
    const odometer = s.odometer.trim() ? parseReading(s.odometer) : null;
    const data = {
      kind,
      date: s.date,
      odometer,
      title: isFuel ? null : s.title,
      cost: cost ?? 0,
      notes: s.notes,
      tags: s.tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      expenseCategory: kind === 'expense' ? s.category : null,
      fuel: isFuel
        ? {
            volume: volume ?? 0,
            pricePerUnit: price,
            isFull: s.isFull,
            missedPrevious: s.missedPrevious,
            grade: s.grade,
            station: s.station,
            ...(isCommercial(vehicle.category)
              ? { jurisdiction: s.jurisdiction.trim().toUpperCase() }
              : {}),
          }
        : null,
      parts: usedParts
        .map((p) => ({ partId: p.partId, quantity: toMilli(p.quantity) ?? 0 }))
        .filter((p) => p.quantity > 0),
      completesReminderIds: completes,
    };
    const parsed = RecordInput.safeParse(data);
    if (!parsed.success) Object.assign(errs, fieldErrors(parsed.error.issues, t));
    if (
      isFuel &&
      isCommercial(vehicle.category) &&
      s.jurisdiction.trim() &&
      !/^[A-Za-z]{2,3}$/.test(s.jurisdiction.trim())
    ) {
      errs.jurisdiction = t('validation.invalid');
      // The schema reports it under "fuel"; keep that for the fuel amount only.
      if (volume && volume > 0) delete errs.fuel;
    }
    if (isFuel && !(volume && volume > 0)) errs.fuel = t('validation.required');
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    save.mutate(
      { id: record?.id, vehicleId: vehicle.id, data },
      {
        onSuccess: async (saved) => {
          for (const file of pendingFiles) await upload.mutateAsync({ recordId: saved.id, file });
          onSaved(saved);
        },
      },
    );
  }

  const fuelUnit = t(`units.fuelShort.${vehicle.fuelUnit}`);
  const isFuel = kind === 'fuel';

  return (
    <Form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <ErrorNote error={save.error} />
      <Segmented
        label={t('record.kindLabel')}
        value={kind}
        onChange={(k) => setKind(k)}
        options={RECORD_KINDS.map((k) => ({
          value: k,
          label: t(`record.kinds.${k}`),
          // Fuel records keep their fuel data; switching in or out of fuel isn't allowed on edit.
          disabled: Boolean(record) && (k === 'fuel') !== (record?.kind === 'fuel'),
        }))}
      />

      <FieldGroup title={isFuel ? t('record.fuelTitle') : t(`record.kinds.${kind}`)}>
        <TextField
          label={t('record.fields.date')}
          type="date"
          value={s.date}
          onChange={set('date')}
          error={errors.date}
          inputClassName="font-mono"
          isRequired
        />
        <TextField
          label={t('record.fields.odometer', { unit: vehicle.odometerUnit })}
          value={s.odometer}
          onChange={set('odometer')}
          inputMode="numeric"
          error={errors.odometer}
          inputClassName="font-mono tabular-nums"
          isRequired={isFuel}
        />
        {!isFuel && (
          <TextField
            label={t('record.fields.title')}
            value={s.title}
            onChange={set('title')}
            error={errors.title}
            className="sm:col-span-2"
            isRequired
          />
        )}
        {kind === 'expense' && (
          <SelectField
            label={t('record.fields.category')}
            value={s.category}
            onChange={set('category')}
            options={EXPENSE_CATEGORIES.map((c) => ({
              value: c,
              label: t(`record.categories.${c}`),
            }))}
          />
        )}
        {!isFuel && (
          <TextField
            label={t('record.fields.cost')}
            value={s.cost}
            onChange={set('cost')}
            inputMode="decimal"
            error={errors.cost}
            inputClassName="font-mono tabular-nums"
          />
        )}
        {isFuel && (
          <>
            <TextField
              label={t('record.fields.volume', { unit: fuelUnit })}
              value={s.volume}
              onChange={(v) => setFuel('volume', v)}
              inputMode="decimal"
              error={errors.fuel}
              inputClassName="font-mono tabular-nums"
              isRequired
            />
            <TextField
              label={t('record.fields.pricePerUnit', { unit: fuelUnit })}
              value={s.price}
              onChange={(v) => setFuel('price', v)}
              inputMode="decimal"
              error={errors.price}
              inputClassName="font-mono tabular-nums"
            />
            <TextField
              label={t('record.fields.total')}
              description={t('record.hints.twoOfThree')}
              value={s.total}
              onChange={(v) => setFuel('total', v)}
              inputMode="decimal"
              error={errors.total}
              inputClassName="font-mono tabular-nums"
            />
            <div className="flex flex-col gap-1 sm:col-span-2">
              <CheckboxField
                label={t('record.fields.isFull')}
                isSelected={s.isFull}
                onChange={set('isFull')}
              />
              <CheckboxField
                label={t('record.fields.missedPrevious')}
                description={t('record.hints.missed')}
                isSelected={s.missedPrevious}
                onChange={set('missedPrevious')}
              />
            </div>
            <TextField label={t('record.fields.grade')} value={s.grade} onChange={set('grade')} />
            <TextField
              label={t('record.fields.station')}
              value={s.station}
              onChange={set('station')}
            />
            {isCommercial(vehicle.category) && (
              <TextField
                label={t('record.fields.jurisdiction')}
                description={t('ifta.hint')}
                value={s.jurisdiction}
                onChange={set('jurisdiction')}
                error={errors.jurisdiction}
                inputClassName="font-mono uppercase"
                maxLength={3}
                autoComplete="off"
              />
            )}
          </>
        )}
        <TextField
          label={t('record.fields.tags')}
          description={t('record.hints.tags')}
          value={s.tags}
          onChange={set('tags')}
          error={errors.tags}
          className="sm:col-span-2"
        />
        <TextAreaField
          label={t('record.fields.notes')}
          value={s.notes}
          onChange={set('notes')}
          error={errors.notes}
          className="sm:col-span-2"
        />
      </FieldGroup>

      {!isFuel && (
        <fieldset className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
          <legend className="px-1 text-heading font-semibold">{t('record.parts')}</legend>
          {parts.length === 0 ? (
            <p className="text-ink-muted">{t('record.noParts')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {usedParts.map((u, i) => (
                <div key={u.uid} className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t('parts.fields.name')}
                    value={String(u.partId)}
                    onChange={(v) =>
                      setUsedParts((list) =>
                        list.map((x, j) => (j === i ? { ...x, partId: Number(v) } : x)),
                      )
                    }
                    options={parts.map((p) => ({
                      value: String(p.id),
                      label: `${p.name}${p.partNumber ? ` (${p.partNumber})` : ''} · ${f.decimals(fromMilli(p.quantity))}`,
                    }))}
                    className="min-w-48 flex-1"
                  />
                  <TextField
                    label={t('record.partQuantity')}
                    value={u.quantity}
                    onChange={(v) =>
                      setUsedParts((list) =>
                        list.map((x, j) => (j === i ? { ...x, quantity: v } : x)),
                      )
                    }
                    inputMode="decimal"
                    className="w-28"
                    inputClassName="font-mono"
                  />
                  <Button
                    variant="ghost"
                    onPress={() => setUsedParts((list) => list.filter((_, j) => j !== i))}
                  >
                    {t('record.removePart')}
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  onPress={() =>
                    setUsedParts((list) => [
                      ...list,
                      {
                        uid: crypto.randomUUID(),
                        partId: (parts[0] as { id: number }).id,
                        quantity: '1',
                      },
                    ])
                  }
                >
                  <Icon name="add" size={16} />
                  {t('record.addPart')}
                </Button>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {activeReminders.length > 0 && (
        <fieldset className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
          <legend className="px-1 text-heading font-semibold">{t('record.completes')}</legend>
          {activeReminders.map((r) => (
            <CheckboxField
              key={r.id}
              label={r.title}
              isSelected={completes.includes(r.id)}
              onChange={(on) =>
                setCompletes((list) => (on ? [...list, r.id] : list.filter((x) => x !== r.id)))
              }
            />
          ))}
        </fieldset>
      )}

      <fieldset className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
        <legend className="px-1 text-heading font-semibold">{t('record.attachments')}</legend>
        <ul className="mb-3 flex flex-col gap-2">
          {record?.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-orange-text underline-offset-2 hover:underline"
              >
                {a.name}
              </a>
              <span className="font-mono text-caption text-ink-muted">
                {t('units.kb', { value: f.decimals(a.size / 1024, 0) })}
              </span>
              <Button
                variant="ghost"
                aria-label={t('record.removeAttachment', { name: a.name })}
                onPress={() => removeAttachment.mutate(a.id)}
              >
                {t('actions.delete')}
              </Button>
            </li>
          ))}
          {pendingFiles.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-3"
            >
              <span className="flex-1 truncate">{file.name}</span>
              <Button
                variant="ghost"
                aria-label={t('record.removeAttachment', { name: file.name })}
                onPress={() => setPendingFiles((l) => l.filter((_, j) => j !== i))}
              >
                {t('actions.delete')}
              </Button>
            </li>
          ))}
        </ul>
        <FileTrigger
          allowsMultiple
          acceptedFileTypes={[
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'application/pdf',
          ]}
          onSelect={(files) => files && setPendingFiles((l) => [...l, ...Array.from(files)])}
        >
          <Button>
            <Icon name="attachment" size={16} />
            {t('record.attach')}
          </Button>
        </FileTrigger>
        <p className="mt-2 text-caption text-ink-muted">{t('record.attachHint')}</p>
        <ErrorNote error={upload.error} className="mt-2" />
      </fieldset>

      <div className="sticky bottom-16 z-10 -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button
          type="submit"
          variant="primary"
          isDisabled={save.isPending || upload.isPending}
          className="flex-1 md:flex-none"
        >
          {save.isPending || upload.isPending ? t('actions.saving') : t('record.save')}
        </Button>
        <Button onPress={onCancel} className="flex-1 md:flex-none">
          {t('actions.cancel')}
        </Button>
      </div>
    </Form>
  );
}
