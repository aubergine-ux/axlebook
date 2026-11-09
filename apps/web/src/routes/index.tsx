import {
  GARAGE_LAYOUTS,
  GARAGE_SORTS,
  sectionOf,
  sortGarage,
  VEHICLE_SECTIONS,
  type VehicleSection,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Switch } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { aiStatusQuery } from '../api/extras';
import { vehiclesQuery } from '../api/vehicles';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/records/RecordForm';
import { Button, LinkButton } from '../components/ui/Button';
import { ErrorNote } from '../components/ui/ErrorNote';
import { SelectField } from '../components/ui/fields';
import { QueryState } from '../components/ui/QueryState';
import { GarageCustomize } from '../components/vehicles/GarageCustomize';
import { GARAGE_GRID, VehicleCard } from '../components/vehicles/VehicleCard';
import { useViewPrefs } from '../lib/useViewPrefs';

export const Route = createFileRoute('/')({
  validateSearch: z.object({
    archived: z.boolean().optional(),
    section: z
      .enum(Object.keys(VEHICLE_SECTIONS) as [VehicleSection, ...VehicleSection[]])
      .optional(),
  }),
  component: GaragePage,
});

function GaragePage() {
  const { t } = useTranslation();
  const { archived = false, section } = Route.useSearch();
  const navigate = useNavigate({ from: '/' });
  const query = useQuery(vehiclesQuery(archived ? 'all' : 'false'));
  const ai = useQuery(aiStatusQuery).data;
  const view = useViewPrefs();
  const prefs = view.garage;
  const [customizing, setCustomizing] = useState(false);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          <LinkButton to="/parts" variant="ghost">
            <Icon name="parts" size={16} />
            {t('garage.parts')}
          </LinkButton>
          <LinkButton to="/import" variant="ghost">
            {t('garage.importSheet')}
          </LinkButton>
          {ai?.enabled && (
            <LinkButton to="/assistant" variant="ghost">
              {t('assistant.title')}
            </LinkButton>
          )}
        </div>
        <Switch
          isSelected={archived}
          onChange={(on) =>
            navigate({ search: (s) => ({ ...s, archived: on ? true : undefined }), replace: true })
          }
          className="group flex cursor-pointer items-center gap-2 text-sm text-ink-muted"
        >
          <span className="flex h-6 w-10 items-center rounded-full border border-line-strong bg-surface-sunken px-0.5 transition-colors group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-focus group-data-[selected]:border-ink group-data-[selected]:bg-ink">
            <span className="h-4.5 w-4.5 rounded-full bg-surface-raised shadow transition-transform group-data-[selected]:translate-x-4" />
          </span>
          {t('garage.showArchived')}
        </Switch>
      </div>
      <QueryState query={query}>
        {(unsorted) => {
          const all = sortGarage(unsorted, prefs);
          const present = new Set(all.map((v) => sectionOf(v.category)));
          const vehicles = section ? all.filter((v) => sectionOf(v.category) === section) : all;
          // Sections only appear once the garage has more than one kind of vehicle.
          const showTabs = present.size > 1 || section != null;
          return (
            <>
              {showTabs && (
                <nav
                  aria-label={t('garage.sections.all')}
                  className="-mx-4 mb-4 overflow-x-auto px-4"
                >
                  <ul className="flex min-w-max gap-2">
                    {(
                      [undefined, ...Object.keys(VEHICLE_SECTIONS)] as (
                        | VehicleSection
                        | undefined
                      )[]
                    ).map((s) => (
                      <li key={s ?? 'all'}>
                        <Link
                          to="/"
                          search={(prev) => ({ ...prev, section: s })}
                          aria-current={section === s ? 'page' : undefined}
                          activeProps={{}}
                          activeOptions={{ exact: true, includeSearch: true }}
                          className="flex min-h-11 items-center rounded-full border border-line-strong px-4 text-label text-ink-muted hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-surface-sunken aria-[current=page]:text-ink"
                        >
                          {t(`garage.sections.${s ?? 'all'}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              {all.length > 0 && (
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <SelectField
                    label={t('garage.view.sortLabel')}
                    value={prefs.sort}
                    onChange={(sort) => view.setGarage({ sort })}
                    options={GARAGE_SORTS.map((s) => ({
                      value: s,
                      label: t(`garage.view.sorts.${s}`),
                    }))}
                    className="w-full sm:w-56"
                  />
                  <Segmented
                    label={t('garage.view.layoutLabel')}
                    value={prefs.layout}
                    onChange={(layout) => view.setGarage({ layout })}
                    options={GARAGE_LAYOUTS.map((l) => ({
                      value: l,
                      label: t(`garage.view.layouts.${l}`),
                    }))}
                  />
                  <Button onPress={() => setCustomizing(true)}>{t('garage.view.customize')}</Button>
                  <ErrorNote error={view.error} className="w-full" />
                  <GarageCustomize
                    isOpen={customizing}
                    onOpenChange={setCustomizing}
                    prefs={prefs}
                    vehicles={all}
                    onSave={view.setGarage}
                  />
                </div>
              )}
              {vehicles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong bg-surface-raised p-8 text-center text-ink-muted">
                  {section ? t(`garage.sectionEmpty.${section}`) : t('garage.empty')}
                </p>
              ) : (
                <ul className={GARAGE_GRID[prefs.layout]}>
                  {vehicles.map((v) => (
                    <li
                      key={v.id}
                      className={
                        prefs.layout === 'list' ? 'border-b border-line last:border-b-0' : 'flex'
                      }
                    >
                      <div className="w-full">
                        <VehicleCard vehicle={v} layout={prefs.layout} fields={prefs.fields} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </QueryState>
    </>
  );
}
