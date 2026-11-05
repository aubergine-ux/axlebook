import { type AskAnswer, fromMilli, type RecordDraft, vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { FileTrigger, Form } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { aiStatusQuery, useAskLogbook, useQuickEntry, useScanReceipt } from '../api/extras';
import { vehiclesQuery } from '../api/vehicles';
import { PageHeader } from '../components/PageHeader';
import { RecordForm, type RecordPrefill } from '../components/records/RecordForm';
import { Button } from '../components/ui/Button';
import { SelectField, TextAreaField, TextField } from '../components/ui/fields';
import { useFormat } from '../lib/format';
import { toJpeg } from '../lib/image';
import { useMe } from '../lib/useMe';

export const Route = createFileRoute('/assistant')({ component: AssistantPage });

const NONE = '';
const fmt = (m: number | null, digits = 3) =>
  m == null ? undefined : String(Math.round(fromMilli(m) * 10 ** digits) / 10 ** digits);

/** A draft from the model as the values a person would have typed into the form. */
export function draftToPrefill(d: RecordDraft): RecordPrefill {
  return {
    date: d.date ?? undefined,
    odometer: d.odometer != null ? String(d.odometer) : undefined,
    title: d.title ?? undefined,
    notes: d.notes ?? undefined,
    station: d.station ?? undefined,
    ...(d.kind === 'fuel'
      ? { volume: fmt(d.volume), price: fmt(d.pricePerUnit), total: fmt(d.cost, 2) }
      : { cost: fmt(d.cost, 2) }),
  };
}

/** Why the assistant couldn't help, in words (the form still opens, empty). */
function failure(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return 'unreadable';
  if (err.code === 'unsupported_file') return 'unsupported';
  const reason = (err.params as { reason?: string } | undefined)?.reason;
  return err.code === 'ai_failed' && reason ? reason : err.code === 'ai_disabled' ? 'off' : 'error';
}

interface Review {
  draft: RecordDraft | null;
  files: File[];
  problem: string | null;
}

function AssistantPage() {
  const { t } = useTranslation();
  const me = useMe();
  const status = useQuery(aiStatusQuery).data;
  const vehicles = useQuery(vehiclesQuery()).data ?? [];
  const editable = me?.role === 'viewer' ? [] : vehicles.filter((v) => v.access !== 'view');
  const [review, setReview] = useState<Review | null>(null);

  if (status && !status.enabled)
    return (
      <div className="flex max-w-3xl flex-col gap-5">
        <PageHeader title={t('assistant.title')} />
        <p className="rounded-lg border border-line bg-surface-raised p-5 text-ink-muted">
          {t('assistant.off')}
          {me?.role === 'admin' && (
            <>
              {' '}
              <Link to="/settings" hash="ai" className="text-orange-text underline">
                {t('assistant.offSettings')}
              </Link>
            </>
          )}
        </p>
      </div>
    );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('assistant.title')} />
      <p className="text-ink-muted">{t('assistant.intro')}</p>
      {review ? (
        <ReviewDraft review={review} vehicles={editable} onClose={() => setReview(null)} />
      ) : (
        editable.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <ReceiptCard
              vehicles={editable}
              canRead={status?.vision ?? false}
              onDraft={setReview}
            />
            <SentenceCard vehicles={editable} onDraft={setReview} />
          </div>
        )
      )}
      <AskCard />
    </div>
  );
}

type Garage = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  nickname: string | null;
}[];
const label = (v: Garage[number]) => v.nickname ?? vehicleTitle(v);

function VehiclePicker({
  vehicles,
  value,
  onChange,
  allowLater,
}: {
  vehicles: Garage;
  value: string;
  onChange: (v: string) => void;
  allowLater?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SelectField
      label={t('assistant.vehicle')}
      value={value}
      onChange={onChange}
      options={[
        ...(allowLater ? [{ value: NONE, label: t('assistant.vehicleFromText') }] : []),
        ...vehicles.map((v) => ({ value: String(v.id), label: label(v) })),
      ]}
    />
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-5">
      <h2 className="text-heading font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ReceiptCard({
  vehicles,
  canRead,
  onDraft,
}: {
  vehicles: Garage;
  canRead: boolean;
  onDraft: (r: Review) => void;
}) {
  const { t } = useTranslation();
  const scan = useScanReceipt();
  const [vehicle, setVehicle] = useState(String(vehicles[0]?.id ?? ''));

  async function read(file: File) {
    const vehicleId = vehicle ? Number(vehicle) : null;
    try {
      const image = await toJpeg(file);
      const draft = await scan.mutateAsync({ image, vehicleId });
      onDraft({
        draft: { ...draft, vehicleId: draft.vehicleId ?? vehicleId },
        files: [file],
        problem: null,
      });
    } catch (err) {
      const fallback = { vehicleId, kind: 'fuel' as const } as RecordDraft;
      onDraft({ draft: fallback, files: [file], problem: failure(err) });
    }
  }

  return (
    <Card title={t('assistant.receipt')}>
      <p className="text-caption text-ink-muted">{t('assistant.receiptHint')}</p>
      <VehiclePicker vehicles={vehicles} value={vehicle} onChange={setVehicle} />
      {canRead ? (
        <FileTrigger
          acceptedFileTypes={['image/*']}
          defaultCamera="environment"
          onSelect={(files) => {
            const f = files?.[0];
            if (f) void read(f);
          }}
        >
          <Button variant="primary" isDisabled={scan.isPending} className="self-start">
            {scan.isPending ? t('assistant.reading') : t('assistant.scan')}
          </Button>
        </FileTrigger>
      ) : (
        <p className="text-caption text-ink-muted">{t('assistant.noVision')}</p>
      )}
    </Card>
  );
}

