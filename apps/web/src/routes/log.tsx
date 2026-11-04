import {
  divideMilli,
  fromMilli,
  multiplyMilli,
  type RecordInput,
  toMilli,
  type VehicleSummary,
  vehicleTitle,
} from '@axlebook/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ApiRequestError, api } from '../api/client';
import { vehiclesQuery } from '../api/vehicles';
import { PageHeader } from '../components/PageHeader';
import { CheckboxField } from '../components/records/RecordForm';
import { Button } from '../components/ui/Button';
import { ErrorNote } from '../components/ui/ErrorNote';
import { SelectField, TextField } from '../components/ui/fields';
import { useFormat } from '../lib/format';
import { enqueue } from '../lib/outbox';
import { todayIso } from '../lib/today';
import { useOutbox } from '../lib/useOutbox';
import { parseReading } from '../lib/validation';

export const Route = createFileRoute('/log')({
  validateSearch: z.object({ vehicle: z.coerce.number().int().optional() }),
  component: LogFuel,
});

const LAST_VEHICLE = 'axlebook.lastFuelVehicle';
const CACHE = 'axlebook.vehicleCache';
type Cached = Pick<
  VehicleSummary,
  | 'id'
  | 'year'
  | 'make'
  | 'model'
  | 'trim'
  | 'nickname'
  | 'odometerUnit'
  | 'fuelUnit'
  | 'currentOdometer'
  | 'access'
>;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the page still works online.
  }
};
const fmt = (m: number | null, d: number) =>
  m == null ? '' : String(Math.round(fromMilli(m) * 10 ** d) / 10 ** d);

