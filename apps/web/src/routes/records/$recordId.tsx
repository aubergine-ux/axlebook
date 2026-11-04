import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recordQuery, useDeleteRecord } from '../../api/resources';
import { vehicleQuery } from '../../api/vehicles';
import { PageHeader } from '../../components/PageHeader';
import { RecordForm } from '../../components/records/RecordForm';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { QueryState } from '../../components/ui/QueryState';

export const Route = createFileRoute('/records/$recordId')({ component: RecordPage });

function RecordPage() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().recordId);
  const navigate = useNavigate();
  const record = useQuery(recordQuery(id));
  const vehicle = useQuery({
    ...vehicleQuery(record.data?.vehicleId ?? 0),
    enabled: Boolean(record.data),
  });
  const del = useDeleteRecord();
  const [confirm, setConfirm] = useState(false);

  return (
    <QueryState query={record}>
      {(r) => {
        const v = vehicle.data;
        if (!v) return null;
        const vehicleId = String(v.id);
        const back = () => navigate({ to: '/vehicles/$vehicleId/records', params: { vehicleId } });
        return (
          <>
            <Link
              to="/vehicles/$vehicleId/records"
              params={{ vehicleId }}
              className="mb-3 inline-flex items-center gap-1 text-label text-ink-muted hover:text-ink"
            >
              <span aria-hidden>←</span>
              {v.nickname ?? `${v.year} ${v.make} ${v.model}`}
            </Link>
            <PageHeader
              title={t('record.editTitle')}
              actions={
                v.access !== 'view' && (
                  <Button variant="ghost" className="text-red" onPress={() => setConfirm(true)}>
                    {t('record.delete')}
                  </Button>
                )
              }
            />
            <RecordForm key={r.updatedAt} vehicle={v} record={r} onSaved={back} onCancel={back} />
            <ConfirmDialog
              isOpen={confirm}
              onOpenChange={setConfirm}
              title={t('record.deleteTitle')}
              confirmLabel={t('record.delete')}
              isPending={del.isPending}
              onConfirm={() => del.mutate(r.id, { onSuccess: back })}
            >
              {t('record.deleteBody')}
            </ConfirmDialog>
          </>
        );
      }}
    </QueryState>
  );
}
