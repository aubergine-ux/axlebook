import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { withBase } from '../lib/base';

/** Centered card on the graphite brand ground, for sign-in and setup. */
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-dvh place-items-center bg-graphite px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-on-graphite">
          <div className="flex items-center gap-2">
            <img src={withBase('/brand/mark-dark.svg')} alt="" className="h-9 w-9" />
            <img
              src={withBase('/brand/wordmark-dark.svg')}
              alt={t('appName')}
              className="h-6 w-auto"
            />
          </div>
          <p className="text-caption text-on-graphite/70">{t('auth.tagline')}</p>
        </div>
        <section className="rounded-xl bg-surface-raised p-6 shadow-glass">
          <h1 className="text-title font-semibold">{title}</h1>
          {intro && <p className="mt-1 text-ink-muted">{intro}</p>}
          <div className="mt-5">{children}</div>
        </section>
      </div>
    </main>
  );
}
