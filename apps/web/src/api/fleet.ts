import type {
  DocumentInput,
  MileageReport,
  Trip,
  TripInput,
  VehicleDocument,
} from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const body = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});

// ── Trips ────────────────────────────────────────────────────────────────────

export const tripsQuery = (vehicleId: number, year?: number) =>
  queryOptions({
    queryKey: ['trips', vehicleId, 'list', year ?? null],
    queryFn: () => api<Trip[]>(`/vehicles/${vehicleId}/trips${year ? `?year=${year}` : ''}`),
  });
export const mileageQuery = (vehicleId: number, year?: number) =>
  queryOptions({
    queryKey: ['trips', vehicleId, 'mileage', year ?? null],
    queryFn: () =>
      api<MileageReport>(`/vehicles/${vehicleId}/mileage${year ? `?year=${year}` : ''}`),
    placeholderData: (prev) => prev,
  });

export function useTripAction(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      remove,
    }: {
      id?: number;
      data?: TripInput;
      remove?: boolean;
    }): Promise<unknown> =>
      remove
        ? api<void>(`/trips/${id}`, { method: 'DELETE' })
        : id
          ? api<Trip>(`/trips/${id}`, body('PATCH', data))
          : api<Trip>(`/vehicles/${vehicleId}/trips`, body('POST', data)),
    // A trip's end reading moves the odometer, which reminders and the garage card read.
    onSuccess: () =>
      Promise.all(
        [['trips', vehicleId], ['odometer'], ['vehicles'], ['reminders']].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

// ── Documents ────────────────────────────────────────────────────────────────

export const documentsQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['documents', vehicleId],
    queryFn: () => api<VehicleDocument[]>(`/vehicles/${vehicleId}/documents`),
  });
export const allDocumentsQuery = queryOptions({
  queryKey: ['documents', 'all'],
  queryFn: () => api<VehicleDocument[]>('/documents'),
});

export function useDocumentAction(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      file,
      remove,
      removeFile,
    }: {
      id?: number;
      data?: DocumentInput;
      /** Uploaded after the document is saved. */
      file?: File;
      remove?: boolean;
      removeFile?: boolean;
    }): Promise<unknown> => {
      if (remove) return api<void>(`/documents/${id}`, { method: 'DELETE' });
      if (removeFile) return api<VehicleDocument>(`/documents/${id}/file`, { method: 'DELETE' });
      const saved = data
        ? id
          ? await api<VehicleDocument>(`/documents/${id}`, body('PATCH', data))
          : await api<VehicleDocument>(`/vehicles/${vehicleId}/documents`, body('POST', data))
        : null;
      const target = saved?.id ?? id;
      if (!file || target == null) return saved;
      const form = new FormData();
      form.append('file', file, file.name);
      return api<VehicleDocument>(`/documents/${target}/file`, { method: 'PUT', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

// ── Muting ───────────────────────────────────────────────────────────────────

export const muteQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['mute', vehicleId],
    queryFn: () => api<{ muted: boolean }>(`/vehicles/${vehicleId}/notifications`),
  });
export function useSetMute(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) =>
      api<{ muted: boolean }>(`/vehicles/${vehicleId}/notifications`, body('PUT', { muted })),
    onSuccess: (data) => qc.setQueryData(['mute', vehicleId], data),
  });
}
