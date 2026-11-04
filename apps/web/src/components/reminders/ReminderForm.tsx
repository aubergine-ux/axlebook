import {
  DUE_MODES,
  type DueMode,
  type Reminder,
  ReminderInput,
  type Vehicle,
} from '@axlebook/shared';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { useReminderAction, useSaveReminder } from '../../api/resources';
import { fieldErrors } from '../../lib/validation';
import { Segmented } from '../records/RecordForm';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';
import { TextAreaField, TextField } from '../ui/fields';

const num = (s: string) => (s.trim() ? Number(s.replace(/[^\d]/g, '')) : null);

export function ReminderForm({
  vehicle,
  reminder,
  onDone,
}: {
  vehicle: Pick<Vehicle, 'id' | 'odometerUnit'>;
  reminder?: Reminder;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveReminder();
  const action = useReminderAction();
  const unit = vehicle.odometerUnit;
  const [mode, setMode] = useState<DueMode>(reminder?.dueMode ?? 'either');
  const [s, setS] = useState({
    title: reminder?.title ?? '',
    notes: reminder?.notes ?? '',
    dueDate: reminder?.dueDate ?? '',
    dueOdometer: reminder?.dueOdometer != null ? String(reminder.dueOdometer) : '',
    intervalMonths: reminder?.intervalMonths != null ? String(reminder.intervalMonths) : '',
    intervalDistance: reminder?.intervalDistance != null ? String(reminder.intervalDistance) : '',
    soonDays: reminder ? String(reminder.soonDays) : '',
    soonDistance: reminder ? String(reminder.soonDistance) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof s) => (v: string) => {
    setS((p) => ({ ...p, [k]: v }));
    setErrors(({ [k]: _, ...rest }) => rest);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const data = {
      title: s.title,
      notes: s.notes,
      dueMode: mode,
      dueDate: mode === 'distance' ? null : s.dueDate || null,
      dueOdometer: mode === 'date' ? null : num(s.dueOdometer),
      intervalMonths: mode === 'distance' ? null : num(s.intervalMonths),
      intervalDistance: mode === 'date' ? null : num(s.intervalDistance),
      ...(s.soonDays.trim() && { soonDays: num(s.soonDays) as number }),
      ...(s.soonDistance.trim() && { soonDistance: num(s.soonDistance) as number }),
    };
    const parsed = ReminderInput.safeParse(data);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues, t));
      return;
    }
    save.mutate({ id: reminder?.id, vehicleId: vehicle.id, data }, { onSuccess: onDone });
  };

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={save.error} />
      <TextField
        label={t('reminder.fields.title')}
        value={s.title}
        onChange={set('title')}
        error={errors.title}
        isRequired
        autoFocus
      />
      <Segmented
        label={t('reminder.fields.dueMode')}
        value={mode}
        onChange={setMode}
        options={DUE_MODES.map((m) => ({ value: m, label: t(`reminder.modes.${m}`) }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {mode !== 'distance' && (
          <TextField
            label={t('reminder.fields.dueDate')}
            type="date"
            value={s.dueDate}
            onChange={set('dueDate')}
            error={errors.dueDate}
            inputClassName="font-mono"
          />
        )}
        {mode !== 'date' && (
          <TextField
            label={t('reminder.fields.dueOdometer', { unit })}
            value={s.dueOdometer}
            onChange={set('dueOdometer')}
            error={errors.dueOdometer}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        )}
        {mode !== 'distance' && (
          <TextField
            label={t('reminder.fields.intervalMonths')}
            description={t('reminder.repeatHint')}
            value={s.intervalMonths}
            onChange={set('intervalMonths')}
            error={errors.intervalMonths}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        )}
        {mode !== 'date' && (
          <TextField
            label={t('reminder.fields.intervalDistance', { unit })}
            description={t('reminder.repeatHint')}
            value={s.intervalDistance}
            onChange={set('intervalDistance')}
            error={errors.intervalDistance}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        )}
        {mode !== 'distance' && (
          <TextField
            label={t('reminder.fields.soonDays')}
            value={s.soonDays}
            onChange={set('soonDays')}
            error={errors.soonDays}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        )}
        {mode !== 'date' && (
          <TextField
            label={t('reminder.fields.soonDistance', { unit })}
            value={s.soonDistance}
            onChange={set('soonDistance')}
            error={errors.soonDistance}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        )}
      </div>
      <TextAreaField
        label={t('reminder.fields.notes')}
        value={s.notes}
        onChange={set('notes')}
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isDisabled={save.isPending}>
          {t('reminder.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
        {reminder && (
          <Button
            variant="ghost"
            className="ml-auto text-red"
            onPress={() =>
              action.mutate({ id: reminder.id, action: 'delete' }, { onSuccess: onDone })
            }
          >
            {t('reminder.delete')}
          </Button>
        )}
      </div>
    </Form>
  );
}
