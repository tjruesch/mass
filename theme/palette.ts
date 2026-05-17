/**
 * Palettes (#22).
 *
 * Every palette implements the same `Palette` shape so the rest of
 * the app can read the same property names regardless of which one
 * is active. Components use `useTheme()` to get the current palette
 * — at module load `tokens` (default Mist · Petrol) remains exported
 * for static utility purposes (constants, design helpers).
 *
 * Naming:
 *   surfaces    — bg, bg2 (subtle), card, line, line2 (stronger)
 *   ink         — ink (primary), ink2, ink3, ink4 (lightest)
 *   accents     — accent (filled tint), accentInk (emphasis text)
 *   semantic    — warn (validation), cool (secondary hue)
 */

export type PaletteId = 'mist' | 'editorial' | 'lab' | 'hardware';

export type Palette = {
  // Surfaces
  readonly bg: string;
  readonly bg2: string;
  readonly card: string;
  readonly line: string;
  readonly line2: string;
  // Ink
  readonly ink: string;
  readonly ink2: string;
  readonly ink3: string;
  readonly ink4: string;
  // Accents
  readonly accent: string;
  readonly accentInk: string;
  readonly warn: string;
  readonly cool: string;
};

/** Default 'Mist · Petrol' — verbatim from the original tokens. */
export const MIST_PALETTE: Palette = {
  bg: '#EBEFEE',
  bg2: '#DFE5E4',
  card: '#F5F8F7',
  line: '#D2DAD9',
  line2: '#BCC6C5',
  ink: '#1B3A3D',
  ink2: '#3A5558',
  ink3: '#6A8084',
  ink4: '#9DAEB1',
  accent: '#FE9B61',
  accentInk: '#C55123',
  warn: '#F2823B',
  cool: '#48B7BD',
};

/** 'Editorial' — warm paper, red accent. Lifted from the lane-2 sketch. */
export const EDITORIAL_PALETTE: Palette = {
  bg: '#F4F1EA',
  bg2: '#D9D2C3',
  card: '#FBF8F1',
  line: '#D9D2C3',
  line2: '#C4BBA9',
  ink: '#16140F',
  ink2: '#3D362B',
  ink3: '#6B6258',
  ink4: '#9A9387',
  accent: '#B8311C',
  accentInk: '#8A2515',
  warn: '#B8311C',
  cool: '#8A6D3B',
};

/** 'Lab plotter' — cool-cream paper, blue accent. Lane-3 sketch. */
export const LAB_PALETTE: Palette = {
  bg: '#EFECDF',
  bg2: '#D8D3C0',
  card: '#F6F2E6',
  line: '#D8D3C0',
  line2: '#EBE6D6',
  ink: '#1A1D22',
  ink2: '#3D424A',
  ink3: '#6A7079',
  ink4: '#9CA0A6',
  accent: '#1B5E78',
  accentInk: '#134258',
  warn: '#A03A24',
  cool: '#B07A2C',
};

/** 'Dark hardware' — dark panels, chartreuse glow. Lane-4 sketch. */
export const HARDWARE_PALETTE: Palette = {
  bg: '#0A0B0C',
  bg2: '#1A1D20',
  card: '#131517',
  line: '#232629',
  line2: '#4A4E54',
  ink: '#F2F2EE',
  ink2: '#C8C7C2',
  ink3: '#7C8086',
  ink4: '#5A5D63',
  accent: '#DADA00',
  accentInk: '#DADA00',
  warn: '#E8503A',
  cool: '#25AFD2',
};

export const PALETTES: Record<PaletteId, Palette> = {
  mist: MIST_PALETTE,
  editorial: EDITORIAL_PALETTE,
  lab: LAB_PALETTE,
  hardware: HARDWARE_PALETTE,
};

export const PALETTE_LABELS: Record<PaletteId, string> = {
  mist: 'Mist · Petrol',
  editorial: 'Editorial',
  lab: 'Lab',
  hardware: 'Hardware',
};

export function isPaletteId(v: unknown): v is PaletteId {
  return v === 'mist' || v === 'editorial' || v === 'lab' || v === 'hardware';
}
