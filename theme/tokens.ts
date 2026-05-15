/**
 * Design tokens.
 *
 * Lane 1 is the active "Mist · Petrol" palette — cool cream surfaces with
 * deep teal ink and a terracotta accent. Used by every app screen.
 *
 * Lanes 2–4 (editorial, lab, hardware) are alternate visual treatments
 * carried over from the design source; currently unused, kept around as
 * reference until the lane-decision issue resolves.
 */

export const tokens = {
  // ── Lane 1 — Mist · Petrol ──────────────────────────────────────
  // Surfaces
  bg: '#EBEFEE',
  bg2: '#DFE5E4',
  card: '#F5F8F7',
  line: '#D2DAD9',
  line2: '#BCC6C5',
  // Ink (text + foreground)
  ink: '#1B3A3D',
  ink2: '#3A5558',
  ink3: '#6A8084',
  ink4: '#9DAEB1',
  // Accents
  accent: '#FE9B61',    // soft terracotta — fills, dots, chevron tails
  accentInk: '#C55123', // deeper terracotta — text on accent + emphasis lines
  warn: '#F2823B',      // amber-orange — validation, alerts
  cool: '#48B7BD',      // muted teal — secondary hue

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