function SentenceCard({ vehicles, onDraft }: { vehicles: Garage; onDraft: (r: Review) => void }) {
  const { t } = useTranslation();
  const entry = useQuickEntry();
  const [text, setText] = useState('');
  const [vehicle, setVehicle] = useState(NONE);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3) return;
    const vehicleId = vehicle ? Number(vehicle) : null;
    try {
      const draft = await entry.mutateAsync({ text: text.trim(), vehicleId });
      onDraft({ draft, files: [], problem: null });
    } catch (err) {
      onDraft({
        draft: { vehicleId, kind: 'service' } as RecordDraft,
        files: [],
        problem: failure(err),
      });
    }
  }

  return (
    <Card title={t('assistant.sentence')}>
      <Form onSubmit={submit} className="flex flex-col gap-3">
        <TextAreaField
          label={t('assistant.sentenceLabel')}
          description={t('assistant.sentenceHint')}
          value={text}
          onChange={setText}
          rows={3}
          maxLength={500}
        />
        <VehiclePicker vehicles={vehicles} value={vehicle} onChange={setVehicle} allowLater />
        <Button
          type="submit"
          isDisabled={entry.isPending || text.trim().length < 3}
          className="self-start"
        >
          {entry.isPending ? t('assistant.reading') : t('assistant.fill')}
        </Button>
      </Form>
    </Card>
  );
}

function ReviewDraft({
  review,
  vehicles,
  onClose,
}: {
  review: Review;
  vehicles: (Garage[number] & Parameters<typeof RecordForm>[0]['vehicle'])[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(String(review.draft?.vehicleId ?? ''));
  const chosen = vehicles.find((v) => String(v.id) === vehicle);
  const prefill = review.draft && !review.problem ? draftToPrefill(review.draft) : undefined;

  return (
    <section aria-labelledby="review-h" className="flex flex-col gap-4">
      <h2 id="review-h" className="text-title font-semibold">
        {t('assistant.review')}
      </h2>
      <p
        role="status"
        className={
          review.problem ? 'rounded-md bg-yellow-soft px-3 py-2 text-yellow' : 'text-ink-muted'
        }
      >
        {review.problem
          ? t(`assistant.problems.${review.problem}` as 'assistant.problems.error')
          : t('assistant.reviewHint')}
      </p>
      {!review.draft?.vehicleId && (
        <SelectField
          label={t('assistant.vehicle')}
          value={vehicle}
          onChange={setVehicle}
          options={[
            { value: '', label: t('assistant.chooseVehicle') },
            ...vehicles.map((v) => ({ value: String(v.id), label: label(v) })),
          ]}
          className="max-w-sm"
        />
      )}
      {chosen ? (
        <RecordForm
          key={chosen.id}
          vehicle={chosen}
          initialKind={review.draft?.kind ?? 'fuel'}
          prefill={prefill}
          initialFiles={review.files}
          onSaved={(r) =>
            navigate({ to: '/records/$recordId', params: { recordId: String(r.id) } })
          }
          onCancel={onClose}
        />
      ) : (
        <Button className="self-start" onPress={onClose}>
          {t('actions.cancel')}
        </Button>
      )}
    </section>
  );
}

function AskCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const ask = useAskLogbook();
  const [question, setQuestion] = useState('');
  const answer: AskAnswer | undefined = ask.data;

  return (
    <Card title={t('assistant.ask')}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 3) ask.mutate(question.trim());
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <TextField
          label={t('assistant.question')}
          description={t('assistant.questionHint')}
          value={question}
          onChange={setQuestion}
          maxLength={500}
          className="flex-1"
        />
        <Button type="submit" isDisabled={ask.isPending || question.trim().length < 3}>
          {ask.isPending ? t('assistant.thinking') : t('assistant.askButton')}
        </Button>
      </Form>
      {ask.isError && (
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
          {t(`assistant.problems.${failure(ask.error)}` as 'assistant.problems.error')}
        </p>
      )}
      {answer && (
        <div role="status" className="flex flex-col gap-2 border-t border-line pt-3">
          <p>{answer.found && answer.answer ? answer.answer : t('assistant.notFound')}</p>
          {answer.sources.length > 0 && (
            <>
              <p className="text-caption text-ink-muted">{t('assistant.sources')}</p>
              <ul className="flex flex-col gap-1">
                {answer.sources.map((s) => (
                  <li key={s.recordId}>
                    <Link
                      to="/records/$recordId"
                      params={{ recordId: String(s.recordId) }}
                      className="text-orange-text underline"
                    >
                      <span className="font-mono">{f.date(s.date)}</span> · {s.vehicle} ·{' '}
                      {s.title ?? t(`record.kinds.${s.kind}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {answer.reminders.length > 0 && (
            <ul className="flex flex-col gap-1">
              {answer.reminders.map((r) => (
                <li key={r.reminderId}>
                  <Link
                    to="/vehicles/$vehicleId/reminders"
                    params={{ vehicleId: String(r.vehicleId) }}
                    className="text-orange-text underline"
                  >
                    {r.vehicle} · {r.title}
                    {r.dueDate && (
                      <>
                        {' · '}
                        <span className="font-mono">{f.date(r.dueDate)}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-ink-muted">
            {t('assistant.answeredBy', { model: answer.model })}
          </p>
        </div>
      )}
    </Card>
  );
}
