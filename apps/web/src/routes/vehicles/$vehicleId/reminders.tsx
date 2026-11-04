import type { Reminder } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Switch } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { vehicleRemindersQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { ReminderForm } from '../../../components/reminders/ReminderForm';
import { ReminderItem } from '../../../components/reminders/ReminderItem';
import { Button } from '../../../components/ui/Button';
import { FormDialog } from '../../../components/ui/FormDialog';

export const Route = createFileRoute('/vehicles/$vehicleId/reminders')({ component: RemindersTab });

export function ToggleSwitch({
  label,
  isSelected,
  onChange,
}: {
  label: string;
  isSelected: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch
      isSelected={isSelected}
      onChange={onChange}
      className="group flex cursor-pointer items-center gap-2 text-label text-ink-muted"
    >
      <span className="flex h-6 w-10 items-center rounded-full border border-line-strong bg-surface-sunken px-0.5 transition-colors group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink">
        <span className="h-4.5 w-4.5 rounded-full bg-surface-raised shadow transition-transform group-data-[selected]:translate-x-4" />
      </span>
      {label}
    </Switch>
  );
}

function RemindersTab() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const [archived, setArchived] = useState(false);
  const list = useQuery(vehicleRemindersQuery(id, archived)).data;
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  if (!v) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {v.access !== 'view' ? (
          <Button variant="primary" onPress={() => setEditing('new')}>
            <Icon name="add" size={16} />
            {t('reminder.add')}
          </Button>
        ) : (
          <span />
        )}
        <ToggleSwitch
          label={t('reminder.showArchived')}
          isSelected={archived}
          onChange={setArchived}
        />
      </div>
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
