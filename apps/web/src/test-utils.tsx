import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { routeTree } from './routeTree.gen';
import { ThemeProvider } from './theme/theme';

export const testConfig = {
  version: 'test',
  currency: 'USD',
  defaultUnitSystem: 'imperial',
  defaultLocale: 'en',
};

type Handler = (req: { method: string; url: string; body: unknown }) => unknown;

/**
 * Stubs fetch with a tiny router: `routes['GET /api/v1/vehicles']` returns JSON.
 * Returns the recorded calls for assertions.
 */
export function mockApi(routes: Record<string, unknown | Handler>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = String(input).split('?')[0] ?? '';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      calls.push({ method, url: String(input), body });
      const key = `${method} ${url}`;
      if (key === 'GET /api/v1/config' && !(key in routes)) return Response.json(testConfig);
      if (!(key in routes)) return Response.json({ error: { code: 'not_found' } }, { status: 404 });
      const r = routes[key];
      const data = typeof r === 'function' ? (r as Handler)({ method, url, body }) : r;
      return Response.json(data, { status: method === 'POST' ? 201 : 200 });
    }),
  );
  return calls;
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return router;
}
