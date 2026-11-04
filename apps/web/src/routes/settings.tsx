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
      <section className="max-w-xl rounded-lg border border-line bg-surface-raised p-4">
        <RadioGroup
          value={theme}
          onChange={(v) => setTheme(v as ThemePreference)}
          orientation="horizontal"
          className="flex flex-col gap-2"
        >
          <Label className="text-label">{t('theme.label')}</Label>
          <div className="inline-flex w-fit gap-1 rounded-md bg-surface-sunken p-1">
            {THEMES.map((value) => (
              <Radio
                key={value}
                value={value}
                className="min-h-9 cursor-pointer rounded-sm px-3 py-1.5 text-label text-ink-muted data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-focus data-[focus-visible]:outline-solid data-[selected]:bg-surface-raised data-[selected]:text-ink data-[selected]:shadow-card"
              >
                {t(`theme.${value}`)}
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </section>
      {config.data && (
        <p className="mt-6 font-mono text-xs text-ink-muted">
          {t('settings.version', { version: config.data.version })}
        </p>
      )}
    </>
  );
}
