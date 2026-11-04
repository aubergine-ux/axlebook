import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { listOutbox, type OutboxEntry, onOutboxChange, syncOutbox } from './outbox';

/** Queued offline entries; syncs automatically when the browser comes back online. */
export function useOutbox() {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const refresh = useCallback(() => {
    listOutbox()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);
  const sync = useCallback(async () => {
    const r = await syncOutbox().catch(() => ({ sent: 0, failed: 0 }));
    if (r.sent) await qc.invalidateQueries();
    return r;
  }, [qc]);

  useEffect(() => {
    refresh();
    const off = onOutboxChange(refresh);
    const online = () => void sync();
    window.addEventListener('online', online);
    if (navigator.onLine) void sync();
    return () => {
      off();
      window.removeEventListener('online', online);
    };
  }, [refresh, sync]);

  return { entries, sync };
}
