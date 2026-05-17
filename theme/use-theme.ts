/**
 * Hooks for reading the active palette (#22).
 *
 *   - `useTheme()` returns the current `Palette`. Use for inline
 *     SVG fills, accent colours, etc.
 *   - `useThemeStyles(makeStyles)` returns a memoized StyleSheet
 *     keyed on the active palette so theme switches reflow styles
 *     immediately. Components should define styles via a
 *     `makeStyles(theme: Palette) => StyleSheet` factory.
 */

import { useContext, useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { ThemeContext } from './theme-provider';
import type { Palette } from './palette';

export type NamedStyles<T> = {
  [K in keyof T]: ViewStyle | TextStyle | ImageStyle;
};

export function useTheme(): Palette {
  return useContext(ThemeContext).theme;
}

export function useThemeStyles<T extends NamedStyles<T>>(
  makeStyles: (theme: Palette) => T,
): { theme: Palette; styles: T } {
  const { theme } = useContext(ThemeContext);
  const styles = useMemo(() => makeStyles(theme), [theme, makeStyles]);
  return { theme, styles };
}
