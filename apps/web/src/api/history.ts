import type {
  HistoryLink,
  HistoryLinkInput,
  HistoryOptions,
  VehicleHistory,
} from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { BASE } from '../lib/base';
import { ApiRequestError, api } from './client';

export const historyQuery = (vehicleId: number, o: HistoryOptions) =>
  queryOptions({
    queryKey: ['history', vehicleId, o],
    queryFn: () =>
      api<VehicleHistory>(
        `/vehicles/${vehicleId}/history?costs=${o.showCosts}&vin=${o.showVin}&notes=${o.showNotes}`,
      ),
    placeholderData: (prev) => prev,
  });

/** A shared report, read with the link alone: no session, and outside the signed-in API. */
export const sharedHistoryQuery = (token: string) =>
  queryOptions({
    queryKey: ['history', 'shared', token],
    queryFn: async () => {
      let res: Response;
      try {
        res = await fetch(`${BASE}/api/public/history/${encodeURIComponent(token)}`, {
          credentials: 'omit',
        });
      } catch {
        throw new ApiRequestError(0, 'network');
      }
      if (!res.ok)
        throw new ApiRequestError(res.status, res.status === 429 ? 'rate_limited' : 'not_found');
      return (await res.json()) as VehicleHistory;
    },
    retry: false,
    staleTime: 60_000,
  });

const linksKey = (vehicleId: number) => ['history-links', vehicleId] as const;
export const historyLinksQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: linksKey(vehicleId),
    queryFn: () => api<HistoryLink[]>(`/vehicles/${vehicleId}/history-links`),
  });

export function useHistoryLinkAction(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ create, revoke }: { create?: HistoryLinkInput; revoke?: number }) =>
      revoke != null
        ? api<HistoryLink>(`/history-links/${revoke}`, { method: 'DELETE' })
        : api<HistoryLink>(`/vehicles/${vehicleId}/history-links`, {
            method: 'POST',
            body: JSON.stringify(create ?? {}),
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey(vehicleId) }),
  });
}
