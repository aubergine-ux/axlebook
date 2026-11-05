import { type ScheduleItem, type Vehicle, vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Checkbox } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import {
  aiStatusQuery,
  scheduleQuery,
  useApplySchedule,
  useTailorSchedule,
} from '../../api/extras';
import { useFormat } from '../../lib/format';
import { Button } from '../ui/Button';
import { ErrorNote } from '../ui/ErrorNote';
import { FormDialog } from '../ui/FormDialog';

/** The maintenance schedule for this kind of vehicle (or the AI-tailored one); pick items to turn into reminders. */
export function ScheduleDialog({
  vehicle,
  isOpen,
  onOpenChange,
  onAdded,
}: {
  vehicle: Vehicle;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (count: number) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const schedule = useQuery({ ...scheduleQuery(vehicle.id), enabled: isOpen });
  const ai = useQuery(aiStatusQuery).data;
  const tailor = useTailorSchedule(vehicle.id);
  const apply = useApplySchedule(vehicle.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const items = schedule.data?.items ?? [];

  // Everything without a reminder yet starts ticked.
  useEffect(() => {
    if (schedule.data)
      setPicked(new Set(schedule.data.items.filter((i) => !i.hasReminder).map((i) => i.title)));
  }, [schedule.data]);

  const interval = (i: ScheduleItem) => {
    const parts = [
      i.intervalMonths ? t('schedule.everyMonths', { count: i.intervalMonths }) : null,
      i.intervalDistance ? f.distance(i.intervalDistance, vehicle.odometerUnit) : null,
    ].filter(Boolean);
    return t('schedule.every', { interval: parts.join(` ${t('schedule.or')} `) });
  };
  const due = (i: ScheduleItem) =>
    [
      i.nextDueDate ? f.date(i.nextDueDate) : null,
      i.nextDueOdometer != null ? f.distance(i.nextDueOdometer, vehicle.odometerUnit) : null,
    ]
      .filter(Boolean)
      .join(' / ');

  const chosen = items.filter((i) => picked.has(i.title) && !i.hasReminder);
  const name = vehicle.nickname ?? vehicleTitle(vehicle);

  return (
    <FormDialog isOpen={isOpen} onOpenChange={onOpenChange} title={t('schedule.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">{t('schedule.intro')}</p>
        {schedule.data && (
          <p className="text-caption text-ink-muted">
            {schedule.data.source === 'ai'
              ? t('schedule.ai', { model: schedule.data.model })
              : t('schedule.builtIn', { category: t(`vehicle.categories.${vehicle.category}`) })}
            {schedule.data.basis && <span className="block">{schedule.data.basis}</span>}
          </p>
        )}
        {ai?.enabled && vehicle.access !== 'view' && (
          <div className="flex flex-col gap-2">
            <Button
              onPress={() => tailor.mutate()}
              isDisabled={tailor.isPending}
              className="self-start"
            >
              {tailor.isPending ? t('schedule.tailoring') : t('schedule.tailor', { name })}
            </Button>
            <ErrorNote error={tailor.error} />
          </div>
        )}
        <ErrorNote error={schedule.error} />
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {items.map((i) => (
            <li key={i.title} className="p-3">
              <Checkbox
                isSelected={i.hasReminder || picked.has(i.title)}
                isDisabled={i.hasReminder}
                onChange={(on) =>
                  setPicked((s) => {
                    const next = new Set(s);
                    if (on) next.add(i.title);
                    else next.delete(i.title);
                    return next;
                  })
                }
                className="group flex min-h-11 cursor-pointer items-start gap-3 data-[disabled]:cursor-default"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong bg-surface-raised group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="hidden h-3.5 w-3.5 fill-none stroke-surface-raised stroke-2 group-data-[selected]:block"
                  >
                    <path d="M3 8.5 6.5 12 13 4.5" />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{i.title}</span>
                  <span className="font-mono text-data text-ink-muted">{interval(i)}</span>
                  <span className="text-caption text-ink-muted">
                    {i.lastDone ? (
                      <span className="font-mono">
                        {t('schedule.lastDone', { date: f.date(i.lastDone.date) })}
                      </span>
                    ) : (
                      t('schedule.neverDone')
                    )}
                    {due(i) && (
                      <span className="ml-2 font-mono">
                        {t('schedule.nextDue', { due: due(i) })}
                      </span>
                    )}
                  </span>
                  {i.hasReminder && (
                    <span className="text-caption font-semibold">{t('schedule.hasReminder')}</span>
                  )}
                  {i.notes && <span className="text-caption text-ink-muted">{i.notes}</span>}
                </span>
              </Checkbox>
            </li>
          ))}
        </ul>
        <ErrorNote error={apply.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          {vehicle.access !== 'view' && (
            <Button
              variant="primary"
              isDisabled={chosen.length === 0 || apply.isPending}
              onPress={() =>
                apply.mutate(
                  chosen.map((i) => ({
                    title: i.title,
                    intervalMonths: i.intervalMonths,
                    intervalDistance: i.intervalDistance,
                    notes: i.notes,
                  })),
                  { onSuccess: (r) => onAdded(r.created) },
                )
              }
            >
              {t('schedule.add', { count: chosen.length })}
            </Button>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
