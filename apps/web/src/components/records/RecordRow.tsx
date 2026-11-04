import type { LogRecord, Vehicle } from '@axlebook/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../lib/format';
import { Icon, type IconName } from '../Icon';

export const KIND_ICON: Record<LogRecord['kind'], IconName> = {
  service: 'service',
  repair: 'repair',
  upgrade: 'upgrade',
  fuel: 'fuel',
  expense: 'expense',
};

/** One line in a record list: what, when, at what reading, for how much. */
export function RecordRow({
  record,
  vehicle,
  vehicleName,
}: {
  record: LogRecord;
  vehicle: Pick<Vehicle, 'odometerUnit' | 'fuelUnit'>;
  vehicleName?: string;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const title =
    record.kind === 'fuel'
      ? `${t('record.fuelTitle')}${record.fuel ? ` · ${f.volume(record.fuel.volume, vehicle.fuelUnit)}` : ''}`
      : (record.title ?? t(`record.kinds.${record.kind}`));
  return (
    <li className="relative flex items-start gap-3 border-b border-line px-1 py-3 last:border-b-0 hover:bg-surface-sunken/50">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-sunken text-ink-muted">
        <Icon name={KIND_ICON[record.kind]} size={16} label={t(`record.kinds.${record.kind}`)} />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to="/records/$recordId"
          params={{ recordId: String(record.id) }}
          className="font-semibold outline-none after:absolute after:inset-0 focus-visible:underline"
        >
          {title}
        </Link>
        <p className="font-mono text-caption text-ink-muted">
          {f.date(record.date)}
          {record.odometer != null && ` · ${f.distance(record.odometer, vehicle.odometerUnit)}`}
          {vehicleName && <span className="font-sans"> · {vehicleName}</span>}
        </p>
        {(record.tags.length > 0 || record.expenseCategory || record.attachments.length > 0) && (
          <p className="mt-1 flex flex-wrap gap-1">
            {record.expenseCategory && (
              <span className="rounded-full bg-surface-sunken px-2 text-caption text-ink-muted">
                {t(`record.categories.${record.expenseCategory}`)}
              </span>
            )}
            {record.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-sunken px-2 text-caption text-ink-muted"
              >
                {tag}
              </span>
            ))}
            {record.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
                <Icon name="attachment" size={16} />
                <span className="font-mono">{record.attachments.length}</span>
              </span>
            )}
          </p>
        )}
      </div>
      <span className="shrink-0 font-mono text-data tabular-nums">{f.money(record.cost)}</span>
    </li>
  );
}
