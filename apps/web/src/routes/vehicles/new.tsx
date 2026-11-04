import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { configQuery } from '../../api/system';
import { useSaveVehicle } from '../../api/vehicles';
import { PageHeader } from '../../components/PageHeader';
import { VehicleForm } from '../../components/vehicles/VehicleForm';

export const Route = createFileRoute('/vehicles/new')({ component: NewVehiclePage });

function NewVehiclePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const config = useQuery(configQuery);
  const save = useSaveVehicle();

  return (
    <>
      <PageHeader title={t('vehicle.newTitle')} />
      <VehicleForm
        defaultUnits={config.data?.defaultUnitSystem ?? 'imperial'}
        isPending={save.isPending}
        serverError={save.error}
        onCancel={() => navigate({ to: '/' })}
        onSubmit={({ data, photo }) =>
          save.mutate(
            { data, photo },
            {
              onSuccess: (v) =>
                navigate({ to: '/vehicles/$vehicleId', params: { vehicleId: String(v.id) } }),
            },
          )
        }
      />
    </>
  );
}
