import type { AuthStatus, Me } from '@axlebook/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { withBase } from '../lib/base';
import { api } from './client';

export const authStatusQuery = queryOptions({
  queryKey: ['auth', 'status'],
  queryFn: () => api<AuthStatus>('/auth/status'),
  staleTime: 60_000,
});

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<Me>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string; displayName?: string }) =>
      api<Me>('/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      window.location.assign(withBase('/login'));
    },
  });
}
