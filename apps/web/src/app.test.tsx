import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from './routeTree.gen';
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        version: 'test',
        currency: 'USD',
        defaultUnitSystem: 'imperial',
        defaultLocale: 'en',
      }),
    ),
  );
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

    await userEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('axlebook.theme')).toBeNull();
  });

  it('shows the server version from /config', async () => {
    renderAt('/settings');
    expect(await screen.findByText('Axlebook test')).toBeInTheDocument();
  });
});
