import { type QueryClient, useQuery } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authStatusQuery } from '../api/auth';
import { AppShell } from '../components/AppShell';
import { useTheme } from '../theme/theme';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Redirect before any page renders, so signed-out visitors never trigger data requests.
  beforeLoad: async ({ context, location }) => {
    const status = await context.queryClient.ensureQueryData(authStatusQuery).catch(() => null);
    if (!status) return;
    const path = location.pathname;
    if (status.setupRequired) {
      if (path !== '/setup') throw redirect({ to: '/setup', replace: true });
    } else if (!status.user) {
      if (path !== '/login') throw redirect({ to: '/login', replace: true });
    } else if (path === '/login' || path === '/setup') {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: Root,
});

const AUTH_PAGES = new Set(['/login', '/setup']);

/** Sends people to first-run setup or sign-in as needed; the app shell wraps everything else. */
function Root() {
  const { t } = useTranslation();
  const status = useQuery(authStatusQuery);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, setTheme, hasLocalChoice } = useTheme();
  const user = status.data?.user;

  // A new device adopts the theme saved on the account.
  useEffect(() => {
    if (user && !hasLocalChoice && user.theme !== theme) setTheme(user.theme, { persist: false });
  }, [user, hasLocalChoice, theme, setTheme]);

  if (status.isPending) {
    return (
      <p role="status" className="grid min-h-dvh place-items-center text-ink-muted">
        {t('common.loading')}
      </p>
    );
  }
  const isAuthPage = AUTH_PAGES.has(path);
  if (status.data?.setupRequired)
    return path === '/setup' ? <Outlet /> : <Navigate to="/setup" replace />;
  if (!user) return path === '/login' ? <Outlet /> : <Navigate to="/login" replace />;
  if (isAuthPage) return <Navigate to="/" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
