import type { VehicleDocument } from '@axlebook/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../lib/format';
import { StatusBadge } from '../ui/StatusBadge';

/** "Expired 3 days ago", "Expires in 12 days", "Expires Jun 30, 2027" or "No expiry". */
export function useExpiryText() {
  const { t } = useTranslation();
  const f = useFormat();
  return (d: VehicleDocument): string => {
    if (!d.expiresOn || d.daysLeft == null) return t('documents.noExpiry');
    if (d.daysLeft < 0) return t('documents.expiredAgo', { count: -d.daysLeft });
    if (d.daysLeft === 0) return t('documents.expiresToday');
    if (d.status === 'due_soon') return t('documents.expiresIn', { count: d.daysLeft });
    return t('documents.expiresOn', { date: f.date(d.expiresOn) });
  };
}

/** One document: what it is, its number, when it runs out, and its scan. */
export function DocumentItem({
  document: d,
  showVehicle,
  actions,
}: {
  document: VehicleDocument;
  showVehicle?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const expiry = useExpiryText();
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {d.title}
          <span className="ml-2 text-caption font-normal text-ink-muted">
            {t(`documents.types.${d.type}`)}
          </span>
          {showVehicle && (
            <Link
              to="/vehicles/$vehicleId/documents"
              params={{ vehicleId: String(d.vehicleId) }}
              className="ml-2 text-caption font-normal text-ink-muted underline-offset-2 hover:underline"
            >
              {d.vehicleTitle}
            </Link>
          )}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={d.status}>{t(`documents.status.${d.status}`)}</StatusBadge>
          <span className="font-mono text-caption text-ink-muted">{expiry(d)}</span>
          {d.number && <span className="font-mono text-caption">{d.number}</span>}
        </p>
        {d.notes && <p className="mt-1 text-caption text-ink-muted">{d.notes}</p>}
        {d.file && (
          <a
            href={d.file.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-label text-orange-text underline-offset-2 hover:underline"
          >
            {t('documents.open', { name: d.file.name })}
          </a>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}
