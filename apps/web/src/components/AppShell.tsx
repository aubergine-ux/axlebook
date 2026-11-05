import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../api/auth';
import { useMe } from '../lib/useMe';
import { Icon, type IconName } from './Icon';
import { OfflineBanner } from './OfflineBanner';
import { Button } from './ui/Button';

type NavKey = 'garage' | 'reminders' | 'parts' | 'reports' | 'settings';
interface NavItem {
  to: string;
  key: NavKey;
  icon: IconName;
  match: (path: string) => boolean;
}
const ITEMS: Record<NavKey, NavItem> = {
  // Vehicle and record pages live under the garage.
  garage: {
    to: '/',
    key: 'garage',
    icon: 'garage',
    match: (p) => p === '/' || p.startsWith('/vehicles') || p.startsWith('/records'),
  },
  reminders: {
    to: '/reminders',
    key: 'reminders',
    icon: 'reminder',
    match: (p) => p.startsWith('/reminders'),
  },
  parts: { to: '/parts', key: 'parts', icon: 'parts', match: (p) => p.startsWith('/parts') },
  reports: {
    to: '/reports',
    key: 'reports',
    icon: 'reports',
    match: (p) => p.startsWith('/reports'),
  },
  settings: {
    to: '/settings',
    key: 'settings',
    icon: 'settings',
    match: (p) => p.startsWith('/settings'),
  },
};
const DESKTOP: NavKey[] = ['garage', 'reminders', 'parts', 'reports'];

/**
 * Wide screens: top bar with nav, search, log fuel and account.
 * Phones: slim top bar and a bottom tab bar in thumb reach, with the fuel quick-add in the middle.
 * The active nav item is one of the few places orange is allowed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = useMe();
  const logout = useLogout();
  const current = (item: NavItem) => (item.match(pathname) ? 'page' : undefined);

  const tab = (item: NavItem) => (
    <li key={item.key}>
      <Link
        to={item.to}
        aria-current={current(item)}
        activeProps={{}}
        activeOptions={{ exact: true }}
        className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption font-semibold text-ink-muted aria-[current=page]:text-orange-text"
      >
        <Icon name={item.icon} size={20} />
        {t(`nav.${item.key}`)}
      </Link>
    </li>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface-raised/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
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
              {DESKTOP.map((k) => {
                const item = ITEMS[k];
                return (
                  <li key={k}>
                    <Link
                      to={item.to}
                      aria-current={current(item)}
                      activeProps={{}}
                      activeOptions={{ exact: true }}
                      className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-label text-ink-muted hover:bg-surface-sunken lg:px-3 hover:text-ink aria-[current=page]:bg-orange-soft aria-[current=page]:text-orange-text"
                    >
                      <Icon name={item.icon} size={16} />
                      {t(`nav.${k}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/search"
              aria-label={t('nav.search')}
              aria-current={pathname.startsWith('/search') ? 'page' : undefined}
              activeProps={{}}
              activeOptions={{ exact: true }}
              className="grid h-10 w-10 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink aria-[current=page]:text-orange-text"
            >
              <Icon name="search" size={20} />
            </Link>
            <Link
              to="/log"
              className="hidden items-center gap-2 whitespace-nowrap rounded-md border border-line-strong px-3 py-2 text-label hover:bg-surface-sunken md:flex"
            >
              <Icon name="fuel" size={16} />
              {t('nav.logFuel')}
            </Link>
            <Link
              to="/settings"
              aria-label={t('nav.settings')}
              aria-current={current(ITEMS.settings)}
              activeProps={{}}
              activeOptions={{ exact: true }}
              className="hidden h-10 w-10 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink aria-[current=page]:text-orange-text md:grid"
            >
              <Icon name="settings" size={20} />
            </Link>
            {me && (
              <div className="ml-2 hidden items-center gap-2 border-l border-line pl-3 lg:flex">
                <span className="max-w-32 truncate text-caption text-ink-muted">
                  {me.displayName ?? me.username}
                </span>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 text-caption"
                  onPress={() => logout.mutate()}
                >
                  {t('nav.signOut')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <OfflineBanner />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-6 md:pb-12 print:p-0"
      >
        {children}
      </main>

      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <ul className="grid grid-cols-5 items-end">
          {tab(ITEMS.garage)}
          {tab(ITEMS.reminders)}
          <li className="flex justify-center">
            {/* The fuel quick-add: the one orange control in the bar. */}
            <Link
              to="/log"
              aria-label={t('nav.logFuel')}
              className="mb-2 grid h-14 w-14 place-items-center rounded-full bg-orange text-on-orange shadow-pop hover:bg-orange-strong"
            >
              <Icon name="fuel" size={24} />
            </Link>
          </li>
          {tab(ITEMS.reports)}
          {tab(ITEMS.settings)}
        </ul>
      </nav>
    </div>
  );
}
