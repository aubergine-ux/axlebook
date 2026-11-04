/** Query options and mutations for everything except auth and vehicles. */
import type {
  ApiToken,
  Channel,
  ChannelInput,
  DirectoryUser,
  FuelEconomyReport,
  ImportResult,
  InstanceSettings,
  LogRecord,
  Me,
  OdometerReading,
  Part,
  PartInput,
  PlanItem,
  PlanItemInput,
  RecordInput,
  RecordPage,
  Reminder,
  ReminderInput,
  Report,
  Share,
  UserAdmin,
} from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

/** Anything that changes the logbook can change garage figures, reminders and reports. */
const LOGBOOK_KEYS = [
  ['vehicles'],
  ['records'],
  ['fuel'],
  ['odometer'],
  ['reminders'],
  ['reports'],
  ['parts'],
  ['plan'],
];
function useInvalidateLogbook() {
  const qc = useQueryClient();
  return () => Promise.all(LOGBOOK_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ── Records ──────────────────────────────────────────────────────────────────

export interface RecordFilters {
  vehicleId?: number;
  kind?: string;
  tag?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}
export const recordsQuery = (f: RecordFilters) =>
  queryOptions({
    queryKey: ['records', f],
    queryFn: () => api<RecordPage>(`/records${qs({ ...f, limit: f.limit ?? 100 })}`),
    placeholderData: (prev) => prev,
  });
export const recordQuery = (id: number) =>
  queryOptions({
    queryKey: ['records', 'one', id],
    queryFn: () => api<LogRecord>(`/records/${id}`),
  });

export function useSaveRecord() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: ({ id, vehicleId, data }: { id?: number; vehicleId: number; data: RecordInput }) =>
      id
        ? api<LogRecord>(`/records/${id}`, json('PUT', data))
        : api<LogRecord>(`/vehicles/${vehicleId}/records`, json('POST', data)),
    onSuccess: invalidate,
  });
}
export function useDeleteRecord() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/records/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, file }: { recordId: number; file: File }) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api(`/records/${recordId}/attachments`, { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records'] }),
  });
}
export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records'] }),
  });
}

// ── Fuel and odometer ────────────────────────────────────────────────────────

export const fuelQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['fuel', vehicleId],
    queryFn: () => api<FuelEconomyReport>(`/vehicles/${vehicleId}/fuel-economy`),
  });
export const odometerQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['odometer', vehicleId],
    queryFn: () => api<OdometerReading[]>(`/vehicles/${vehicleId}/odometer`),
  });
export function useAddReading(vehicleId: number) {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: (data: { date: string; odometer: number; notes?: string | null }) =>
      api<OdometerReading>(`/vehicles/${vehicleId}/odometer`, json('POST', data)),
    onSuccess: invalidate,
  });
}
export function useDeleteReading() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/odometer/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ── Reminders ────────────────────────────────────────────────────────────────

export const remindersQuery = () =>
  queryOptions({ queryKey: ['reminders', 'all'], queryFn: () => api<Reminder[]>('/reminders') });
export const vehicleRemindersQuery = (vehicleId: number, archived = false) =>
  queryOptions({
    queryKey: ['reminders', vehicleId, archived],
    queryFn: () =>
      api<Reminder[]>(
        `/vehicles/${vehicleId}/reminders${qs({ archived: archived ? 'true' : undefined })}`,
      ),
  });
export function useSaveReminder() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: ({
      id,
      vehicleId,
      data,
    }: {
      id?: number;
      vehicleId: number;
      data: ReminderInput;
    }) =>
      id
        ? api<Reminder>(`/reminders/${id}`, json('PUT', data))
        : api<Reminder>(`/vehicles/${vehicleId}/reminders`, json('POST', data)),
    onSuccess: invalidate,
  });
}
export function useReminderAction() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: number;
      action: 'archive' | 'unarchive' | 'complete' | 'delete';
      body?: unknown;
    }): Promise<unknown> =>
      action === 'delete'
        ? api<void>(`/reminders/${id}`, { method: 'DELETE' })
        : api<Reminder>(`/reminders/${id}/${action}`, json('POST', body ?? {})),
    onSuccess: invalidate,
  });
}

// ── Parts and planner ────────────────────────────────────────────────────────

export const partsQuery = (vehicleId?: number) =>
  queryOptions({
    queryKey: ['parts', vehicleId ?? 'all'],
    queryFn: () => api<Part[]>(`/parts${qs({ vehicleId })}`),
  });
