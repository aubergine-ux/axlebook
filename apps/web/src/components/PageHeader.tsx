import type { ReactNode } from 'react';

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="ax-display text-[28px] leading-[32px] md:text-display md:leading-[44px]">
        {title}
      </h1>
      {actions}
    </div>
  );
}
