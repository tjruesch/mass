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
  // `short` is the bar-label form: ketosis gets only a 2-hour slice in the
  // 24h bar, so "ketosis" wraps. "keto" reads cleanly there; the header
  // and chip still use the full `label`.
  { id: 'ketosis', short: 'keto', label: 'Ketosis', start: 16, end: 18 },
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

/**
 * Same as `dowMondayFirst` but takes a local-calendar 'YYYY-MM-DD' string —
 * useful when consuming the per-day keys from `ymd()`. Parses as local
 * midnight rather than UTC so the day doesn't shift in zones west of GMT.
 */
export function dowMondayFirstFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return dowMondayFirst(new Date(y, m - 1, d));
}

/**
 * Add `n` calendar days to a Date in local time. Use this instead of
 * `new Date(d.getTime() + n * 86_400_000)`, which silently misbehaves
 * across DST boundaries — subtracting 50 fixed-ms days from a CEST
 * midnight lands at 23:00 the day before in CET, and downstream code
 * reading `.getDate()` then gets the wrong calendar day.
 *
 * `setDate()` respects DST: it always advances/retracts whole local days.
 */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// ─── Time-of-day utilities ────────────────────────────────────────────────────
// We model eating windows / clock-time inputs as minutes-since-midnight (0..1439).
// All these helpers operate purely on that integer model — they never touch
// `Date` — so they're agnostic to today's calendar position.

/**
 * Window length in minutes, treating start→end as advancing clockwise on a
 * 24-hour dial. Wrap-past-midnight windows (start > end) get the wraparound
 * portion folded in. Equal start/end is interpreted as a zero-length window.
 */
export function windowLengthMin(startMin: number, endMin: number): number {
  let length = endMin - startMin;
  if (length <= 0) length += 24 * 60;
  return length;
}

/** Normalize a minute value into [0, 1440). Negatives wrap correctly. */
export function wrapMin(min: number): number {
  const total = 24 * 60;
  return ((min % total) + total) % total;
}

/** Local clock time as minutes since midnight, e.g. 13:45 → 825. */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True when `mins` falls inside [startMin, endMin), respecting midnight wrap. */
export function isInWindow(mins: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false; // zero-length window
  if (endMin > startMin) return mins >= startMin && mins < endMin;
  // wraps midnight
  return mins >= startMin || mins < endMin;
}

/**
 * Minutes from `fromMin` forward to `targetMin`, wrapping around midnight.
 * Always returns a positive integer in (0, 1440]. If they're equal, returns
 * the full 1440 minutes (next-day occurrence).
 */
export function minutesUntil(fromMin: number, targetMin: number): number {
  let diff = targetMin - fromMin;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/** Minutes-since-midnight → "HH:MM" zero-padded. */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
