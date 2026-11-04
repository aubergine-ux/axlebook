import type { Reminder } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { remindersQuery } from '../api/resources';
import { PageHeader } from '../components/PageHeader';
import { ReminderForm } from '../components/reminders/ReminderForm';
import { ReminderItem } from '../components/reminders/ReminderItem';
import { FormDialog } from '../components/ui/FormDialog';
import { QueryState } from '../components/ui/QueryState';

export const Route = createFileRoute('/reminders')({ component: RemindersPage });

const GROUPS = ['overdue', 'due_soon', 'upcoming'] as const;

function RemindersPage() {
  const { t } = useTranslation();
  const query = useQuery(remindersQuery());
  const [editing, setEditing] = useState<Reminder | null>(null);
  return (
    <>
      <PageHeader title={t('nav.reminders')} />
      <QueryState query={query}>
        {(list) =>
          list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
              {t('reminder.emptyAll')}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {GROUPS.map((g) => {
                const items = list.filter((r) => r.status === g);
                if (items.length === 0) return null;
                return (
                  <section
                    key={g}
                    aria-labelledby={`h-${g}`}
                    className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6"
                  >
                    <h2 id={`h-${g}`} className="pt-4 text-heading font-semibold">
                      {t(`reminder.status.${g}`)}{' '}
                      <span className="font-mono text-ink-muted">{items.length}</span>
                    </h2>
                    <ul>
                      {items.map((r) => (
                        <ReminderItem key={r.id} reminder={r} showVehicle onEdit={setEditing} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )
        }
      </QueryState>
      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t('reminder.editTitle')}
      >
        {editing && (
          <ReminderForm
            vehicle={{ id: editing.vehicleId, odometerUnit: editing.odometerUnit }}
            reminder={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
    </>
  );
}
