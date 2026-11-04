import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from './routeTree.gen';
import { mockApi } from './test-utils';
import { ThemeProvider } from './theme/theme';

function renderAt(path: string) {
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
}

beforeEach(() => {
  mockApi({
    'GET /api/v1/vehicles': [],
    'GET /api/v1/me/tokens': [],
    'GET /api/v1/me/channels': [],
    'GET /api/v1/settings': {
      currency: 'USD',
      soonDays: 30,
      soonDistanceMi: 500,
      soonDistanceKm: 800,
    },
    'GET /api/v1/users': [],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

describe('app shell', () => {
  it('renders the garage with skip link and navigation', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Garage' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    const navs = screen.getAllByRole('navigation', { name: 'Main navigation' });
    expect(navs.length).toBeGreaterThan(0);
  });

  it('switches and persists the theme from settings', async () => {
    renderAt('/settings');
    const dark = await screen.findByRole('radio', { name: 'Dark' });
    await userEvent.click(dark);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('axlebook.theme')).toBe('dark');

    // "System" resolves to the OS preference (light in jsdom) and forgets the saved choice.
    await userEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('axlebook.theme')).toBeNull();
  });

  it('shows the server version from /config', async () => {
    renderAt('/settings');
    expect(await screen.findByText('Axlebook test')).toBeInTheDocument();
  });
});
