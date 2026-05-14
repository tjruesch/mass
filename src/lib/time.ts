/**
 * Fasting phase metadata. Boundaries are in hours since session start;
 * these mirror PHASES in designs/screen-fasting.jsx so the UI matches.
 */
export type FastingPhase = {
  readonly id: 'anabolic' | 'glucose' | 'fat' | 'ketosis' | 'autophagy';
  readonly short: string;
  readonly label: string;
  readonly start: number;
  readonly end: number;
};

export const FASTING_PHASES: readonly FastingPhase[] = [
  { id: 'anabolic', short: 'anabolic', label: 'Anabolic', start: 0, end: 4 },
  { id: 'glucose', short: 'glucose', label: 'Glucose', start: 4, end: 12 },
  { id: 'fat', short: 'fat burn', label: 'Fat burn', start: 12, end: 16 },
  { id: 'ketosis', short: 'ketosis', label: 'Ketosis', start: 16, end: 18 },
  { id: 'autophagy', short: 'autophagy', label: 'Autophagy', start: 18, end: 24 },
];

/** Milliseconds between `from` and `to` (defaults to now). Always positive. */
export function elapsedMs(from: Date, to: Date = new Date()): number {
  return Math.max(0, to.getTime() - from.getTime());
}

/** Whole-hours float — 14:23 elapsed → 14.383… */
export function elapsedHours(from: Date, to: Date = new Date()): number {
  return elapsedMs(from, to) / 3_600_000;
}

/**
 * Format milliseconds as "HH:MM". For elapsed counters longer than 24h we
 * keep counting (so a 30h fast reads "30:14", not "06:14") — matches how
 * fasting trackers conventionally render.
 */
export function formatHM(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** "HH:MM:SS" variant for the live ticking hero ring. */
export function formatHMS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Short relative duration — used for "1h 37m to break-fast" and similar.
 * Negative values clamp to 0.
 */
export function formatRelative(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Resolve which phase a given elapsed-hours value falls into. */
export function findPhase(hours: number): FastingPhase {
  // hours past 24 stay in the last phase
  if (hours >= 24) return FASTING_PHASES[FASTING_PHASES.length - 1];
  return FASTING_PHASES.find((p) => hours >= p.start && hours < p.end) ?? FASTING_PHASES[0];
}

/** Returns the next phase after `current`, or null if `current` is the last. */
export function nextPhase(current: FastingPhase): FastingPhase | null {
  const i = FASTING_PHASES.indexOf(current);
  return i >= 0 && i < FASTING_PHASES.length - 1 ? FASTING_PHASES[i + 1] : null;
}

/** Midnight at the start of `d`, in the local timezone. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** ISO-style local 'YYYY-MM-DD' — never UTC; we key per-day rows on this. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Day of week, Monday = 0 … Sunday = 6 (matches the heatmap grid layout). */
export function dowMondayFirst(d: Date): number {
  return (d.getDay() + 6) % 7;
}
