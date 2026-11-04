import {
  fromMilli,
  PLAN_KINDS,
  PLAN_PRIORITIES,
  PLAN_STATUSES,
  type PlanItem,
  PlanItemInput,
  toMilli,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { planQuery, usePlanAction, useSavePlan } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { Icon } from '../../../components/Icon';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { FormDialog } from '../../../components/ui/FormDialog';
import { SelectField, TextAreaField, TextField } from '../../../components/ui/fields';
import { useFormat } from '../../../lib/format';
import { todayIso } from '../../../lib/today';
import { fieldErrors } from '../../../lib/validation';

export const Route = createFileRoute('/vehicles/$vehicleId/plan')({ component: PlanTab });

function PlanForm({
  vehicleId,
  item,
  onDone,
}: {
  vehicleId: number;
  item?: PlanItem;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSavePlan();
  const [s, setS] = useState({
    title: item?.title ?? '',
    description: item?.description ?? '',
    kind: item?.kind ?? 'service',
    priority: item?.priority ?? 'normal',
    status: item?.status ?? 'planned',
    estimatedCost: item?.estimatedCost != null ? String(fromMilli(item.estimatedCost)) : '',
    targetDate: item?.targetDate ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set =
    <K extends keyof typeof s>(k: K) =>
    (v: (typeof s)[K]) =>
      setS((p) => ({ ...p, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cost = s.estimatedCost.trim() ? toMilli(s.estimatedCost) : null;
    const data = { ...s, estimatedCost: cost, targetDate: s.targetDate || null };
    const parsed = PlanItemInput.safeParse(data);
    const errs = parsed.success ? {} : fieldErrors(parsed.error.issues, t);
    if (s.estimatedCost.trim() && cost == null) errs.estimatedCost = t('validation.money');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({ id: item?.id, vehicleId, data }, { onSuccess: onDone });
  };
  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      <ErrorNote error={save.error} />
      <TextField
        label={t('plan.fields.title')}
        value={s.title}
        onChange={set('title')}
        error={errors.title}
        isRequired
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t('plan.fields.kind')}
          value={s.kind}
          onChange={set('kind')}
          options={PLAN_KINDS.map((k) => ({ value: k, label: t(`record.kinds.${k}`) }))}
        />
        <SelectField
          label={t('plan.fields.priority')}
          value={s.priority}
          onChange={set('priority')}
          options={PLAN_PRIORITIES.map((k) => ({ value: k, label: t(`plan.priority.${k}`) }))}
        />
        <SelectField
          label={t('plan.fields.status')}
          value={s.status}
          onChange={set('status')}
          options={PLAN_STATUSES.map((k) => ({ value: k, label: t(`plan.status.${k}`) }))}
        />
        <TextField
          label={t('plan.fields.estimatedCost')}
          value={s.estimatedCost}
          onChange={set('estimatedCost')}
          error={errors.estimatedCost}
          inputMode="decimal"
          inputClassName="font-mono"
        />
        <TextField
          label={t('plan.fields.targetDate')}
          type="date"
          value={s.targetDate}
          onChange={set('targetDate')}
          inputClassName="font-mono"
        />
      </div>
      <TextAreaField
        label={t('plan.fields.description')}
        value={s.description}
        onChange={set('description')}
        rows={3}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={save.isPending}>
          {t('plan.save')}
        </Button>
        <Button onPress={onDone}>{t('actions.cancel')}</Button>
      </div>
    </Form>
  );
}

function PlanTab() {
  const { t } = useTranslation();
  const f = useFormat();
  const id = Number(Route.useParams().vehicleId);
  const v = useQuery(vehicleQuery(id)).data;
  const items = useQuery(planQuery(id)).data ?? [];
  const action = usePlanAction();
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null);
  const [converting, setConverting] = useState<PlanItem | null>(null);
  const [deleting, setDeleting] = useState<PlanItem | null>(null);
  const [conv, setConv] = useState({ date: todayIso(), odometer: '', cost: '' });
  if (!v) return null;
  const canEdit = v.access !== 'view';
  const order = { in_progress: 0, planned: 1, backlog: 2, done: 3 } as const;
  const sorted = [...items].sort(
    (a, b) =>
      order[a.status] - order[b.status] || (a.targetDate ?? '9').localeCompare(b.targetDate ?? '9'),
  );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div>
          <Button variant="primary" onPress={() => setEditing('new')}>
            <Icon name="add" size={16} />
            {t('plan.add')}
          </Button>
        </div>
      )}
      <section className="rounded-lg border border-line bg-surface-raised px-4 shadow-card md:px-6">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-ink-muted">{t('plan.empty')}</p>
        ) : (
          <ul>
            {sorted.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${item.status === 'done' ? 'text-ink-muted line-through' : ''}`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-2 text-caption text-ink-muted">
                    <span className="rounded-full bg-surface-sunken px-2">
                      {t(`plan.status.${item.status}`)}
                    </span>
                    {item.priority === 'high' && (
                      <span className="rounded-full bg-red-soft px-2 font-semibold text-red">
                        {t('plan.priority.high')}
                      </span>
                    )}
                    <span>{t(`record.kinds.${item.kind}`)}</span>
                    {item.estimatedCost != null && (
                      <span className="font-mono">{f.money(item.estimatedCost)}</span>
                    )}
                    {item.targetDate && (
                      <span className="font-mono">{f.date(item.targetDate)}</span>
                    )}
                  </p>
                  {item.description && <p className="mt-1 text-caption">{item.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {item.convertedRecordId ? (
                      <Link
                        to="/records/$recordId"
                        params={{ recordId: String(item.convertedRecordId) }}
                        className="self-center text-label text-orange-text hover:underline"
                      >
                        {t('plan.converted')}
                      </Link>
                    ) : (
                      <Button
                        onPress={() => {
                          setConv({
                            date: todayIso(),
                            odometer: '',
                            cost:
                              item.estimatedCost != null
                                ? String(fromMilli(item.estimatedCost))
                                : '',
                          });
                          setConverting(item);
                        }}
                      >
                        {t('plan.convert')}
                      </Button>
                    )}
                    <Button variant="ghost" onPress={() => setEditing(item)}>
                      {t('plan.edit')}
                    </Button>
                    <Button variant="ghost" onPress={() => setDeleting(item)}>
                      {t('actions.delete')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? t('plan.add') : t('plan.edit')}
      >
        {editing !== null && (
          <PlanForm
            vehicleId={id}
            item={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
      <ConfirmDialog
        isOpen={converting !== null}
        onOpenChange={(o) => !o && setConverting(null)}
        title={t('plan.convertTitle', { title: converting?.title ?? '' })}
        confirmLabel={t('plan.convertConfirm')}
        confirmVariant="primary"
        isPending={action.isPending}
        onConfirm={() =>
          converting &&
          action.mutate(
            {
              id: converting.id,
              convert: {
                date: conv.date,
                odometer: conv.odometer.trim() ? Number(conv.odometer.replace(/\D/g, '')) : null,
                cost: conv.cost.trim() ? (toMilli(conv.cost) ?? undefined) : undefined,
              },
            },
            { onSuccess: () => setConverting(null) },
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label={t('record.fields.date')}
            type="date"
            value={conv.date}
            onChange={(d) => setConv((c) => ({ ...c, date: d }))}
            inputClassName="font-mono"
          />
          <TextField
            label={t('record.fields.odometer', { unit: v.odometerUnit })}
            value={conv.odometer}
            onChange={(o) => setConv((c) => ({ ...c, odometer: o }))}
            inputMode="numeric"
            inputClassName="font-mono"
          />
          <TextField
            label={t('record.fields.cost')}
            value={conv.cost}
            onChange={(o) => setConv((c) => ({ ...c, cost: o }))}
            inputMode="decimal"
            inputClassName="font-mono"
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('plan.deleteTitle')}
        confirmLabel={t('plan.delete')}
        onConfirm={() =>
          deleting && action.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
        }
      >
        {deleting?.title}
      </ConfirmDialog>
    </div>
  );
}
