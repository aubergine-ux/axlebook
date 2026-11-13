import {
  FUEL_TYPES,
  FUEL_UNITS,
  ODOMETER_UNITS,
  RECORD_KINDS,
  type SheetPlan,
  SPREADSHEET_FIELDS,
  type SpreadsheetAnalysis,
  type SpreadsheetCommitResult,
  type SpreadsheetPlan,
  type SpreadsheetPreview,
  VEHICLE_CATEGORIES,
  type VehiclePlan,
  vehicleTitle,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { DropZone, FileTrigger } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import {
  aiStatusQuery,
  useAnalyzeSpreadsheet,
  useCommitSpreadsheet,
  useForgetMapping,
  usePreviewSpreadsheet,
} from '../api/extras';
import { vehiclesQuery } from '../api/vehicles';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { ErrorNote } from '../components/ui/ErrorNote';
import { SelectField, TextField } from '../components/ui/fields';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useFormat } from '../lib/format';

export const Route = createFileRoute('/import')({ component: ImportPage });

const NONE = '__none__';
const card = 'rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6';

function ImportPage() {
  const { t } = useTranslation();
  const ai = useQuery(aiStatusQuery).data;
  const [useAi, setUseAi] = useState(true);
  const analyze = useAnalyzeSpreadsheet();
  const preview = usePreviewSpreadsheet();
  const commit = useCommitSpreadsheet();
  const forget = useForgetMapping();
  const fmt = useFormat();
  const [source, setSource] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<SpreadsheetAnalysis | null>(null);
  const [plan, setPlan] = useState<SpreadsheetPlan | null>(null);
  const [checked, setChecked] = useState<SpreadsheetPreview | null>(null);
  const [result, setResult] = useState<SpreadsheetCommitResult | null>(null);

  const start = (file: File | undefined) => {
    if (!file) return;
    setSource(file);
    setResult(null);
    setChecked(null);
    analyze.mutate(
      { file, ai: Boolean(ai?.enabled && useAi) },
      {
        onSuccess: (a) => {
          setAnalysis(a);
          setPlan(a.plan);
        },
      },
    );
  };
  // Any change to the plan makes the last preview stale.
  const update = (p: SpreadsheetPlan) => {
    setPlan(p);
    setChecked(null);
  };
  const reset = () => {
    setAnalysis(null);
    setPlan(null);
    setChecked(null);
    setResult(null);
    analyze.reset();
    preview.reset();
    commit.reset();
  };

  if (result) {
    return (
      <>
        <PageHeader title={t('import.sheetTitle')} />
        <section className={card} aria-live="polite">
          <p className="text-heading font-semibold">
            {t('import.done', { count: result.imported, skipped: result.skipped })}
          </p>
          <ErrorList errors={result.errors} />
          <ul className="mt-4 flex flex-wrap gap-2">
            {result.vehicles.map((v) => (
              <li key={v.vehicleId}>
                <Link
                  to="/vehicles/$vehicleId"
                  params={{ vehicleId: String(v.vehicleId) }}
                  className="text-label text-orange-text hover:underline"
                >
                  {v.key}
                </Link>
              </li>
            ))}
          </ul>
          <Button className="mt-4" onPress={reset}>
            {t('import.startOver')}
          </Button>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('import.sheetTitle')} />
      <div className="flex max-w-4xl flex-col gap-6">
        <p className="text-ink-muted">{t('import.sheetIntro')}</p>

        {!analysis && (
          <section className={`${card} flex flex-col gap-4`}>
            <DropZone
              onDrop={async (e) => {
                const item = e.items.find((i) => i.kind === 'file');
                if (item && item.kind === 'file') start(await item.getFile());
              }}
              className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-line-strong p-8 text-center data-[drop-target]:border-ink data-[drop-target]:bg-surface-sunken"
            >
              <p className="text-label">{t('import.sheetFile')}</p>
              <FileTrigger
                acceptedFileTypes={[
                  '.xlsx',
                  '.csv',
                  '.tsv',
                  '.txt',
                  'text/csv',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ]}
                onSelect={(files) => start(files?.[0])}
              >
                <Button variant="primary" isDisabled={analyze.isPending}>
                  {analyze.isPending ? t('import.analyzing') : t('import.choose')}
                </Button>
              </FileTrigger>
            </DropZone>
            {ai?.enabled ? (
              <div className="flex flex-col gap-1">
                <ToggleSwitch label={t('import.useAi')} isSelected={useAi} onChange={setUseAi} />
                <p className="text-caption text-ink-muted">
                  {t('import.aiNote', { model: ai.model })}
                </p>
              </div>
            ) : (
              <p className="text-caption text-ink-muted">{t('import.aiOff')}</p>
            )}
            {analyze.isPending && (
              <p role="status" className="text-ink-muted">
                {t('import.analyzing')}
              </p>
            )}
            <ErrorNote error={analyze.error} />
          </section>
        )}

        {analysis && plan && (
          <>
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2"
            >
              <p>
                {analysis.aiError && analysis.aiError !== 'disabled'
                  ? t('import.aiFallback')
                  : t(`import.planBy.${analysis.planSource}`, {
                      date: analysis.savedMapping
                        ? fmt.date(analysis.savedMapping.savedAt.slice(0, 10))
                        : '',
                    })}
              </p>
              {analysis.savedMapping && source && (
                <Button
                  isDisabled={forget.isPending || analyze.isPending}
                  onPress={() =>
                    forget.mutate(analysis.savedMapping?.id ?? 0, {
                      onSuccess: () => start(source),
                    })
                  }
                >
                  {t('import.forgetMapping')}
                </Button>
              )}
            </div>
            {plan.sheets.map((sp, i) => {
              const info = analysis.sheets.find((s) => s.name === sp.sheet);
              if (!info) return null;
              return (
                <SheetCard
                  key={sp.sheet}
                  sheet={sp}
                  info={info}
                  onChange={(next) =>
                    update({ ...plan, sheets: plan.sheets.map((x, j) => (j === i ? next : x)) })
                  }
                />
              );
            })}
            <VehiclesCard
              plan={plan}
              problems={checked}
              onChange={(vehicles) => update({ ...plan, vehicles })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onPress={() =>
                  preview.mutate(
                    { uploadId: analysis.uploadId, plan },
                    {
                      onSuccess: (p) => {
                        setChecked(p);
                        setPlan(p.plan);
                      },
                    },
                  )
                }
                isDisabled={preview.isPending}
              >
                {t('import.preview')}
              </Button>
              <Button variant="ghost" onPress={reset}>
                {t('import.startOver')}
              </Button>
            </div>
            <ErrorNote error={preview.error} />
            {checked && (
              <PreviewCard
                preview={checked}
                isPending={commit.isPending}
                error={commit.error}
                onCommit={() =>
                  commit.mutate({ uploadId: analysis.uploadId, plan }, { onSuccess: setResult })
                }
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function SheetCard({
  sheet,
  info,
  onChange,
}: {
  sheet: SheetPlan;
  info: SpreadsheetAnalysis['sheets'][number];
  onChange: (s: SheetPlan) => void;
}) {
  const { t } = useTranslation();
  const headerOptions = [
    { value: NONE, label: t('import.none') },
    ...info.headers.map((h) => ({ value: h, label: h })),
  ];
  const pick = (v: string) => (v === NONE ? null : v);
  return (
    <section aria-label={info.name} className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading font-semibold">
          {t('import.sheet', { name: info.name, count: info.rowCount })}
        </h2>
        <ToggleSwitch
          label={t('import.includeSheet')}
          isSelected={sheet.include}
          onChange={(include) => onChange({ ...sheet, include })}
        />
      </div>
      {sheet.include && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('import.vehicleColumn')}
              value={sheet.vehicleColumn ?? NONE}
              onChange={(v) => onChange({ ...sheet, vehicleColumn: pick(v) })}
              options={headerOptions}
            />
            {!sheet.vehicleColumn && (
              <TextField
                label={t('import.sheetVehicle')}
                value={sheet.vehicleKey ?? info.name}
                onChange={(v) => onChange({ ...sheet, vehicleKey: v || null })}
              />
            )}
            <SelectField
              label={t('import.kindColumn')}
              value={sheet.kindColumn ?? NONE}
              onChange={(v) => onChange({ ...sheet, kindColumn: pick(v), kindValues: [] })}
              options={headerOptions}
            />
            <SelectField
              label={t('import.defaultKind')}
              value={sheet.defaultKind}
              onChange={(v) => onChange({ ...sheet, defaultKind: v })}
              options={RECORD_KINDS.map((k) => ({ value: k, label: t(`record.kinds.${k}`) }))}
            />
            <SelectField
              label={t('import.dateOrder')}
              value={sheet.dateOrder}
              onChange={(v) => onChange({ ...sheet, dateOrder: v })}
              options={(['mdy', 'dmy'] as const).map((o) => ({
                value: o,
                label: t(`import.dateOrders.${o}`),
              }))}
            />
          </div>
          <details className="rounded-md border border-line">
            <summary className="cursor-pointer px-3 py-2.5 text-label">
              {t('import.columns')}
            </summary>
            <div className="grid gap-4 p-3 sm:grid-cols-2">
              {SPREADSHEET_FIELDS.map((field) => (
                <SelectField
                  key={field}
                  label={t(`import.fieldLabels.${field}`)}
                  value={sheet.columns[field] ?? NONE}
                  onChange={(v) =>
                    onChange({ ...sheet, columns: { ...sheet.columns, [field]: pick(v) } })
                  }
                  options={headerOptions}
                />
              ))}
            </div>
          </details>
          {info.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-caption">
                <caption className="mb-1 text-left text-label text-ink-muted">
                  {t('import.sample')}
                </caption>
                <thead>
                  <tr>
                    {info.headers.map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-line px-2 py-1 text-left font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {info.sample.map((row, r) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: sample rows have no identity
                    <tr key={r}>
                      {info.headers.map((h, c) => (
                        <td
                          key={h}
                          className="border-b border-line px-2 py-1 font-mono whitespace-nowrap"
                        >
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function VehiclesCard({
  plan,
  problems,
  onChange,
}: {
  plan: SpreadsheetPlan;
  problems: SpreadsheetPreview | null;
  onChange: (v: VehiclePlan[]) => void;
}) {
  const { t } = useTranslation();
  const garage = (useQuery(vehiclesQuery('false')).data ?? []).filter((v) => v.access !== 'view');
  if (plan.vehicles.length === 0) return null;
  const set = (i: number, patch: Partial<VehiclePlan>) =>
    onChange(plan.vehicles.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <section aria-labelledby="veh-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="veh-h" className="text-heading font-semibold">
        {t('import.vehicles')}
      </h2>
      {plan.vehicles.map((v, i) => {
        const missing = problems?.vehicles.find((p) => p.key === v.key)?.problems ?? [];
        const err = (f: string) => (missing.includes(f) ? t('validation.required') : undefined);
        return (
          <fieldset key={v.key} className="rounded-md border border-line p-3">
            <legend className="px-1 font-semibold">{v.key}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t('import.vehicleTarget')}
                value={v.existingVehicleId == null ? NONE : String(v.existingVehicleId)}
                onChange={(x) => set(i, { existingVehicleId: x === NONE ? null : Number(x) })}
                options={[
                  { value: NONE, label: t('import.newVehicle') },
                  ...garage.map((g) => ({
                    value: String(g.id),
                    label: t('import.existing', { name: g.nickname ?? vehicleTitle(g) }),
                  })),
                ]}
                className="sm:col-span-2"
              />
              {v.existingVehicleId == null && (
                <>
                  <SelectField
                    label={t('vehicle.fields.category')}
                    value={v.category}
                    onChange={(category) => set(i, { category })}
                    options={VEHICLE_CATEGORIES.map((c) => ({
                      value: c,
                      label: t(`vehicle.categories.${c}`),
                    }))}
                  />
                  <YearField
                    label={t('vehicle.fields.year')}
                    value={v.year}
                    onChange={(year) => set(i, { year })}
                    error={err('year')}
                  />
                  <TextField
                    label={t('vehicle.fields.make')}
                    value={v.make ?? ''}
                    onChange={(x) => set(i, { make: x || null })}
                    error={err('make')}
                    isRequired
                  />
                  <TextField
                    label={t('vehicle.fields.model')}
                    value={v.model ?? ''}
                    onChange={(x) => set(i, { model: x || null })}
                    error={err('model')}
                    isRequired
                  />
                  <TextField
                    label={t('vehicle.fields.nickname')}
                    value={v.nickname ?? ''}
                    onChange={(x) => set(i, { nickname: x || null })}
                  />
                  <SelectField
                    label={t('vehicle.fields.fuelType')}
                    value={v.fuelType}
                    onChange={(fuelType) => set(i, { fuelType })}
                    options={FUEL_TYPES.map((x) => ({
                      value: x,
                      label: t(`vehicle.fuelType.${x}`),
                    }))}
                  />
                  <SelectField
                    label={t('vehicle.fields.odometerUnit')}
                    value={v.odometerUnit}
                    onChange={(odometerUnit) => set(i, { odometerUnit })}
                    options={ODOMETER_UNITS.map((x) => ({
                      value: x,
                      label: t(`units.odometer.${x}`),
                    }))}
                  />
                  <SelectField
                    label={t('vehicle.fields.fuelUnit')}
                    value={v.fuelUnit}
                    onChange={(fuelUnit) => set(i, { fuelUnit })}
                    options={FUEL_UNITS.map((x) => ({ value: x, label: t(`units.fuel.${x}`) }))}
                  />
                </>
              )}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}

/** A year typed digit by digit: the plan only gets a value once it's a real year. */
function YearField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number | null;
  onChange: (year: number | null) => void;
  error?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  return (
    <TextField
      label={label}
      value={text}
      onChange={(x) => {
        setText(x);
        onChange(/^\d{4}$/.test(x.trim()) ? Number(x.trim()) : null);
      }}
      inputMode="numeric"
      inputClassName="font-mono"
      error={error}
      isRequired
    />
  );
}

function PreviewCard({
  preview,
  onCommit,
  isPending,
  error,
}: {
  preview: SpreadsheetPreview;
  onCommit: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const blocked = preview.vehicles.some((v) => v.records > 0 && v.problems.length > 0);
  return (
    <section aria-labelledby="prev-h" aria-live="polite" className={`${card} flex flex-col gap-4`}>
      <h2 id="prev-h" className="text-heading font-semibold">
        {t('import.previewTitle')}
      </h2>
      <p className="font-mono">
        {t('import.previewSummary', { valid: preview.valid, count: preview.total })}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {preview.vehicles.map((v) => (
          <li key={v.key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span className="font-semibold">{v.label}</span>
            <span className="flex gap-3 font-mono text-data text-ink-muted">
              <span>{t('import.vehicleRecords', { count: v.records })}</span>
              {v.firstDate && v.lastDate && (
                <span>
                  {t('import.dateRange', {
                    from: f.date(v.firstDate, 'short'),
                    to: f.date(v.lastDate, 'short'),
                  })}
                </span>
              )}
            </span>
            {v.records > 0 && v.problems.length > 0 && (
              <span className="w-full text-caption font-semibold text-red">
                {t('import.needs', {
                  fields: v.problems.map((p) => t(`vehicle.fields.${p as 'year'}`)).join(', '),
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <ErrorList errors={preview.errors} />
      <ErrorNote error={error} />
      <Button
        variant="primary"
        className="self-start"
        isDisabled={blocked || preview.valid === 0 || isPending}
        onPress={onCommit}
      >
        {isPending ? t('import.committing') : t('import.commit')}
      </Button>
    </section>
  );
}

function ErrorList({ errors }: { errors: { sheet: string; row: number; message: string }[] }) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;
  return (
    <details className="rounded-md border border-line">
      <summary className="cursor-pointer px-3 py-2.5 text-label">
        {t('import.problemRows', { count: errors.length })}
      </summary>
      <ul className="max-h-64 overflow-y-auto px-3 pb-3 font-mono text-caption">
        {errors.map((e) => (
          <li key={`${e.sheet}-${e.row}`}>
            {t('import.sheetRowError', {
              sheet: e.sheet,
              row: e.row,
              message: t(`import.problems.${e.message as 'date'}`, { defaultValue: e.message }),
            })}
          </li>
        ))}
      </ul>
    </details>
  );
}
