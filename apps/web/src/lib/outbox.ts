import type { RecordInput } from '@axlebook/shared';
import { ApiRequestError, api } from '../api/client';

/**
 * Offline outbox for fuel entries logged without a connection. Each entry carries a
 * client-generated `clientId`, so a sync that's retried (or that succeeded but lost its
 * response) never creates a duplicate: the server returns the existing record.
 */
export interface OutboxEntry {
  clientId: string;
  vehicleId: number;
  vehicleName: string;
  data: RecordInput;
  createdAt: string;
  /** A photo taken with the entry (the pump or the odometer), attached once the record is saved. */
  photo?: StoredPhoto;
  /** Set when the server rejected the entry (it stays until fixed or discarded). */
  error?: string;
}

/** Kept as raw bytes: every browser stores an ArrayBuffer in IndexedDB, not all store a Blob. */
export interface StoredPhoto {
  data: ArrayBuffer;
  type: string;
  name: string;
}

const DB = 'axlebook';
const STORE = 'outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
export function onOutboxChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function enqueue(entry: OutboxEntry) {
  await tx('readwrite', (s) => s.put(entry));
  notify();
}
export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await tx<OutboxEntry[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function discard(clientId: string) {
  await tx('readwrite', (s) => s.delete(clientId));
  notify();
}

/** Attach a photo to a saved record. */
export function attachPhoto(recordId: number, blob: Blob, name: string) {
  const form = new FormData();
  form.append('file', blob, name);
  return api(`/records/${recordId}/attachments`, { method: 'POST', body: form });
}

let syncing: Promise<{ sent: number; failed: number }> | null = null;

/** Send queued entries in order. Stops at the first network failure; keeps rejected ones with their error. */
export function syncOutbox(): Promise<{ sent: number; failed: number }> {
  syncing ??= (async () => {
    let sent = 0;
    let failed = 0;
    try {
      for (const entry of await listOutbox()) {
        if (entry.error) {
          failed++;
          continue;
        }
        try {
          const saved = await api<{ id: number }>(`/vehicles/${entry.vehicleId}/records`, {
            method: 'POST',
            body: JSON.stringify(entry.data),
          });
          // If the photo fails, the entry stays queued; sending it again finds the same record.
          if (entry.photo)
            await attachPhoto(
              saved.id,
              new Blob([entry.photo.data], { type: entry.photo.type }),
              entry.photo.name,
            );
          await tx('readwrite', (s) => s.delete(entry.clientId));
          sent++;
        } catch (err) {
          if (err instanceof ApiRequestError && err.code === 'network') break;
          // 401 means signed out: leave it for after sign-in. Other errors need the user.
          if (err instanceof ApiRequestError && err.status === 401) break;
          await tx('readwrite', (s) =>
            s.put({ ...entry, error: err instanceof ApiRequestError ? err.code : 'internal' }),
          );
          failed++;
        }
      }
    } finally {
      syncing = null;
      notify();
    }
    return { sent, failed };
  })();
  return syncing;
}
