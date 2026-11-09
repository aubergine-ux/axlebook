import { type AuthStatus, DEFAULT_GARAGE_PREFS, type GaragePrefs, type Me } from '@axlebook/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authStatusQuery } from '../api/auth';
import { api } from '../api/client';
import { useMe } from './useMe';

type Patch = { garage?: GaragePrefs; showTips?: boolean };

/**
 * The signed-in person's view preferences (garage layout, tips), saved to their account.
 * Changes show immediately and roll back if the save fails.
 */
export function useViewPrefs() {
  const me = useMe();
  const qc = useQueryClient();
  const key = authStatusQuery.queryKey;
  const save = useMutation({
    mutationFn: (patch: Patch) =>
      api<Me>('/me', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<AuthStatus>(key);
      if (before?.user) qc.setQueryData(key, { ...before, user: { ...before.user, ...patch } });
      return { before };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(key, ctx.before);
    },
    onSuccess: (user) => {
      const now = qc.getQueryData<AuthStatus>(key);
      if (now) qc.setQueryData(key, { ...now, user });
    },
  });
  return {
    garage: me?.garage ?? DEFAULT_GARAGE_PREFS,
    showTips: me?.showTips ?? true,
    setGarage: (patch: Partial<GaragePrefs>) =>
      save.mutate({ garage: { ...(me?.garage ?? DEFAULT_GARAGE_PREFS), ...patch } }),
    setShowTips: (showTips: boolean) => save.mutate({ showTips }),
    error: save.error,
    isPending: save.isPending,
  };
}
