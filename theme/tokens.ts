/**
 * Design tokens — pixel-faithful port of designs/tokens.css.
 *
 * Lane 1 is the default paper/ink palette used by most app screens.
 * Lanes 2–4 (editorial, lab, hardware) are alternate visual treatments
 * referenced by lab-* and hardware demo screens.
 *
 * oklch() colors from the source have been converted to sRGB hex so they
 * work natively in React Native style props.
 */

export const tokens = {
  // ── Lane 1 — default (paper / ink) ──────────────────────────────
  bg: '#FAFAF7',
  bg2: '#F2F2EE',
  card: '#FFFFFF',
  ink: '#14140F',
  ink2: '#3A3A33',
  ink3: '#6B6B62',
  ink4: '#9C9C92',
  line: '#E8E8E0',
  line2: '#D8D8CE',
  accent: '#7EBA27',    // oklch(72% 0.18 130) — lime
  accentInk: '#304C03', // oklch(38% 0.10 130)
  warn: '#E58212',      // oklch(70% 0.16 60)  — amber
  cool: '#54AAD1',      // oklch(70% 0.10 230) — steel blue

  // ── Lane 2 — editorial ──────────────────────────────────────────
  edBg: '#F4F1EA',
  edPaper: '#FBF8F1',
  edInk: '#16140F',
  edMute: '#6B6258',
  edLine: '#2A251E',
  edRule: '#D9D2C3',
  edRed: '#B8311C',

  // ── Lane 3 — lab plotter ────────────────────────────────────────
  labBg: '#EFECDF',
  labPaper: '#F6F2E6',
  labGrid: '#D8D3C0',
  labGrid2: '#EBE6D6',
  labInk: '#1A1D22',
  labMute: '#6A7079',
  labMute2: '#9CA0A6',
  labCyan: '#1B5E78',
  labRed: '#A03A24',
  labAmber: '#B07A2C',

  // ── Lane 4 — dark hardware ──────────────────────────────────────
  hwBg: '#0A0B0C',
  hwPanel: '#131517',
  hwPanel2: '#1A1D20',
  hwLine: '#232629',
  hwInk: '#F2F2EE',
  hwMute: '#7C8086',
  hwMute2: '#4A4E54',
  hwGlow: '#DADA00',    // oklch(86% 0.20 110) — chartreuse
  hwCool: '#25AFD2',    // oklch(70% 0.12 220)
} as const;

export type TokenName = keyof typeof tokens;

/**
 * Font family identifiers. These must match the names registered with
 * expo-font in app/_layout.tsx — when you change one, change both.
 */
export const fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

/**
 * Recurring text style fragments lifted from the design source.
 * Use as spread mixins on Text components.
 */
import type { TextStyle } from 'react-native';

export const textStyles = {
  /** Tabular numerics — pair with mono for aligned metrics like 14:23 / 174.2 */
  tnum: {
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  /** Caps + wide tracking, used for the "ELAPSED", "KCAL", "FAST" labels */
  cap: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  } satisfies TextStyle,
};
