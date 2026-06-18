/**
 * Theme — light / dark / system.
 *
 * Persists choice in localStorage. When mode is 'system', tracks the OS
 * preference live via the prefers-color-scheme media query. The resolved
 * mode (light or dark) is written to <html class="dark"> so the CSS
 * variable swap in tailwind.css's .dark block applies app-wide.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'appTheme';

const getStoredTheme = (): Theme => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* SSR / disabled storage */
  }
  return 'light';
};

const resolveActual = (mode: Theme): 'light' | 'dark' => {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyToDOM = (actual: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (actual === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = actual;
};

// Apply the persisted preference immediately on module load so first paint
// matches the choice (avoids a light→dark flash).
if (typeof window !== 'undefined') {
  applyToDOM(resolveActual(getStoredTheme()));
}

/** Cross-tab + same-tab broadcast so all useSyncExternalStore subscribers re-render. */
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
};
const broadcast = () => listeners.forEach((cb) => cb());

/**
 * Returns the *resolved* theme (light or dark) for components that need to
 * branch on the actual mode (e.g. Sonner toaster).
 *
 * Use {@link useThemeMode} when you need to know whether the user picked
 * 'system' vs 'light' / 'dark' explicitly (e.g. theme toggle UI).
 */
export function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribe,
    () => resolveActual(getStoredTheme()),
    () => 'light', // SSR fallback
  );
}

/**
 * Returns the user's *picked* mode (including 'system') and a setter.
 * Use in the theme toggle UI to render the current selection.
 */
export function useThemeMode(): [Theme, (next: Theme) => void] {
  const mode = useSyncExternalStore(
    subscribe,
    () => getStoredTheme(),
    () => 'light' as Theme,
  );

  const setMode = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyToDOM(resolveActual(next));
    broadcast();
  }, []);

  // When mode is 'system', watch OS preference changes and re-apply.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyToDOM(resolveActual('system'));
      broadcast();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  return [mode, setMode];
}
