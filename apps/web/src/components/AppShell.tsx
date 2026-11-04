import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';

type NavKey = 'garage' | 'reminders' | 'reports' | 'settings';
const NAV: { to: string; key: NavKey; icon: IconName; match: (path: string) => boolean }[] = [
  // Vehicle pages live under the garage.
  { to: '/', key: 'garage', icon: 'garage', match: (p) => p === '/' || p.startsWith('/vehicles') },
  {
    to: '/reminders',
    key: 'reminders',
    icon: 'reminder',
    match: (p) => p.startsWith('/reminders'),
  },
  { to: '/reports', key: 'reports', icon: 'reports', match: (p) => p.startsWith('/reports') },
  { to: '/settings', key: 'settings', icon: 'settings', match: (p) => p.startsWith('/settings') },
];

/**
 * Layout: top bar with inline nav on wide screens, bottom tab bar on phones (thumb reach).
 * The active nav item is one of the few places orange is allowed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link
            to="/"
            aria-label={t('appName')}
            className="flex shrink-0 items-center gap-2 rounded-sm"
          >
            {/* Flat mark below 64 px (brand guide); variants swap with the theme. */}
            <img src="/brand/mark.svg" alt="" className="on-light h-7 w-7" />
            <img src="/brand/mark-dark.svg" alt="" className="on-dark h-7 w-7" />
            <img src="/brand/wordmark.svg" alt="" className="on-light h-[18px] w-auto" />
            <img src="/brand/wordmark-dark.svg" alt="" className="on-dark h-[18px] w-auto" />
          </Link>
          <nav aria-label={t('nav.main')} className="hidden md:block">
            <ul className="flex gap-1">
              {NAV.map(({ to, key, icon, match }) => (
                <li key={key}>
                  <Link
                    to={to}
                    aria-current={match(pathname) ? 'page' : undefined}
                    activeProps={{}}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-label text-ink-muted hover:bg-surface-sunken hover:text-ink aria-[current=page]:bg-orange-soft aria-[current=page]:text-orange-text"
                  >
                    <Icon name={icon} size={16} />
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
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-6 md:pb-12"
      >
        {children}
      </main>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, key, icon, match }) => (
            <li key={key}>
              <Link
                to={to}
                aria-current={match(pathname) ? 'page' : undefined}
                activeProps={{}}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption font-semibold text-ink-muted aria-[current=page]:text-orange-text"
              >
                <Icon name={icon} size={20} />
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
