import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'axlebook.theme';

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

const ThemeContext = createContext<{
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);

  useEffect(() => apply(theme), [theme]);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    try {
      if (t === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this session.
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
