import { vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { configQuery } from '../../../api/system';
import { useSaveVehicle, vehicleQuery } from '../../../api/vehicles';
import { PageHeader } from '../../../components/PageHeader';
import { QueryState } from '../../../components/ui/QueryState';
import { VehicleForm } from '../../../components/vehicles/VehicleForm';

export const Route = createFileRoute('/vehicles/$vehicleId/edit')({ component: EditVehiclePage });

function EditVehiclePage() {
  const { t } = useTranslation();
  const id = Number(Route.useParams().vehicleId);
  const navigate = useNavigate();
  const config = useQuery(configQuery);
  const query = useQuery(vehicleQuery(id));
  const save = useSaveVehicle();
  const back = () => navigate({ to: '/vehicles/$vehicleId', params: { vehicleId: String(id) } });

  return (
    <QueryState query={query}>
      {(vehicle) => (
        <>
          <PageHeader title={t('vehicle.editTitle', { name: vehicleTitle(vehicle) })} />
          <VehicleForm
            vehicle={vehicle}
            defaultUnits={config.data?.defaultUnitSystem ?? 'imperial'}
            isPending={save.isPending}
            serverError={save.error}
            onCancel={back}
            onSubmit={({ data, photo }) => save.mutate({ id, data, photo }, { onSuccess: back })}
          />
        </>
      )}
    </QueryState>
  );
}
