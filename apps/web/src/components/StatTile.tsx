import type { ReactNode } from 'react';

export function StatTile({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised p-4 shadow-card">
      <p className="text-label text-ink-muted">{label}</p>
      <div className="mt-1 font-mono text-figure font-medium">{children}</div>
      {hint && <p className="mt-1 text-caption text-ink-muted">{hint}</p>}
    </div>
  );
}
