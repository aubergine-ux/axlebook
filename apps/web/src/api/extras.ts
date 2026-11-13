import type {
  AiStatus,
  AskAnswer,
  AssistantModel,
  AssistantTestResult,
  IftaReport,
  Inspection,
  InspectionInput,
  MaintenanceSchedule,
  MpgEstimate,
  RecordDraft,
  SpreadsheetAnalysis,
  SpreadsheetCommitResult,
  SpreadsheetPlan,
  SpreadsheetPreview,
  VehicleTips,
} from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Endpoints for local AI, schedules, tips, commercial tools, calendar and spreadsheet import. */

// ── Local AI ────────────────────────────────────────────────────────────────

export const aiStatusQuery = queryOptions({
  queryKey: ['ai', 'status'],
  queryFn: () => api<AiStatus>('/ai/status'),
  // While the model downloads, keep the progress fresh.
  refetchInterval: (q) => (q.state.data?.pullProgress != null ? 5_000 : false),
});

export const mpgEstimateQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['insights', vehicleId, 'mpg'],
    queryFn: () => api<MpgEstimate | null>(`/vehicles/${vehicleId}/insights/mpg`),
  });

export function useEstimateMpg(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<MpgEstimate>(`/vehicles/${vehicleId}/insights/mpg`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(['insights', vehicleId, 'mpg'], data),
  });
}

// ── Tips ────────────────────────────────────────────────────────────────────

export const tipsQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['insights', vehicleId, 'tips'],
    queryFn: () => api<VehicleTips>(`/vehicles/${vehicleId}/tips`),
  });

export function useAiTips(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<VehicleTips>(`/vehicles/${vehicleId}/tips/ai`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(['insights', vehicleId, 'tips'], data),
  });
}

// ── Maintenance schedule ────────────────────────────────────────────────────

export const scheduleQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['insights', vehicleId, 'schedule'],
    queryFn: () => api<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedule`),
  });

export function useTailorSchedule(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedule/tailor`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(['insights', vehicleId, 'schedule'], data),
  });
}

export interface ScheduleChoice {
  title: string;
  intervalMonths: number | null;
  intervalDistance: number | null;
  notes: string | null;
}

export function useApplySchedule(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ScheduleChoice[]) =>
      api<{ created: number }>(`/vehicles/${vehicleId}/schedule/apply`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () =>
      Promise.all(
        [['reminders'], ['insights', vehicleId], ['vehicles']].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

// ── Inspections (DVIR) and IFTA ─────────────────────────────────────────────

export const inspectionsQuery = (vehicleId: number) =>
  queryOptions({
    queryKey: ['inspections', vehicleId],
    queryFn: () => api<Inspection[]>(`/vehicles/${vehicleId}/inspections`),
  });

export function useInspectionAction(vehicleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a:
        | { kind: 'create'; data: InspectionInput }
        | { kind: 'correct'; id: number; correctedBy: string; correctionNotes: string }
        | { kind: 'delete'; id: number },
    ): Promise<unknown> => {
      if (a.kind === 'create')
        return api<Inspection>(`/vehicles/${vehicleId}/inspections`, {
          method: 'POST',
          body: JSON.stringify(a.data),
        });
      if (a.kind === 'correct')
        return api<Inspection>(`/inspections/${a.id}/correct`, {
          method: 'POST',
          body: JSON.stringify({ correctedBy: a.correctedBy, correctionNotes: a.correctionNotes }),
        });
      return api<void>(`/inspections/${a.id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspections', vehicleId] }),
  });
}

export const iftaQuery = (p: { year: number; quarter: number; vehicleId?: number }) =>
  queryOptions({
    queryKey: ['ifta', p],
    queryFn: () =>
      api<IftaReport>(
        `/ifta?year=${p.year}&quarter=${p.quarter}${p.vehicleId ? `&vehicleId=${p.vehicleId}` : ''}`,
      ),
  });

// ── Calendar feed ───────────────────────────────────────────────────────────

export const calendarQuery = queryOptions({
  queryKey: ['me', 'calendar'],
  queryFn: () => api<{ url: string | null }>('/me/calendar'),
});

export function useCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) =>
      on
        ? api<{ url: string | null }>('/me/calendar', { method: 'POST' })
        : api<void>('/me/calendar', { method: 'DELETE' }).then(() => ({ url: null })),
    onSuccess: (data) => qc.setQueryData(['me', 'calendar'], data),
  });
}

/** The feed link as an absolute URL calendar apps can subscribe to. */
export const absoluteFeedUrl = (url: string) => new URL(url, window.location.origin).toString();

// ── Spreadsheet import ──────────────────────────────────────────────────────

export function useAnalyzeSpreadsheet() {
  return useMutation({
    mutationFn: ({ file, ai }: { file: File; ai: boolean }) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api<SpreadsheetAnalysis>(`/import/spreadsheet?ai=${ai}`, {
        method: 'POST',
        body: form,
      });
    },
  });
}

export function usePreviewSpreadsheet() {
  return useMutation({
    mutationFn: ({ uploadId, plan }: { uploadId: string; plan: SpreadsheetPlan }) =>
      api<SpreadsheetPreview>(`/import/spreadsheet/${uploadId}/preview`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
  });
}

export function useForgetMapping() {
  return useMutation({
    mutationFn: (id: number) => api<void>(`/import/mappings/${id}`, { method: 'DELETE' }),
  });
}

export function useCommitSpreadsheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadId, plan }: { uploadId: string; plan: SpreadsheetPlan }) =>
      api<SpreadsheetCommitResult>(`/import/spreadsheet/${uploadId}/commit`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ── Local assistant (Ollama) ────────────────────────────────────────────────

export const assistantModelsQuery = queryOptions({
  queryKey: ['assistant', 'models'],
  queryFn: () => api<AssistantModel[]>('/assistant/models'),
});

export function useSetAssistantModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string) =>
      api<AiStatus>('/assistant/model', { method: 'PUT', body: JSON.stringify({ model }) }),
    onSuccess: (status) => qc.setQueryData(['ai', 'status'], status),
  });
}

export function useTestAssistant() {
  return useMutation({
    mutationFn: () => api<AssistantTestResult>('/assistant/test', { method: 'POST' }),
  });
}

/** Read a receipt photo into a draft. Nothing is saved. */
export function useScanReceipt() {
  return useMutation({
    mutationFn: ({ image, vehicleId }: { image: Blob; vehicleId: number | null }) => {
      const form = new FormData();
      form.append('file', image, 'receipt.jpg');
      const q = vehicleId ? `?vehicleId=${vehicleId}` : '';
      return api<RecordDraft>(`/assistant/receipt${q}`, { method: 'POST', body: form });
    },
  });
}

/** Turn a typed sentence into a draft. Nothing is saved. */
export function useQuickEntry() {
  return useMutation({
    mutationFn: (body: { text: string; vehicleId: number | null }) =>
      api<RecordDraft>('/assistant/entry', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useAskLogbook() {
  return useMutation({
    mutationFn: (question: string) =>
      api<AskAnswer>('/assistant/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  });
}
