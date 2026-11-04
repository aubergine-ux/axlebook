import { Link } from '@tanstack/react-router';
import { BellRing, Car, ChartColumn, type LucideIcon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type NavKey = 'garage' | 'reminders' | 'reports' | 'settings';
const NAV: { to: string; key: NavKey; icon: LucideIcon }[] = [
  { to: '/', key: 'garage', icon: Car },
  { to: '/reminders', key: 'reminders', icon: BellRing },
  { to: '/reports', key: 'reports', icon: ChartColumn },
  { to: '/settings', key: 'settings', icon: Settings },
];

/**
 * Layout: top bar with inline nav on wide screens, bottom tab bar on phones.
 * The bottom bar keeps primary destinations in thumb reach.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex shrink-0 items-center rounded-md">
            <img src="/brand/logo.svg" alt={t('appName')} className="logo-light h-7 w-auto" />
            <img src="/brand/logo-dark.svg" alt={t('appName')} className="logo-dark h-7 w-auto" />
          </Link>
          <nav aria-label={t('nav.main')} className="hidden md:block">
            <ul className="flex gap-1">
              {NAV.map(({ to, key, icon: Icon }) => (
                <li key={key}>
                  <Link
                    to={to}
                    activeOptions={{ exact: to === '/' }}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-raised hover:text-fg aria-[current=page]:bg-raised aria-[current=page]:text-fg"
                  >
                    <Icon aria-hidden size={16} />
                    {t(`nav.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:pb-10"
      >
        {children}
      </main>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, key, icon: Icon }) => (
            <li key={key}>
              <Link
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted aria-[current=page]:text-accent-fg"
              >
                <Icon aria-hidden size={20} />
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
