import type { ReactNode } from 'react';

export type Status = 'overdue' | 'due_soon' | 'upcoming';

const STYLES: Record<Status, string> = {
  overdue: 'bg-red-soft text-red',
  due_soon: 'bg-yellow-soft text-yellow',
  upcoming: 'bg-surface-sunken text-ink-muted',
};

/** Status pill: a dot plus words. Colour is never the only signal (brand rule). */
export function StatusBadge({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
