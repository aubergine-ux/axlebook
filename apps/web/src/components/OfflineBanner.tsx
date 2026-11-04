import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const { t } = useTranslation();
  if (useOnline()) return null;
  return (
    <p
      role="status"
      className="bg-yellow-soft px-4 py-2 text-center text-caption font-semibold text-yellow"
    >
      {t('common.offline')}
    </p>
  );
}
