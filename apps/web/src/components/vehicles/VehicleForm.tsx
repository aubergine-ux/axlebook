import {
  FUEL_TYPES,
  FUEL_UNITS,
  type FuelType,
  type FuelUnit,
  fromMilli,
  isCommercial,
  ODOMETER_UNITS,
  type OdometerUnit,
  sectionOf,
  toMilli,
  type UnitSystem,
  VEHICLE_CATEGORIES,
  type Vehicle,
  type VehicleCategory,
  VehicleInput,
} from '@axlebook/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FileTrigger, Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../api/client';
import type { PhotoChange } from '../../api/vehicles';
import { resizeImage } from '../../lib/image';
import { fieldErrors } from '../../lib/validation';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { FieldGroup, SelectField, TextAreaField, TextField } from '../ui/fields';

type FormState = {
  category: VehicleCategory;
  unitNumber: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  nickname: string;
  vin: string;
  licensePlate: string;
  color: string;
  odometerUnit: OdometerUnit;
  fuelUnit: FuelUnit;
  fuelType: FuelType;
  purchaseDate: string;
  purchasePrice: string;
  notes: string;
};

function initialState(v: Vehicle | undefined, units: UnitSystem): FormState {
  return {
    category: v?.category ?? 'car',
    unitNumber: v?.unitNumber ?? '',
    year: v ? String(v.year) : '',
    make: v?.make ?? '',
    model: v?.model ?? '',
    trim: v?.trim ?? '',
    nickname: v?.nickname ?? '',
    vin: v?.vin ?? '',
    licensePlate: v?.licensePlate ?? '',
    color: v?.color ?? '',
    odometerUnit: v?.odometerUnit ?? (units === 'metric' ? 'km' : 'mi'),
    fuelUnit: v?.fuelUnit ?? (units === 'metric' ? 'l' : 'gal_us'),
    fuelType: v?.fuelType ?? 'gasoline',
    purchaseDate: v?.purchaseDate ?? '',
    purchasePrice: v?.purchasePrice != null ? String(fromMilli(v.purchasePrice)) : '',
    notes: v?.notes ?? '',
  };
}

export interface VehicleFormSubmit {
  data: VehicleInput;
  photo: PhotoChange;
}

