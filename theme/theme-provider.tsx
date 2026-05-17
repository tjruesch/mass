/**
 * Theme provider (#22).
 *
 * Reads the active palette id from user_preferences and exposes the
 * resolved Palette through React context. Mounted near the root in
 * app/_layout.tsx so every screen + design component can call
 * useTheme().
 */

import { createContext, useMemo, type ReactNode } from 'react';

import { useUserPreferences } from '@/src/hooks/use-user-preferences';

import { MIST_PALETTE, PALETTES, isPaletteId, type Palette, type PaletteId } from './palette';

type ThemeContextValue = {
  readonly theme: Palette;
  readonly paletteId: PaletteId;
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: MIST_PALETTE,
  paletteId: 'mist',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefs = useUserPreferences();
  const id: PaletteId = isPaletteId(prefs.prefs?.activePaletteId)
    ? prefs.prefs!.activePaletteId
    : 'mist';
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: PALETTES[id], paletteId: id }),
    [id],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
