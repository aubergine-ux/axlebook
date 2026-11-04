import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../api/client';

/** Translated API error, or nothing. */
export function ErrorNote({ error, className = '' }: { error: unknown; className?: string }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiRequestError ? error.code : 'internal';
  return (
    <p role="alert" className={`rounded-md bg-red-soft px-3 py-2 text-red ${className}`}>
      {t(`errors.${code}`)}
    </p>
  );
}
