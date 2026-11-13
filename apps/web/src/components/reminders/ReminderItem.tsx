import type { Reminder } from '@axlebook/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReminderAction } from '../../api/resources';
import { useFormat } from '../../lib/format';
import { todayIso } from '../../lib/today';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TextField } from '../ui/fields';
import { StatusBadge } from '../ui/StatusBadge';

/** "312 mi overdue", "in 12 days", "Due Mar 1, 2027": what's left, in words. */
export function useDueText() {
  const { t } = useTranslation();
  const f = useFormat();
  return (r: Reminder): string => {
    const parts: string[] = [];
    if (r.distanceLeft != null) {
      const d = f.distance(Math.abs(r.distanceLeft), r.odometerUnit);
      parts.push(
        r.distanceLeft < 0
          ? t('reminder.distanceOver', { distance: d })
          : t('reminder.distanceLeft', { distance: d }),
      );
    } else if (r.dueOdometer != null) {
      parts.push(t('reminder.dueAt', { odometer: f.distance(r.dueOdometer, r.odometerUnit) }));
    }
    if (r.daysLeft != null) {
      if (r.daysLeft === 0) parts.push(t('reminder.dueToday'));
      else if (r.daysLeft < 0) parts.push(t('reminder.daysOver', { count: -r.daysLeft }));
      else if (r.status === 'due_soon' || r.status === 'overdue')
        parts.push(t('reminder.daysLeft', { count: r.daysLeft }));
      else if (r.dueDate) parts.push(t('reminder.dueOn', { date: f.date(r.dueDate) }));
    }
    // Distance reminders also say when that's likely to be, from how much the vehicle is driven.
    if (r.predictedBy === 'distance' && r.predictedDueDate && (r.distanceLeft ?? 0) > 0)
      parts.push(
        r.distancePerDay != null
          ? t('reminder.expected', {
              date: f.date(r.predictedDueDate),
              pace: f.distance(Math.round(r.distancePerDay), r.odometerUnit),
            })
          : t('reminder.dueOn', { date: f.date(r.predictedDueDate) }),
      );
    return parts.join(' · ');
  };
}

export function ReminderItem({
  reminder: r,
  showVehicle,
  onEdit,
}: {
  reminder: Reminder;
  showVehicle?: boolean;
  onEdit?: (r: Reminder) => void;
}) {
  const { t } = useTranslation();
  const due = useDueText();
  const action = useReminderAction();
  const [done, setDone] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [odo, setOdo] = useState('');
  const badge = r.status === 'inactive' ? 'upcoming' : r.status;

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {r.title}
          {showVehicle && (
            <Link
              to="/vehicles/$vehicleId/reminders"
              params={{ vehicleId: String(r.vehicleId) }}
              className="ml-2 text-caption font-normal text-ink-muted underline-offset-2 hover:underline"
            >
              {r.vehicleTitle}
            </Link>
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={badge}>{t(`reminder.status.${r.status}`)}</StatusBadge>
          <span className="font-mono text-caption text-ink-muted">{due(r)}</span>
          {(r.intervalMonths || r.intervalDistance) && (
            <span className="text-caption text-ink-muted">{t('reminder.repeats')}</span>
          )}
        </p>
      </div>
      {r.canEdit && (
        <div className="flex flex-wrap gap-2">
          {!r.archivedAt && <Button onPress={() => setDone(true)}>{t('reminder.markDone')}</Button>}
          {onEdit && (
            <Button variant="ghost" onPress={() => onEdit(r)}>
              {t('actions.edit')}
            </Button>
          )}
          <Button
            variant="ghost"
            isDisabled={action.isPending}
            onPress={() =>
              action.mutate({ id: r.id, action: r.archivedAt ? 'unarchive' : 'archive' })
            }
          >
            {r.archivedAt ? t('reminder.unarchive') : t('reminder.archive')}
          </Button>
        </div>
      )}
      <ConfirmDialog
        isOpen={done}
        onOpenChange={setDone}
        title={t('reminder.doneTitle', { title: r.title })}
        confirmLabel={t('reminder.doneConfirm')}
        confirmVariant="primary"
        isPending={action.isPending}
        onConfirm={() =>
          action.mutate(
            {
              id: r.id,
              action: 'complete',
              body: { date, odometer: odo.trim() ? Number(odo.replace(/\D/g, '')) : null },
            },
            { onSuccess: () => setDone(false) },
          )
        }
      >
        <p className="mb-3">{t('reminder.doneBody')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('record.fields.date')}
            type="date"
            value={date}
            onChange={setDate}
            inputClassName="font-mono"
          />
          <TextField
            label={t('record.fields.odometer', { unit: r.odometerUnit })}
            value={odo}
            onChange={setOdo}
            inputMode="numeric"
            inputClassName="font-mono"
          />
        </div>
      </ConfirmDialog>
    </li>
  );
}
