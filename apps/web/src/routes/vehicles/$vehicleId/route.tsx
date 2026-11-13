import { isCommercial, vehicleTitle } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { odometerQuery } from '../../../api/resources';
import { vehicleQuery } from '../../../api/vehicles';
import { LinkButton } from '../../../components/ui/Button';
import { OdometerReadout } from '../../../components/ui/OdometerReadout';
import { QueryState } from '../../../components/ui/QueryState';

export const Route = createFileRoute('/vehicles/$vehicleId')({ component: VehicleLayout });

const TABS = [
  'overview',
  'records',
  'fuel',
  'costs',
  'reminders',
  'odometer',
  'trips',
  'documents',
  'inspections',
  'ifta',
  'plan',
  'sharing',
] as const;
type Tab = (typeof TABS)[number];
const PATHS: Record<Tab, string> = {
  overview: '/vehicles/$vehicleId',
  records: '/vehicles/$vehicleId/records',
  fuel: '/vehicles/$vehicleId/fuel',
  costs: '/vehicles/$vehicleId/costs',
  reminders: '/vehicles/$vehicleId/reminders',
  odometer: '/vehicles/$vehicleId/odometer',
  trips: '/vehicles/$vehicleId/trips',
  documents: '/vehicles/$vehicleId/documents',
  inspections: '/vehicles/$vehicleId/inspections',
  ifta: '/vehicles/$vehicleId/ifta',
  plan: '/vehicles/$vehicleId/plan',
  sharing: '/vehicles/$vehicleId/sharing',
};

/** Vehicle header (name, photo, odometer) and section tabs, shared by every vehicle page. */
function VehicleLayout() {
  const { t } = useTranslation();
  const vehicleId = Route.useParams().vehicleId;
  const id = Number(vehicleId);
  const query = useQuery(vehicleQuery(id));
  const readings = useQuery(odometerQuery(id));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = pathname.split('/')[3] ?? 'overview';
  const odometer = readings.data?.reduce((max, r) => Math.max(max, r.odometer), 0) || null;
  // On a phone the tab row scrolls sideways; keep the current tab in view.
  const nav = useRef<HTMLElement>(null);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (loaded && section)
      nav.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [section, loaded]);

  return (
    <QueryState query={query}>
      {(v) => {
        const title = vehicleTitle(v);
        const tabs = TABS.filter(
          (tab) =>
            (tab !== 'sharing' || v.access === 'owner') &&
            // The trip log is for vehicles used for work.
            (tab !== 'trips' || v.usage === 'business') &&
            // DVIRs for trucks and trailers; IFTA only for the power unit.
            (tab !== 'inspections' || isCommercial(v.category)) &&
            (tab !== 'ifta' || v.category === 'semi'),
        );
        return (
          <>
            <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
              <Link
                to="/"
                className="inline-flex min-h-11 items-center gap-1 rounded-sm text-label text-ink-muted hover:text-ink"
              >
                <span aria-hidden>←</span>
                {t('vehicle.backToGarage')}
              </Link>
              {v.access !== 'view' && section !== 'edit' && (
                <LinkButton to="/vehicles/$vehicleId/edit" params={{ vehicleId }}>
                  {t('vehicle.editVehicle')}
                </LinkButton>
              )}
            </div>
            <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              {v.photoUrl && (
                <img
                  src={v.photoUrl}
                  alt={t('garage.photoAlt', { name: title })}
                  className="aspect-[16/9] w-full rounded-lg object-cover shadow-card sm:w-48"
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="ax-display text-[28px] leading-[32px] md:text-display md:leading-[44px]">
                  {v.nickname ?? title}
                </h1>
                {v.nickname && <p className="text-ink-muted">{title}</p>}
                {v.access !== 'owner' && (
                  <p className="mt-1 text-caption text-ink-muted">
                    {t('vehicle.sharedBy', { access: t(`vehicle.access.${v.access}`) })}
                  </p>
                )}
              </div>
              {odometer != null && (
                <div>
                  <p className="mb-1 text-label text-ink-muted">{t('vehicle.stats.odometer')}</p>
                  <OdometerReadout value={odometer} unit={v.odometerUnit} />
                </div>
              )}
            </header>
            <nav
              ref={nav}
              aria-label={t('vehicle.details')}
              className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 print:hidden"
            >
              <ul className="flex min-w-max gap-1">
                {tabs.map((tab) => {
                  const active =
                    tab === 'overview'
                      ? section === 'overview' || section === 'edit'
                      : section === tab;
                  return (
                    <li key={tab}>
                      <Link
                        to={PATHS[tab]}
                        params={{ vehicleId }}
                        aria-current={active ? 'page' : undefined}
                        activeProps={{}}
                        activeOptions={{ exact: true }}
                        className="-mb-px block border-b-2 border-transparent px-3 py-2.5 text-label text-ink-muted hover:text-ink aria-[current=page]:border-orange aria-[current=page]:text-orange-text"
                      >
                        {t(`vehicle.tabs.${tab}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <Outlet />
          </>
        );
      }}
    </QueryState>
  );
}
