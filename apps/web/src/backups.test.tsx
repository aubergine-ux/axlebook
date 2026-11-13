import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, signedIn, testMe } from './test-utils';

const settings = {
  currency: 'USD',
  soonDays: 30,
  soonDistanceMi: 500,
  soonDistanceKm: 800,
  onlineLookups: false,
  backupEnabled: false,
  backupEveryHours: 24,
  backupKeep: 7,
};
const stored = {
  name: 'axlebook-backup-20261101-030000.zip',
  size: 2_621_440,
  createdAt: '2026-11-01T03:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('backups on the server', () => {
  it('switches the schedule on, and restores a stored backup only after confirming', async () => {
    let current = settings;
    const calls = mockApi({
      'GET /api/v1/settings': () => current,
      'PATCH /api/v1/settings': ({ body }: { body: unknown }) => {
        current = { ...current, ...(body as object) };
        return current;
      },
      'GET /api/v1/backups': [stored],
      [`POST /api/v1/backups/${stored.name}/restore`]: () =>
        Response.json({ restored: { vehicles: 2 } }),
    });
    const user = userEvent.setup();
    renderApp('/settings');
    const title = await screen.findByRole('heading', { name: 'Backups on the server' });
    const block = title.parentElement as HTMLElement;
    await user.click(within(block).getByRole('switch', { name: 'Back up on a schedule' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ backupEnabled: true }),
    );
    expect(within(block).getByText(stored.name)).toBeInTheDocument();
    expect(within(block).getByText(/2\.5 MB/)).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/v1/backups/${stored.name}`,
    );

    await user.click(within(block).getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'What’s here now is saved as a backup first'.replace('’', "'"),
    );
    // Nothing happens until it's confirmed.
    expect(calls.some((c) => c.url.endsWith('/restore'))).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.url.endsWith('/restore'))?.body).toEqual({ confirm: stored.name });
  });

  it('is not shown to people who are not admins', async () => {
    mockApi({
      'GET /api/v1/auth/status': { ...signedIn, user: { ...testMe, role: 'editor' } },
      'GET /api/v1/settings': settings,
    });
    renderApp('/settings');
    await screen.findByRole('heading', { name: 'Profile' });
    expect(
      screen.queryByRole('heading', { name: 'Backups on the server' }),
    ).not.toBeInTheDocument();
  });
});
