import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { odometerQuery, useAddReading, useDeleteReading } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { Button } from '../../../components/ui/Button';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { TextField } from '../../../components/ui/fields';
import { useFormat } from '../../../lib/format';
import { todayIso } from '../../../lib/today';

export const Route = createFileRoute('/vehicles/$vehicleId/odometer')({ component: OdometerTab });

function OdometerTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const readings = useQuery(odometerQuery(id)).data ?? [];
  const add = useAddReading(id);
  const del = useDeleteReading();
  const [date, setDate] = useState(todayIso);
  const [odo, setOdo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [warning, setWarning] = useState(false);
  if (!v) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(odo.replace(/[^\d]/g, ''));
    if (!odo.trim() || !Number.isFinite(value)) {
      setError(t('validation.required'));
      return;
    }
    // A lower reading than an earlier date is saved, but flagged as a likely typo.
    setWarning(readings.some((r) => r.date <= date && r.odometer > value));
    add.mutate(
      { date, odometer: value, notes: note || null },
      {
        onSuccess: () => {
          setOdo('');
          setNote('');
        },
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {v.access !== 'view' && (
        <section className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6 lg:order-2">
          <h2 className="mb-3 text-heading font-semibold">{t('odometer.add')}</h2>
          <Form onSubmit={submit} className="flex flex-col gap-3">
            <ErrorNote error={add.error} />
            <TextField
              label={t('odometer.date')}
              type="date"
              value={date}
              onChange={setDate}
              inputClassName="font-mono"
            />
            <TextField
              label={t('odometer.reading', { unit: v.odometerUnit })}
              value={odo}
              onChange={(x) => {
                setOdo(x);
                setError(undefined);
              }}
              inputMode="numeric"
              error={error}
              inputClassName="font-mono"
              isRequired
            />
            <TextField label={t('odometer.notes')} value={note} onChange={setNote} />
            {warning && (
              <p
                role="status"
                className="rounded-md bg-yellow-soft px-3 py-2 text-caption text-yellow"
              >
                {t('odometer.lowerWarning')}
              </p>
            )}
            <Button type="submit" variant="primary" isDisabled={add.isPending}>
              {t('odometer.add')}
            </Button>
          </Form>
        </section>
      )}
      <section className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6 lg:col-span-2">
        <h2 className="pt-4 text-heading font-semibold">{t('odometer.title')}</h2>
        {readings.length === 0 ? (
          <p className="py-8 text-center text-ink-muted">{t('odometer.empty')}</p>
        ) : (
          <ul>
            {readings.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
              >
                <span className="w-32 font-mono text-data tabular-nums">
                  {f.distance(r.odometer, v.odometerUnit)}
                </span>
                <span className="flex-1">
                  <span className="block font-mono text-caption text-ink-muted">
                    {f.date(r.date)}
                  </span>
                  {r.recordId ? (
                    <Link
                      to="/records/$recordId"
                      params={{ recordId: String(r.recordId) }}
                      className="text-caption text-orange-text hover:underline"
                    >
                      {r.recordTitle ?? t(`record.kinds.${r.recordKind ?? 'service'}`)}
                    </Link>
                  ) : (
                    <span className="text-caption text-ink-muted">
                      {r.notes ?? t('odometer.manual')}
                    </span>
                  )}
                </span>
                {!r.recordId && v.access !== 'view' && (
                  <Button
                    variant="ghost"
                    aria-label={t('odometer.delete')}
                    onPress={() => del.mutate(r.id)}
                  >
                    {t('actions.delete')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
