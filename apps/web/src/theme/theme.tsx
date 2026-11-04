import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'axlebook.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
}

/** data-theme is always "light" or "dark"; "system" is resolved here. */
function apply(theme: ThemePreference) {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
}

const ThemeContext = createContext<{
  theme: ThemePreference;
  /** `persist: false` applies a theme without recording it as this device's own choice. */
  setTheme: (t: ThemePreference, opts?: { persist?: boolean }) => void;
  /** Whether this browser has an explicit choice saved. */
  hasLocalChoice: boolean;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const [hasLocalChoice, setHasLocalChoice] = useState(() => readStored() !== 'system');

  useEffect(() => {
    apply(theme);
    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemePreference, opts: { persist?: boolean } = {}) => {
    setThemeState(t);
    if (opts.persist === false) return;
    setHasLocalChoice(t !== 'system');
    try {
      if (t === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this session.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, hasLocalChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