export function useSavePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: PartInput }) =>
      id ? api<Part>(`/parts/${id}`, json('PUT', data)) : api<Part>('/parts', json('POST', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}
export function usePartAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta }: { id: number; delta?: number }): Promise<unknown> =>
      delta === undefined
        ? api<void>(`/parts/${id}`, { method: 'DELETE' })
        : api<Part>(`/parts/${id}/adjust`, json('POST', { delta })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}
export const planQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['plan', vehicleId],
    queryFn: () => api<PlanItem[]>(`/vehicles/${vehicleId}/plan`),
  });
export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      vehicleId,
      data,
    }: {
      id?: number;
      vehicleId: number;
      data: PlanItemInput;
    }) =>
      id
        ? api<PlanItem>(`/plan/${id}`, json('PUT', data))
        : api<PlanItem>(`/vehicles/${vehicleId}/plan`, json('POST', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  });
}
export function usePlanAction() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: ({
      id,
      convert,
    }: {
      id: number;
      convert?: { date: string; odometer?: number | null; cost?: number };
    }) =>
      convert
        ? api(`/plan/${id}/convert`, json('POST', convert))
        : api<void>(`/plan/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ── Reports and sharing ──────────────────────────────────────────────────────

export const reportQuery = (p: { vehicleId?: number; from?: string; to?: string }) =>
  queryOptions({
    queryKey: ['reports', p],
    queryFn: () => api<Report>(`/reports${qs(p)}`),
    placeholderData: (prev) => prev,
  });
export const sharesQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['shares', vehicleId],
    queryFn: () => api<Share[]>(`/vehicles/${vehicleId}/shares`),
  });
export const directoryQuery = queryOptions({
  queryKey: ['directory'],
  queryFn: () => api<DirectoryUser[]>('/users/directory'),
});
export function useShare(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, permission }: { userId: number; permission: 'view' | 'edit' | null }) =>
      permission
        ? api<Share[]>(`/vehicles/${vehicleId}/shares/${userId}`, json('PUT', { permission }))
        : api<Share[]>(`/vehicles/${vehicleId}/shares/${userId}`, { method: 'DELETE' }),
    onSuccess: (shares) => qc.setQueryData(['shares', vehicleId], shares),
  });
}

// ── Import ───────────────────────────────────────────────────────────────────

export function useImportCsv(vehicleId: number) {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: (body: { csv: string; kind: string; dateOrder: 'mdy' | 'dmy'; dryRun: boolean }) =>
      api<ImportResult>(`/vehicles/${vehicleId}/import/csv`, json('POST', body)),
    onSuccess: (r) => (r.dryRun ? undefined : invalidate()),
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => api<InstanceSettings>('/settings'),
});
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InstanceSettings>) =>
      api<InstanceSettings>('/settings', json('PATCH', data)),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['settings'] }),
        qc.invalidateQueries({ queryKey: ['config'] }),
      ]),
  });
}
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api<Me>('/me', json('PATCH', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  });
}
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current?: string; next: string }) =>
      api<void>('/me/password', json('POST', data)),
  });
}
export const tokensQuery = queryOptions({
  queryKey: ['tokens'],
  queryFn: () => api<ApiToken[]>('/me/tokens'),
});
export function useTokenAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      create,
      revoke,
    }: {
      create?: string;
      revoke?: number;
    }): Promise<(ApiToken & { token: string }) | undefined> =>
      create
        ? api<ApiToken & { token: string }>('/me/tokens', json('POST', { name: create }))
        : api<undefined>(`/me/tokens/${revoke}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}
export const channelsQuery = queryOptions({
  queryKey: ['channels'],
  queryFn: () => api<Channel[]>('/me/channels'),
});
export function useChannelAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      action,
    }: {
      id?: number;
      data?: ChannelInput;
      action?: 'test' | 'delete';
    }): Promise<unknown> =>
      action === 'test'
        ? api<Channel>(`/me/channels/${id}/test`, { method: 'POST' })
        : action === 'delete'
          ? api<void>(`/me/channels/${id}`, { method: 'DELETE' })
          : id
            ? api<Channel>(`/me/channels/${id}`, json('PUT', data))
            : api<Channel>('/me/channels', json('POST', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => api<UserAdmin[]>('/users'),
});
export function useUserAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      remove,
    }: {
      id?: number;
      data?: Record<string, unknown>;
      remove?: boolean;
    }): Promise<unknown> =>
      remove
        ? api<void>(`/users/${id}`, { method: 'DELETE' })
        : id
          ? api<UserAdmin>(`/users/${id}`, json('PATCH', data))
          : api<UserAdmin>('/users', json('POST', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
export function useRestoreBackup() {
  const invalidate = useInvalidateLogbook();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api<{ restored: Record<string, number> }>('/backup/restore', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: invalidate,
  });
}
