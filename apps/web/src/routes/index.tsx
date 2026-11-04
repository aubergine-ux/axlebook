import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Switch } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { vehiclesQuery } from '../api/vehicles';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { LinkButton } from '../components/ui/Button';
import { QueryState } from '../components/ui/QueryState';
import { VehicleCard } from '../components/vehicles/VehicleCard';

export const Route = createFileRoute('/')({
  validateSearch: z.object({ archived: z.boolean().optional() }),
  component: GaragePage,
});

function GaragePage() {
  const { t } = useTranslation();
  const { archived = false } = Route.useSearch();
  const navigate = useNavigate({ from: '/' });
  const query = useQuery(vehiclesQuery(archived ? 'all' : 'false'));

  return (
    <>
      <PageHeader
        title={t('garage.title')}
        actions={
          <LinkButton to="/vehicles/new" variant="primary">
            <Icon name="add" size={16} />
            {t('garage.add')}
          </LinkButton>
        }
      />
      <div className="mb-4 flex justify-end">
        <Switch
          isSelected={archived}
          onChange={(on) => navigate({ search: on ? { archived: true } : {}, replace: true })}
          className="group flex cursor-pointer items-center gap-2 text-sm text-ink-muted"
        >
          <span className="flex h-6 w-10 items-center rounded-full border border-line-strong bg-surface-sunken px-0.5 transition-colors group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink">
            <span className="h-4.5 w-4.5 rounded-full bg-surface-raised shadow transition-transform group-data-[selected]:translate-x-4" />
          </span>
          {t('garage.showArchived')}
        </Switch>
      </div>
      <QueryState query={query}>
        {(vehicles) =>
          vehicles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
              {t('garage.empty')}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <li key={v.id} className="flex">
                  <div className="w-full">
                    <VehicleCard vehicle={v} />
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
