/**
 * Minimal stub for theme. The app currently only renders in light mode.
 * If dark mode is introduced later, hook into a real theme provider here.
 */
export type Theme = 'light' | 'dark' | 'system';

export function useTheme(): Theme {
  return 'light';
}
