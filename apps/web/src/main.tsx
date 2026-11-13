import './styles.css';
import './i18n';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiRequestError } from './api/client';
import { BASE } from './lib/base';
import { routeTree } from './routeTree.gen';
import { ThemeProvider } from './theme/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry auth or permission failures.
      retry: (count, err) =>
        !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    // A session that expired mid-use sends everyone back to sign in.
    onError: (err, query) => {
      if (err instanceof ApiRequestError && err.status === 401 && query.queryKey[0] !== 'auth') {
        void queryClient.invalidateQueries({ queryKey: ['auth'] });
      }
    },
  }),
});

const router = createRouter({
  routeTree,
  // Empty at the root; the mount path behind a reverse proxy at a subpath.
  basepath: BASE || '/',
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
