import common from '@axlebook/shared/locales/en/common.json';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const defaultNS = 'common';
export const resources = { en: { common } } as const;

/**
 * Other languages are fetched the first time they're chosen, so English-only visitors don't
 * download them. To add one: put `locales/<code>/common.json` and `server.json` in
 * packages/shared (same keys as English; `node tools/check-locales.mjs` checks), add a loader
 * here and its name under `settings.languages`.
 */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  sq: () => import('@axlebook/shared/locales/sq/common.json'),
};
export const SUPPORTED_LANGUAGES = ['en', ...Object.keys(LOADERS)];

function detectLanguage(): string {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const tag of candidates) {
    const base = tag.split('-')[0] ?? tag;
    if (SUPPORTED_LANGUAGES.includes(tag)) return tag;
    if (SUPPORTED_LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

/** Switch the interface language, loading its strings first. Unknown codes fall back to English. */
export async function setLanguage(lang: string): Promise<void> {
  const code = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
  const load = LOADERS[code];
  if (load && !i18n.hasResourceBundle(code, defaultNS)) {
    try {
      i18n.addResourceBundle(code, defaultNS, (await load()).default, true, true);
    } catch {
      // Offline before this language was ever loaded: stay in the current one.
      return;
    }
  }
  if (i18n.language !== code) await i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: [defaultNS],
  defaultNS,
  resources,
  interpolation: { escapeValue: false },
});
// English shows at once; a browser set to another supported language switches as soon as its
// strings arrive.
const preferred = detectLanguage();
if (preferred !== 'en') void setLanguage(preferred);

export default i18n;
