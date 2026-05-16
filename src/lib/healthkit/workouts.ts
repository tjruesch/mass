/**
 * Workouts ↔ HealthKit adapter.
 *
 * Pull path: `syncWorkoutsFromHealthKit` pulls HK workouts since the
 * stored anchor and upserts via `addWorkoutEntry`. Deletes flow through.
 *
 * Push path: `logWorkout` writes a composite workout — one local
 * `workout_entries` row + one `saveWorkoutSample` call per step in the
 * planned type. Steps run back-to-back starting at `startedAt`. Optional
 * `kcal` is split across steps proportional to step duration.
 *
 * The HK activity per step comes from `step.hkActivityKey`. Manual
 * entries written here are dedupe-able from later HK pulls via the
 * returned UUIDs. Edit/delete of an HK-mirrored row stays local-only
 * (same precedent as weight #59).
 */

import {
  saveWorkoutSample,
  type WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

import {
  addWorkoutEntry,
  attachHealthKitUuid,
  deleteWorkoutEntryByHealthKitUuid,
} from '@/src/db/queries/workouts';
import { getPreferences as getWorkoutPreferences } from '@/src/db/queries/workout-preferences';
import {
  getWorkoutTypes,
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import type { WorkoutEntry } from '@/src/db/schema';
import { hkActivityKeyForValue, hkActivityValueForKey } from '@/src/lib/workouts/types';

import { getHkAuthState, type HkPermissionRequest } from './auth';
import { syncWorkoutType, type SyncQuantityResult } from './sync';

const WORKOUT_TYPE_IDENTIFIER = 'HKWorkoutTypeIdentifier' as const;

/**
 * Permission set for HK workouts. Stable module-level reference so the
 * auth hook keys off it cleanly without re-subscribing each render.
 */
export const WORKOUT_PERMISSIONS: HkPermissionRequest = {
  toRead: [WORKOUT_TYPE_IDENTIFIER],
  toShare: [WORKOUT_TYPE_IDENTIFIER],
};

/**
 * First-time pull bound — same 2-year window as body-mass to keep the
 * initial sync snappy. Anchored deltas after that are unbounded.
 */
const INITIAL_PULL_YEARS_BACK = 2;

function hkKeyFromActivity(activityType: WorkoutActivityType): string {
  return (
    hkActivityKeyForValue(activityType as unknown as number) ??
    `activity_${activityType}`
  );
}

/**
 * Pull HKWorkout samples from HK and upsert them locally. Skips when the
 * user has flipped off auto-import.
 */
export async function syncWorkoutsFromHealthKit(): Promise<SyncQuantityResult> {
  const prefs = await getWorkoutPreferences();
  if (!prefs.autoImportHealthKit) {
    return { inserted: 0, deleted: 0, skipped: true, dryRun: false };
  }

  const since = new Date();
  since.setFullYear(since.getFullYear() - INITIAL_PULL_YEARS_BACK);

  return syncWorkoutType({
    since,
    onWorkout: async (workout, tx) => {
      // HK reports totals as Quantity { unit, quantity }. We assume the
      // default units (kcal for energy, m for distance) — Apple Health
      // exposes them in those by default. Refine when locale issues arise.
      const kcal = workout.totalEnergyBurned?.quantity ?? null;
      const distanceM = workout.totalDistance?.quantity ?? null;
      await addWorkoutEntry(
        {
          startedAt: workout.startDate,
          endedAt: workout.endDate,
          type: hkKeyFromActivity(workout.workoutActivityType),
          kcal,
          distanceM,
          healthkitUuid: workout.uuid,
        },
        tx,
      );
    },
    onDelete: async (uuid, tx) => {
      await deleteWorkoutEntryByHealthKitUuid(uuid, tx);
    },
  });
}

/**
 * Log a composite workout. Writes one local `workout_entries` row per
 * step + one `saveWorkoutSample` per step. The returned array preserves
 * step ordering (caller indexes [0] for the primary entry).
 *
 * Total duration = sum(step.durationMin). The first step starts at
 * `startedAt`; subsequent steps chain off the previous step's end.
 *
 * `kcal` (when provided) is split across steps proportional to their
 * planned duration. `notes` is attached to the first entry only —
 * sibling entries carry no notes.
 */
export async function logWorkout(opts: {
  typeKey: string;
  startedAt: Date;
  kcal?: number | null;
  notes?: string | null;
}): Promise<ReadonlyArray<WorkoutEntry>> {
  const types = await getWorkoutTypes();
  const typeDef = types.find((t) => t.key === opts.typeKey);
  if (!typeDef) throw new Error(`Unknown workout type: ${opts.typeKey}`);
  if (typeDef.steps.length === 0) {
    throw new Error(`Workout type ${opts.typeKey} has no steps`);
  }

  const totalMin = totalPlannedMinutes(typeDef);
  const stepStartEnds = computeStepWindows(opts.startedAt, typeDef);
  const stepKcal = allocateKcal(opts.kcal ?? null, typeDef, totalMin);

  // Insert all local rows first so the user has data even if HK push
  // fails. Then push each step to HK and backfill UUIDs.
  const localEntries: WorkoutEntry[] = [];
  for (let i = 0; i < typeDef.steps.length; i++) {
    const step = typeDef.steps[i];
    const [stepStart, stepEnd] = stepStartEnds[i];
    const entry = await addWorkoutEntry({
      startedAt: stepStart,
      endedAt: stepEnd,
      type: step.hkActivityKey,
      kcal: stepKcal[i],
      // Note attached only to the first row to avoid duplication.
      notes: i === 0 ? opts.notes ?? null : null,
    });
    localEntries.push(entry);
  }

  const prefs = await getWorkoutPreferences();
  if (!prefs.autoImportHealthKit) return localEntries;
  const auth = await getHkAuthState(WORKOUT_PERMISSIONS);
  if (auth !== 'granted') return localEntries;

  // Push each step to HK. Per-step failures don't roll back local rows
  // or sibling pushes — the local mirror remains durable.
  for (let i = 0; i < typeDef.steps.length; i++) {
    const step = typeDef.steps[i];
    const [stepStart, stepEnd] = stepStartEnds[i];
    const activityValue = hkActivityValueForKey(step.hkActivityKey);
    if (activityValue === null) {
      console.warn(
        `Skipping HK push for unknown activity key: ${step.hkActivityKey}`,
      );
      continue;
    }
    const totals: { energyBurned?: number } = {};
    if (stepKcal[i] != null) totals.energyBurned = stepKcal[i]!;
    try {
      const saved = await saveWorkoutSample(
        activityValue as WorkoutActivityType,
        [],
        stepStart,
        stepEnd,
        Object.keys(totals).length > 0 ? totals : undefined,
      );
      if (saved?.uuid) {
        await attachHealthKitUuid(localEntries[i].id, saved.uuid);
        localEntries[i] = { ...localEntries[i], healthkitUuid: saved.uuid };
      }
    } catch (err) {
      console.warn(
        `Failed to write step ${i} (${step.hkActivityKey}) to HealthKit:`,
        err,
      );
    }
  }

  return localEntries;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeStepWindows(
  startedAt: Date,
  typeDef: WorkoutTypeDef,
): Array<[Date, Date]> {
  const out: Array<[Date, Date]> = [];
  let cursor = startedAt.getTime();
  for (const s of typeDef.steps) {
    const start = new Date(cursor);
    const end = new Date(cursor + s.durationMin * 60_000);
    out.push([start, end]);
    cursor = end.getTime();
  }
  return out;
}

function allocateKcal(
  totalKcal: number | null,
  typeDef: WorkoutTypeDef,
  totalMin: number,
): Array<number | null> {
  if (totalKcal == null || totalMin <= 0) {
    return typeDef.steps.map(() => null);
  }
  // Whole-kcal allocation with the rounding remainder put on the last step
  // so the sum equals the input. Avoids drift when kcal is the only metric.
  const raw = typeDef.steps.map((s) =>
    Math.round((s.durationMin / totalMin) * totalKcal),
  );
  const drift = totalKcal - raw.reduce((a, b) => a + b, 0);
  raw[raw.length - 1] += drift;
  return raw;
}
