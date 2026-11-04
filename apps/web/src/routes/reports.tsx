import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';

export const Route = createFileRoute('/reports')({ component: Page });

function Page() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.reports')} />
      <p className="text-ink-muted">{t('placeholder.comingSoon')}</p>
    </>
  );
}
