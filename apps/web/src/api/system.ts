import type { PublicConfig } from '@axlebook/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './client';

export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: () => api<PublicConfig>('/config'),
  staleTime: 5 * 60_000,
});
