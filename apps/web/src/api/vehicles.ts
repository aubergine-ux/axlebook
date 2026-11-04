import type { Vehicle, VehicleInput, VehicleSummary, VehicleUpdate } from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const vehicleKeys = {
  all: ['vehicles'] as const,
  list: (archived: 'false' | 'true' | 'all') => ['vehicles', 'list', archived] as const,
  detail: (id: number) => ['vehicles', 'detail', id] as const,
};

export const vehiclesQuery = (archived: 'false' | 'true' | 'all' = 'false') =>
  queryOptions({
    queryKey: vehicleKeys.list(archived),
    queryFn: () => api<VehicleSummary[]>(`/vehicles?archived=${archived}`),
  });

export const vehicleQuery = (id: number) =>
  queryOptions({
    queryKey: vehicleKeys.detail(id),
    queryFn: () => api<Vehicle>(`/vehicles/${id}`),
  });

/** Photo change requested by the form: keep, replace with a new image, or remove. */
export type PhotoChange = { kind: 'keep' } | { kind: 'set'; blob: Blob } | { kind: 'remove' };

async function applyPhoto(id: number, photo: PhotoChange): Promise<Vehicle | null> {
  if (photo.kind === 'set') {
    const form = new FormData();
    const ext = photo.blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    form.append('file', photo.blob, `photo.${ext}`);
    return api<Vehicle>(`/vehicles/${id}/photo`, { method: 'PUT', body: form });
  }
  if (photo.kind === 'remove') return api<Vehicle>(`/vehicles/${id}/photo`, { method: 'DELETE' });
  return null;
}

export function useSaveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      photo,
    }: {
      id?: number;
      data: VehicleInput | VehicleUpdate;
      photo: PhotoChange;
    }): Promise<Vehicle> => {
      const saved = id
        ? await api<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
        : await api<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(data) });
      return (await applyPhoto(saved.id, photo)) ?? saved;
    },
    onSuccess: (v) => {
      qc.setQueryData(vehicleKeys.detail(v.id), v);
      return qc.invalidateQueries({ queryKey: vehicleKeys.all });
    },
  });
}

export function useArchiveVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      api<Vehicle>(`/vehicles/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
    onSuccess: (v) => {
      qc.setQueryData(vehicleKeys.detail(v.id), v);
      return qc.invalidateQueries({ queryKey: vehicleKeys.all });
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: vehicleKeys.detail(id) });
      return qc.invalidateQueries({ queryKey: vehicleKeys.list('false') });
    },
  });
}
