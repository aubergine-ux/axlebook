import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../api/client';
import { Button } from './Button';

/** Renders loading and error states for a query, and the children once data is ready. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-ink-muted">
        {t('common.loading')}
      </p>
    );
  }
  if (query.isError) {
    const code = query.error instanceof ApiRequestError ? query.error.code : 'internal';
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg bg-red-soft p-4 text-sm text-red"
      >
        <p>{t(`errors.${code}`)}</p>
        <Button onPress={() => query.refetch()}>{t('common.retry')}</Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}
