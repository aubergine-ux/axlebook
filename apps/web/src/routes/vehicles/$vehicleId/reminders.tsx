import type { Reminder } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { vehicleRemindersQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { ReminderForm } from '../../../components/reminders/ReminderForm';
import { ReminderItem } from '../../../components/reminders/ReminderItem';
import { ScheduleDialog } from '../../../components/reminders/ScheduleDialog';
import { Button } from '../../../components/ui/Button';
import { FormDialog } from '../../../components/ui/FormDialog';
import { ToggleSwitch } from '../../../components/ui/ToggleSwitch';

export const Route = createFileRoute('/vehicles/$vehicleId/reminders')({ component: RemindersTab });

function RemindersTab() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const [archived, setArchived] = useState(false);
  const list = useQuery(vehicleRemindersQuery(id, archived)).data;
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  if (!v) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {v.access !== 'view' ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onPress={() => setEditing('new')}>
              <Icon name="add" size={16} />
              {t('reminder.add')}
            </Button>
            <Button onPress={() => setScheduleOpen(true)}>
              <Icon name="service" size={16} />
              {t('schedule.suggest')}
            </Button>
          </div>
        ) : (
          <span />
        )}
        <ToggleSwitch
          label={t('reminder.showArchived')}
          isSelected={archived}
          onChange={setArchived}
        />
      </div>
      {added != null && (
        <p role="status" className="rounded-md bg-surface-sunken px-3 py-2">
          {t('schedule.added', { count: added })}
        </p>
      )}
      <section className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6">
        {list && list.length > 0 ? (
          <ul>
            {list.map((r) => (
              <ReminderItem key={r.id} reminder={r} onEdit={setEditing} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-ink-muted">{t('reminder.empty')}</p>
        )}
      </section>
      <ScheduleDialog
        vehicle={v}
        isOpen={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onAdded={(n) => {
          setAdded(n);
          setScheduleOpen(false);
        }}
      />
      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? t('reminder.newTitle') : t('reminder.editTitle')}
      >
        {editing !== null && (
          <ReminderForm
            vehicle={v}
            reminder={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
    </div>
  );
}
