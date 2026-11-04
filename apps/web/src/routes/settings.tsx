import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { configQuery } from '../api/system';
import { PageHeader } from '../components/PageHeader';
import { type ThemePreference, useTheme } from '../theme/theme';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const config = useQuery(configQuery);

  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <section className="max-w-xl rounded-lg border border-line bg-surface p-4">
        <RadioGroup
          value={theme}
          onChange={(v) => setTheme(v as ThemePreference)}
          orientation="horizontal"
          className="flex flex-col gap-2"
        >
          <Label className="text-sm font-medium">{t('theme.label')}</Label>
          <div className="flex gap-2">
            {THEMES.map((value) => (
              <Radio
                key={value}
                value={value}
                className="cursor-pointer rounded-md border border-line-strong px-3 py-1.5 text-sm data-[focus-visible]:outline-3 data-[focus-visible]:outline-focus data-[selected]:border-accent data-[selected]:bg-accent data-[selected]:text-on-accent"
              >
                {t(`theme.${value}`)}
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </section>
      {config.data && (
        <p className="mt-6 font-mono text-xs text-muted">
          {t('settings.version', { version: config.data.version })}
        </p>
      )}
    </>
  );
}
