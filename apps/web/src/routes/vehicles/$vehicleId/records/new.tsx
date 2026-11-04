import { RECORD_KINDS } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { vehicleQuery } from '../../../../api/vehicles';
import { PageHeader } from '../../../../components/PageHeader';
import { RecordForm } from '../../../../components/records/RecordForm';

export const Route = createFileRoute('/vehicles/$vehicleId/records/new')({
  validateSearch: z.object({ kind: z.enum(RECORD_KINDS).optional() }),
  component: NewRecord,
});

function NewRecord() {
  const { t } = useTranslation();
  const vehicleId = Route.useParams().vehicleId;
  const { kind } = Route.useSearch();
  const navigate = useNavigate();
  const v = useQuery(vehicleQuery(Number(vehicleId))).data;
  if (!v) return null;
  const back = () => navigate({ to: '/vehicles/$vehicleId/records', params: { vehicleId } });
  return (
    <>
      <PageHeader title={t('record.newTitle')} />
      <RecordForm vehicle={v} initialKind={kind} onSaved={back} onCancel={back} />
    </>
  );
}
