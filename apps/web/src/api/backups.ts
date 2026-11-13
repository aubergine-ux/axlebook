import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface StoredBackup {
  name: string;
  size: number;
  createdAt: string;
}

export const storedBackupsQuery = queryOptions({
  queryKey: ['backups'],
  queryFn: () => api<StoredBackup[]>('/backups'),
});

export function useStoredBackupAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      make,
      remove,
      restore,
    }: {
      make?: true;
      remove?: string;
      restore?: string;
    }): Promise<unknown> =>
      make
        ? api<StoredBackup>('/backups', { method: 'POST' })
        : remove
          ? api<void>(`/backups/${encodeURIComponent(remove)}`, { method: 'DELETE' })
          : api<{ restored: Record<string, number> }>(
              `/backups/${encodeURIComponent(restore ?? '')}/restore`,
              { method: 'POST', body: JSON.stringify({ confirm: restore }) },
            ),
    // A restore replaces everything on screen.
    onSuccess: (_d, vars) =>
      vars.restore ? qc.invalidateQueries() : qc.invalidateQueries({ queryKey: ['backups'] }),
  });
}
