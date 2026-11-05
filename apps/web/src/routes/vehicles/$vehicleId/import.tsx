import { decodeTextFile, RECORD_KINDS, type RecordKind } from '@axlebook/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../../api/client';
import { useImportCsv } from '../../../api/resources';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/ui/Button';
import { ErrorNote } from '../../../components/ui/ErrorNote';
import { SelectField } from '../../../components/ui/fields';

export const Route = createFileRoute('/vehicles/$vehicleId/import')({ component: ImportPage });

function ImportPage() {
  const { t } = useTranslation();
  const vehicleId = Route.useParams().vehicleId;
  const navigate = useNavigate();
  const run = useImportCsv(Number(vehicleId));
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [notText, setNotText] = useState(false);
  const [kind, setKind] = useState<RecordKind>('service');
  const [dateOrder, setDateOrder] = useState<'mdy' | 'dmy'>('mdy');
  const result = run.data;
  const body = (dryRun: boolean) => ({ csv: file?.text ?? '', kind, dateOrder, dryRun });
  const preview = () => file && run.mutate(body(true));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={t('import.title')} />
      <p className="text-ink-muted">{t('import.intro')}</p>
      <section className="grid gap-4 rounded-lg border border-line bg-surface-raised p-4 shadow-card sm:grid-cols-3 md:p-6">
        <div className="flex flex-col gap-1">
          <span className="text-label">{t('import.file')}</span>
          <FileTrigger
            acceptedFileTypes={['text/csv', '.csv']}
            onSelect={async (files) => {
              const f = files?.[0];
              run.reset();
              if (!f) return;
              const text = decodeTextFile(new Uint8Array(await f.arrayBuffer()));
              setNotText(text == null);
              setFile(text == null ? null : { name: f.name, text });
            }}
          >
            <Button>{file?.name ?? t('import.file')}</Button>
          </FileTrigger>
        </div>
        <SelectField
          label={t('import.kind')}
          description={t('import.kindHint')}
          value={kind}
          onChange={setKind}
          options={RECORD_KINDS.map((k) => ({ value: k, label: t(`record.kinds.${k}`) }))}
        />
        <SelectField
          label={t('import.dateOrder')}
          value={dateOrder}
          onChange={setDateOrder}
          options={(['mdy', 'dmy'] as const).map((d) => ({
            value: d,
            label: t(`import.dateOrders.${d}`),
          }))}
        />
      </section>
      <ErrorNote error={notText ? new ApiRequestError(415, 'unsupported_file') : run.error} />
      <div className="flex gap-2">
        <Button isDisabled={!file || run.isPending} onPress={preview}>
          {t('import.preview')}
        </Button>
        {result?.dryRun && result.preview.length > 0 && (
          <Button
            variant="primary"
            isDisabled={run.isPending}
            onPress={() => run.mutate(body(false))}
          >
            {t('import.run', { count: result.total - result.errors.length - result.skipped })}
          </Button>
        )}
      </div>
      {result && (
        <section
          className="rounded-lg border border-line bg-surface-raised p-4 shadow-card md:p-6"
          aria-live="polite"
        >
          <p className="text-caption text-ink-muted">
            {t('import.format', { format: t(`import.formats.${result.detectedFormat}`) })}
          </p>
          <p className="mt-1 font-semibold">
            {t('import.result', {
              imported: result.dryRun ? 0 : result.imported,
              skipped: result.skipped,
              errors: result.errors.length,
            })}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-caption text-red">
              {result.errors.slice(0, 20).map((e) => (
                <li key={e.row}>{t('import.rowError', { row: e.row, message: e.message })}</li>
              ))}
            </ul>
          )}
          {!result.dryRun && (
            <Button
              className="mt-3"
              onPress={() =>
                navigate({ to: '/vehicles/$vehicleId/records', params: { vehicleId } })
              }
            >
              {t('vehicle.tabs.records')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
