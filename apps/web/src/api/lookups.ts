import type { Recall, RecallState, VehicleRecalls, VinDecoded } from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const key = (vehicleId: number) => ['recalls', vehicleId] as const;

export const recallsQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: key(vehicleId),
    queryFn: () => api<VehicleRecalls>(`/vehicles/${vehicleId}/recalls`),
  });

export function useCheckRecalls(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<VehicleRecalls>(`/vehicles/${vehicleId}/recalls/check`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(key(vehicleId), data),
  });
}

export function useSetRecallState(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: number; state: RecallState }) =>
      api<Recall>(`/recalls/${id}`, { method: 'PATCH', body: JSON.stringify({ state }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(vehicleId) }),
  });
}

export function useDecodeVin() {
  return useMutation({
    mutationFn: (vin: string) =>
      api<VinDecoded>('/lookups/vin', { method: 'POST', body: JSON.stringify({ vin }) }),
  });
}
