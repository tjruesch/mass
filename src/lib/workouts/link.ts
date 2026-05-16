/**
 * Composite-slot linker — maps actual HK workouts to planned weekly slots.
 *
 * A planned slot is one weekday + a workout type. Each type carries an
 * ordered list of steps; each step has its own HK activity + duration.
 * The linker walks the steps and tries to claim one HK entry per step
 * from a per-weekday candidate pool.
 *
 * Matching is **unordered within a window**: a step matches when an
 * unconsumed candidate has a `type` in the step's `hkCandidateKeys`
 * AND its duration is within tolerance of the step's planned duration.
 * Step order in HK doesn't have to follow the planned order.
 *
 * Returns the full composite result when EVERY step is matched. Partial
 * matches are intentionally rejected — the caller renders those entries
 * as ad-hoc (unlinked) sessions instead of a half-completed plan.
 */

import type { WorkoutEntry, WorkoutPreferences } from '@/src/db/schema';
import {
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import { dowMondayFirst, startOfDay } from '@/src/lib/time';

const DAY_MINUTES = 24 * 60;
/**
 * Per-step duration tolerance: ±25%, with a 5-minute floor so short steps
 * (e.g. a 10m warmup) aren't impossibly strict. Loose enough that a 30m
 * planned walk still matches a 22m actual one.
 */
const DURATION_TOLERANCE_PCT = 0.25;
const DURATION_TOLERANCE_FLOOR_MIN = 5;

const WEEKDAY_KEY_FIELDS: ReadonlyArray<keyof WorkoutPreferences> = [
  'monType',
  'tueType',
  'wedType',
  'thuType',
  'friType',
  'satType',
  'sunType',
];

const WEEKDAY_TIME_FIELDS: ReadonlyArray<keyof WorkoutPreferences> = [
  'monTimeMin',
  'tueTimeMin',
  'wedTimeMin',
  'thuTimeMin',
  'friTimeMin',
  'satTimeMin',
  'sunTimeMin',
];

export type PlannedSlot = {
  /** 0 = Monday … 6 = Sunday */
  readonly weekday: number;
  /** Planned slot key (matches workout_types.key). */
  readonly typeKey: string;
  /** Minutes since midnight, or null when no time was set. */
  readonly startTimeMin: number | null;
  readonly type: WorkoutTypeDef;
};

export type CompositeMatch = {
  readonly entryId: number;
  readonly stepPosition: number;
};

export type CompositeLinkResult = {
  readonly typeKey: string;
  readonly typeId: number;
  /** Parallel to `slot.type.steps` — one match per step, ordered. */
  readonly matches: ReadonlyArray<CompositeMatch>;
  /** earliest matched startedAt; latest matched endedAt. */
  readonly spanStart: Date;
  readonly spanEnd: Date;
};

/**
 * Resolve the 7 weekly slots from prefs + the available types library.
 * Returns null entries where the day is rest or the planned type key
 * is no longer present in the library (e.g. user deleted a custom type).
 */
export function plannedSlotsForWeek(
  prefs: WorkoutPreferences,
  types: ReadonlyArray<WorkoutTypeDef>,
): ReadonlyArray<PlannedSlot | null> {
  const byKey = new Map(types.map((t) => [t.key, t] as const));
  return WEEKDAY_KEY_FIELDS.map((field, idx) => {
    const key = prefs[field] as string | null;
    if (!key) return null;
    const type = byKey.get(key);
    if (!type) return null;
    const timeField = WEEKDAY_TIME_FIELDS[idx];
    return {
      weekday: idx,
      typeKey: key,
      startTimeMin: (prefs[timeField] as number | null) ?? null,
      type,
    };
  });
}

/**
 * Try to link one planned slot against a set of candidate HK entries.
 * Entries whose id is in `consumed` are skipped — the caller threads
 * this set across slots so an HK workout can't satisfy two plans.
 */
export function linkCompositeSlot(
  slot: PlannedSlot,
  candidates: ReadonlyArray<WorkoutEntry>,
  prefs: WorkoutPreferences,
  consumed: ReadonlySet<number>,
): CompositeLinkResult | null {
  const totalMin = totalPlannedMinutes(slot.type);

  // Pool: weekday-matching entries, not consumed, optionally within window.
  const pool = candidates
    .filter((e) => !consumed.has(e.id))
    .filter((e) => dowMondayFirst(startOfDay(e.startedAt)) === slot.weekday)
    .filter((e) => withinWindow(e, slot, totalMin, prefs.linkWindowMinutes))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // Greedy left-to-right: for each step in planned order, consume the
  // earliest pool entry whose type is a candidate and whose duration is
  // within tolerance. Ordering by step.position avoids the small chance
  // that step 0 steals step 2's only valid match when both could fit.
  const stepClaim = new Map<number, WorkoutEntry>();
  const claimed = new Set<number>();
  for (const step of slot.type.steps) {
    const match = pool.find(
      (e) =>
        !claimed.has(e.id) &&
        step.hkCandidateKeys.includes(e.type) &&
        durationWithin(e, step.durationMin),
    );
    if (!match) return null;
    stepClaim.set(step.position, match);
    claimed.add(match.id);
  }

  // Build result — span boundaries derived from the claimed set.
  const matchedEntries = [...stepClaim.values()];
  let spanStart = matchedEntries[0].startedAt;
  let spanEnd = matchedEntries[0].endedAt;
  for (const e of matchedEntries) {
    if (e.startedAt < spanStart) spanStart = e.startedAt;
    if (e.endedAt > spanEnd) spanEnd = e.endedAt;
  }
  return {
    typeKey: slot.typeKey,
    typeId: slot.type.id,
    matches: slot.type.steps.map((s) => ({
      entryId: stepClaim.get(s.position)!.id,
      stepPosition: s.position,
    })),
    spanStart,
    spanEnd,
  };
}

function withinWindow(
  entry: WorkoutEntry,
  slot: PlannedSlot,
  totalMin: number,
  windowMin: number,
): boolean {
  if (slot.startTimeMin === null) return true;
  const entryMin = entry.startedAt.getHours() * 60 + entry.startedAt.getMinutes();
  // Allow entries to start anywhere from `windowMin` before the planned
  // start to `totalMin + windowMin` after — i.e. inside the planned span
  // plus a buffer on each side. Midnight-wrap kept the same way as the
  // previous linker: shortest signed delta on a 24h dial.
  const planStart = slot.startTimeMin;
  const planEnd = (slot.startTimeMin + totalMin) % DAY_MINUTES;
  if (planEnd >= planStart) {
    // Non-wrapping span: entry must land within [start − w, end + w].
    return (
      entryMin >= planStart - windowMin && entryMin <= planEnd + windowMin
    );
  }
  // Wrapping span (e.g. 23:30 + 60m = 00:30): split into two ranges.
  return (
    entryMin >= planStart - windowMin || entryMin <= planEnd + windowMin
  );
}

function durationWithin(entry: WorkoutEntry, plannedMin: number): boolean {
  const actualMin =
    (entry.endedAt.getTime() - entry.startedAt.getTime()) / 60_000;
  const tolerance = Math.max(
    DURATION_TOLERANCE_FLOOR_MIN,
    plannedMin * DURATION_TOLERANCE_PCT,
  );
  return Math.abs(actualMin - plannedMin) <= tolerance;
}
