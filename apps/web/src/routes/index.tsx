import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';

export const Route = createFileRoute('/')({ component: GaragePage });

function GaragePage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('garage.title')} />
      <p className="rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center text-muted">
        {t('garage.empty')}
      </p>
    </>
  );
}