/** The pump-side form: big targets, remembered vehicle, works offline. */
function LogFuel() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const live = useQuery(vehiclesQuery());
  const { entries, sync } = useOutbox();

  // Keep a small copy of the garage so the form still works with no signal.
  useEffect(() => {
    if (live.data) {
      write(
        CACHE,
        live.data.map(
          ({
            id,
            year,
            make,
            model,
            trim,
            nickname,
            odometerUnit,
            fuelUnit,
            currentOdometer,
            access,
          }) => ({
            id,
            year,
            make,
            model,
            trim,
            nickname,
            odometerUnit,
            fuelUnit,
            currentOdometer,
            access,
          }),
        ),
      );
    }
  }, [live.data]);
  const vehicles: Cached[] = (live.data ?? read<Cached[]>(CACHE, [])).filter(
    (v) => v.access !== 'view',
  );

  const [vehicleId, setVehicleId] = useState<number | null>(
    () => search.vehicle ?? read<number | null>(LAST_VEHICLE, null),
  );
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];
  const [s, setS] = useState({
    date: todayIso(),
    odometer: '',
    volume: '',
    price: '',
    total: '',
    isFull: true,
    missedPrevious: false,
  });
  const [order, setOrder] = useState<('volume' | 'price' | 'total')[]>(['volume', 'price']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<'saved' | 'offline' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const setFuel = (field: 'volume' | 'price' | 'total', value: string) => {
    const nextOrder = [field, ...order.filter((x) => x !== field)].slice(0, 2) as typeof order;
    setOrder(nextOrder);
    const next = { volume: s.volume, price: s.price, total: s.total, [field]: value };
    const derived = (['volume', 'price', 'total'] as const).find((x) => !nextOrder.includes(x));
    const v = toMilli(next.volume);
    const p = toMilli(next.price);
    const tot = toMilli(next.total);
    if (derived === 'total' && v && p) next.total = fmt(multiplyMilli(v, p), 2);
    if (derived === 'price' && v && tot != null) next.price = fmt(divideMilli(tot, v), 3);
    if (derived === 'volume' && p && tot != null) next.volume = fmt(divideMilli(tot, p), 3);
    setS((x) => ({ ...x, ...next }));
    setErrors({});
    setResult(null);
  };

  if (!vehicle) {
    return (
      <>
        <PageHeader title={t('fuel.quickTitle')} />
        <p className="text-ink-muted">
          {live.isPending ? t('common.loading') : t('fuel.noVehicles')}
        </p>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const odometer = parseReading(s.odometer);
    const volume = toMilli(s.volume);
    const price = s.price.trim() ? toMilli(s.price) : null;
    const total = s.total.trim() ? toMilli(s.total) : null;
    const errs: Record<string, string> = {};
    if (!s.odometer.trim() || !Number.isFinite(odometer)) errs.odometer = t('validation.required');
    if (!volume || volume <= 0) errs.volume = t('validation.required');
    if (s.price.trim() && price == null) errs.price = t('validation.money');
    if (s.total.trim() && total == null) errs.total = t('validation.money');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const clientId = crypto.randomUUID();
    const data: RecordInput = {
      kind: 'fuel',
      date: s.date,
      odometer,
      cost: total ?? 0,
      fuel: {
        volume: volume as number,
        pricePerUnit: price,
        isFull: s.isFull,
        missedPrevious: s.missedPrevious,
      },
      clientId,
    };
    write(LAST_VEHICLE, vehicle.id);
    setBusy(true);
    setError(null);
    try {
      await api(`/vehicles/${vehicle.id}/records`, { method: 'POST', body: JSON.stringify(data) });
      await qc.invalidateQueries();
      setResult('saved');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'network') {
        await enqueue({
          clientId,
          vehicleId: vehicle.id,
          vehicleName: vehicle.nickname ?? vehicleTitle(vehicle),
          data,
          createdAt: new Date().toISOString(),
        });
        setResult('offline');
      } else {
        setError(err);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setS((x) => ({
      ...x,
      odometer: '',
      volume: '',
      price: x.price,
      total: '',
      missedPrevious: false,
    }));
  };

  const unit = t(`units.fuelShort.${vehicle.fuelUnit}`);
  const pending = entries.filter((e) => !e.error).length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <PageHeader title={t('fuel.quickTitle')} />
      {pending > 0 && (
        <p
          role="status"
          className="flex items-center justify-between gap-2 rounded-md bg-yellow-soft px-3 py-2 text-caption font-semibold text-yellow"
        >
          {t('fuel.pending', { count: pending })}
          <Button variant="ghost" className="min-h-9" onPress={() => void sync()}>
            {t('fuel.syncNow')}
          </Button>
        </p>
      )}
      {result && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 ${result === 'saved' ? 'bg-surface-sunken' : 'bg-yellow-soft text-yellow'}`}
        >
          {result === 'saved' ? t('fuel.saved') : t('fuel.savedOffline')}{' '}
          {result === 'saved' && (
            <Link
              to="/vehicles/$vehicleId/fuel"
              params={{ vehicleId: String(vehicle.id) }}
              className="font-semibold text-orange-text underline-offset-2 hover:underline"
            >
              {t('vehicle.tabs.fuel')}
            </Link>
          )}
        </p>
      )}
      <ErrorNote error={error} />
      <Form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4 shadow-card"
      >
        {vehicles.length > 1 && (
          <SelectField
            label={t('fuel.vehicle')}
            value={String(vehicle.id)}
            onChange={(v) => setVehicleId(Number(v))}
            options={vehicles.map((v) => ({
              value: String(v.id),
              label: v.nickname ?? vehicleTitle(v),
            }))}
          />
        )}
        <TextField
          label={t('record.fields.odometer', { unit: vehicle.odometerUnit })}
          description={
            vehicle.currentOdometer != null
              ? t('fuel.lastReading', {
                  value: f.distance(vehicle.currentOdometer, vehicle.odometerUnit),
                })
              : undefined
          }
          value={s.odometer}
          onChange={(v) => {
            setS((x) => ({ ...x, odometer: v }));
            setErrors({});
          }}
          inputMode="numeric"
          error={errors.odometer}
          inputClassName="min-h-14 font-mono text-figure"
          isRequired
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('record.fields.volume', { unit })}
            value={s.volume}
            onChange={(v) => setFuel('volume', v)}
            inputMode="decimal"
            error={errors.volume}
            inputClassName="min-h-14 font-mono text-figure"
            isRequired
          />
          <TextField
            label={t('record.fields.pricePerUnit', { unit })}
            value={s.price}
            onChange={(v) => setFuel('price', v)}
            inputMode="decimal"
            error={errors.price}
            inputClassName="min-h-14 font-mono text-figure"
          />
        </div>
        <TextField
          label={t('record.fields.total')}
          description={t('record.hints.twoOfThree')}
          value={s.total}
          onChange={(v) => setFuel('total', v)}
          inputMode="decimal"
          error={errors.total}
          inputClassName="min-h-14 font-mono text-figure"
        />
        <CheckboxField
          label={t('record.fields.isFull')}
          isSelected={s.isFull}
          onChange={(v) => setS((x) => ({ ...x, isFull: v }))}
        />
        <CheckboxField
          label={t('record.fields.missedPrevious')}
          description={t('record.hints.missed')}
          isSelected={s.missedPrevious}
          onChange={(v) => setS((x) => ({ ...x, missedPrevious: v }))}
        />
        <TextField
          label={t('record.fields.date')}
          type="date"
          value={s.date}
          onChange={(v) => setS((x) => ({ ...x, date: v }))}
          inputClassName="font-mono"
        />
        <Button type="submit" variant="primary" className="min-h-14 text-heading" isDisabled={busy}>
          {busy ? t('actions.saving') : t('fuel.log')}
        </Button>
      </Form>
    </div>
  );
}