export function VehicleForm({
  vehicle,
  defaultUnits,
  onSubmit,
  onCancel,
  isPending,
  serverError,
}: {
  vehicle?: Vehicle;
  defaultUnits: UnitSystem;
  onSubmit: (values: VehicleFormSubmit) => void;
  onCancel: () => void;
  isPending: boolean;
  serverError: unknown;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() => initialState(vehicle, defaultUnits));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [preview, setPreview] = useState<string | null>(vehicle?.photoUrl ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const formErrorId = useId();

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => {
      setState((s) => ({ ...s, [key]: value }));
      setErrors(({ [key]: _, ...rest }) => rest);
    };

  // Map server-side validation issues (paths like "/year") onto fields.
  useEffect(() => {
    if (serverError instanceof ApiRequestError && serverError.code === 'validation_failed') {
      const issues = (serverError.params?.issues ?? []) as { path: string }[];
      const mapped: Record<string, string> = {};
      for (const i of issues) {
        const field = i.path.replace(/^\//, '').split('/')[0];
        if (field) mapped[field] = t('validation.invalid');
      }
      setErrors((e) => ({ ...mapped, ...e }));
    }
  }, [serverError, t]);

  // Revoke object URLs created for local previews.
  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pickPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPhotoError(null);
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) {
      setPhotoError(t('validation.image'));
      return;
    }
    setPhotoBusy(true);
    try {
      const blob = await resizeImage(file);
      setPhoto({ kind: 'set', blob });
      setPreview(URL.createObjectURL(blob));
    } catch {
      setPhotoError(t('validation.image'));
    } finally {
      setPhotoBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const price = state.purchasePrice.trim() === '' ? null : toMilli(state.purchasePrice);
    const candidate = {
      category: state.category,
      unitNumber: isCommercial(state.category) ? state.unitNumber : '',
      year: state.year.trim() === '' ? undefined : Number(state.year),
      make: state.make,
      model: state.model,
      trim: state.trim,
      nickname: state.nickname,
      vin: state.vin,
      licensePlate: state.licensePlate,
      color: state.color,
      odometerUnit: state.odometerUnit,
      fuelUnit: state.fuelUnit,
      fuelType: state.fuelType,
      purchaseDate: state.purchaseDate || null,
      purchasePrice: price,
      notes: state.notes,
    };
    const parsed = VehicleInput.safeParse(candidate);
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues, t);
    if (state.purchasePrice.trim() !== '' && price === null)
      errs.purchasePrice = t('validation.money');
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    onSubmit({ data: candidate as VehicleInput, photo });
  }

  const genericServerError =
    serverError instanceof ApiRequestError && serverError.code !== 'validation_failed'
      ? t(`errors.${serverError.code}`)
      : null;

  return (
    <Form
      onSubmit={submit}
      className="flex max-w-3xl flex-col gap-5"
      aria-describedby={genericServerError ? formErrorId : undefined}
    >
      {genericServerError && (
        <p
          id={formErrorId}
          role="alert"
          className="rounded-md bg-red-soft px-3 py-2 text-sm text-red"
        >
          {genericServerError}
        </p>
      )}

      <FieldGroup title={t('vehicle.sections.identity')}>
        <SelectField
          label={t('vehicle.fields.category')}
          value={state.category}
          onChange={(c) => {
            set('category')(c);
            // New dirt bikes, ATVs and sleds usually log engine hours.
            if (
              !vehicle &&
              ['dirtbike', 'atv', 'snowmobile'].includes(c) &&
              state.odometerUnit !== 'hr'
            )
              set('odometerUnit')('hr');
            if (
              !vehicle &&
              !['dirtbike', 'atv', 'snowmobile'].includes(c) &&
              state.odometerUnit === 'hr'
            )
              set('odometerUnit')(defaultUnits === 'metric' ? 'km' : 'mi');
            if (!vehicle && c === 'semi' && state.fuelType === 'gasoline')
              set('fuelType')('diesel');
          }}
          options={VEHICLE_CATEGORIES.map((c) => ({
            value: c,
            label: t(`vehicle.categories.${c}`),
          }))}
        />
        {isCommercial(state.category) ? (
          <TextField
            label={t('vehicle.fields.unitNumber')}
            value={state.unitNumber}
            onChange={set('unitNumber')}
            error={errors.unitNumber}
            inputClassName="font-mono"
            autoComplete="off"
          />
        ) : (
          <div className="hidden sm:block" />
        )}
        <TextField
          label={t('vehicle.fields.year')}
          value={state.year}
          onChange={set('year')}
          inputMode="numeric"
          inputClassName="font-mono tabular-nums"
          error={errors.year}
          isRequired
          autoFocus={!vehicle}
        />
        <TextField
          label={t('vehicle.fields.make')}
          value={state.make}
          onChange={set('make')}
          error={errors.make}
          isRequired
        />
        <TextField
          label={t('vehicle.fields.model')}
          value={state.model}
          onChange={set('model')}
          error={errors.model}
          isRequired
        />
        <TextField
          label={t('vehicle.fields.trim')}
          value={state.trim}
          onChange={set('trim')}
          error={errors.trim}
        />
        <TextField
          label={t('vehicle.fields.nickname')}
          description={t('vehicle.hints.nickname')}
          value={state.nickname}
          onChange={set('nickname')}
          error={errors.nickname}
        />
        <TextField
          label={t('vehicle.fields.color')}
          value={state.color}
          onChange={set('color')}
          error={errors.color}
        />
        <TextField
          label={t('vehicle.fields.vin')}
          value={state.vin}
          onChange={set('vin')}
          error={errors.vin}
          inputClassName="font-mono uppercase"
          autoComplete="off"
        />
        <TextField
          label={t('vehicle.fields.licensePlate')}
          value={state.licensePlate}
          onChange={set('licensePlate')}
          error={errors.licensePlate}
          inputClassName="font-mono uppercase"
          autoComplete="off"
        />
      </FieldGroup>

      <FieldGroup title={t('vehicle.sections.units')}>
        <SelectField
          label={t('vehicle.fields.fuelType')}
          value={state.fuelType}
          onChange={(f) => {
            set('fuelType')(f);
            if (f === 'electric' && state.fuelUnit !== 'kwh') set('fuelUnit')('kwh');
            if (f !== 'electric' && state.fuelUnit === 'kwh')
              set('fuelUnit')(defaultUnits === 'metric' ? 'l' : 'gal_us');
          }}
          options={FUEL_TYPES.map((v) => ({ value: v, label: t(`vehicle.fuelType.${v}`) }))}
        />
        <div className="hidden sm:block" />
        <SelectField
          label={t('vehicle.fields.odometerUnit')}
          value={state.odometerUnit}
          onChange={set('odometerUnit')}
          options={ODOMETER_UNITS.map((v) => ({ value: v, label: t(`units.odometer.${v}`) }))}
          description={
            sectionOf(state.category) === 'powersports' && state.category !== 'motorcycle'
              ? t('vehicle.hints.hours')
              : t('vehicle.hints.units')
          }
        />
        <SelectField
          label={t('vehicle.fields.fuelUnit')}
          value={state.fuelUnit}
          onChange={set('fuelUnit')}
          options={FUEL_UNITS.map((v) => ({ value: v, label: t(`units.fuel.${v}`) }))}
        />
      </FieldGroup>

      <FieldGroup title={t('vehicle.sections.purchase')}>
        <TextField
          label={t('vehicle.fields.purchaseDate')}
          type="date"
          value={state.purchaseDate}
          onChange={set('purchaseDate')}
          inputClassName="font-mono"
          error={errors.purchaseDate}
        />
        <TextField
          label={t('vehicle.fields.purchasePrice')}
          description={t('vehicle.hints.purchasePrice')}
          value={state.purchasePrice}
          onChange={set('purchasePrice')}
          inputMode="decimal"
          error={errors.purchasePrice}
          inputClassName="font-mono tabular-nums"
        />
      </FieldGroup>

      <fieldset className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6">
        <legend className="px-1 text-heading font-semibold">{t('vehicle.sections.photo')}</legend>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-sunken">
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-caption text-ink-muted">
                {photoBusy ? t('vehicle.photo.processing') : t('vehicle.photo.none')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <FileTrigger
              acceptedFileTypes={['image/jpeg', 'image/png', 'image/webp', 'image/heic']}
              onSelect={pickPhoto}
            >
              <Button isDisabled={photoBusy}>
                <Icon name="attachment" size={16} />
                {preview ? t('vehicle.photo.replace') : t('vehicle.photo.choose')}
              </Button>
            </FileTrigger>
            {preview && (
              <Button
                variant="ghost"
                onPress={() => {
                  setPhoto({ kind: 'remove' });
                  setPreview(null);
                }}
              >
                {t('vehicle.photo.remove')}
              </Button>
            )}
          </div>
        </div>
        {photoError && (
          <p role="alert" className="mt-2 text-caption font-semibold text-red">
            {photoError}
          </p>
        )}
      </fieldset>

      <TextAreaField
        label={t('vehicle.fields.notes')}
        value={state.notes}
        onChange={set('notes')}
        error={errors.notes}
      />

      <div className="sticky bottom-16 z-10 -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button
          type="submit"
          variant="primary"
          isDisabled={isPending || photoBusy}
          className="flex-1 md:flex-none"
        >
          {isPending ? t('actions.saving') : vehicle ? t('actions.save') : t('actions.create')}
        </Button>
        <Button onPress={onCancel} className="flex-1 md:flex-none">
          {t('actions.cancel')}
        </Button>
      </div>
    </Form>
  );
}
