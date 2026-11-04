import common from '@axlebook/shared/locales/en/common.json';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const defaultNS = 'common';
export const resources = { en: { common } } as const;
export const SUPPORTED_LANGUAGES = Object.keys(resources);

function detectLanguage(): string {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const tag of candidates) {
    const base = tag.split('-')[0] ?? tag;
    if (SUPPORTED_LANGUAGES.includes(tag)) return tag;
    if (SUPPORTED_LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: 'en',
  ns: [defaultNS],
  defaultNS,
  resources,
  interpolation: { escapeValue: false },
});

export default i18n;
