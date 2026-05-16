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
import {
  hkActivityKeyForValue,
  hkActivityValueForKey,
  isDistanceTrackedActivity,
} from '@/src/lib/workouts/types';

import { getHkAuthState, type HkPermissionRequest } from './auth';
import { syncWorkoutType, type SyncQuantityResult } from './sync';
import { quantityToKcal, quantityToMeters } from './units';

const WORKOUT_TYPE_IDENTIFIER = 'HKWorkoutTypeIdentifier' as const;
const EXERCISE_TIME_IDENTIFIER = 'HKQuantityTypeIdentifierAppleExerciseTime' as const;

/**
 * Permission set for HK workouts. Stable module-level reference so the
 * auth hook keys off it cleanly without re-subscribing each render.
 *
 * Bundles in `AppleExerciseTime` as a read-side permission so the
 * home-screen move ring populates as soon as the user connects from
 * the workouts settings page — no separate auth flow for exercise time.
 * Existing installs will see a one-time re-prompt the next time they
 * tap Connect on workouts settings since HK detects the new requested
 * type.
 */
export const WORKOUT_PERMISSIONS: HkPermissionRequest = {
  toRead: [WORKOUT_TYPE_IDENTIFIER, EXERCISE_TIME_IDENTIFIER],
  toShare: [WORKOUT_TYPE_IDENTIFIER],
};

/**
 * First-time pull bound — same 2-year window as body-mass to keep the
 * initial sync snappy. Anchored deltas after that are unbounded.
 */
const INITIAL_PULL_YEARS_BACK = 2;

/**
 * Custom HK metadata key for round-tripping app-side notes. Prefixed
 * to avoid collision with Apple/third-party keys. Anyone reading HK
 * data outside of Maß can ignore it.
 */
const HK_METADATA_NOTES_KEY = 'mass_notes';

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
      // HK reports each total in the user's Health-app locale (kcal vs
      // kJ, m vs mi vs km). Normalise to canonical kcal + m before
      // persisting; unknown units → null + console warn (see #74).
      const kcal = quantityToKcal(workout.totalEnergyBurned);
      const distanceM = quantityToMeters(workout.totalDistance);
      // App-side notes survive a re-pull when we stamp them under a
      // custom metadata key on push (#76.3). Older samples won't have
      // the key — that yields null, same as a workout with no notes.
      const metadata = workout.metadata as Record<string, unknown> | null | undefined;
      const rawNotes = metadata?.[HK_METADATA_NOTES_KEY];
      const notes = typeof rawNotes === 'string' && rawNotes.trim() !== '' ? rawNotes : null;
      await addWorkoutEntry(
        {
          startedAt: workout.startDate,
          endedAt: workout.endDate,
          type: hkKeyFromActivity(workout.workoutActivityType),
          kcal,
          distanceM,
          notes,
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
  distanceM?: number | null;
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
  const stepDistance = allocateDistance(opts.distanceM ?? null, typeDef);
  const trimmedNotes =
    typeof opts.notes === 'string' && opts.notes.trim() !== '' ? opts.notes : null;

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
      distanceM: stepDistance[i],
      // Note attached only to the first row to avoid duplication.
      notes: i === 0 ? trimmedNotes : null,
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
    const totals: { energyBurned?: number; distance?: number } = {};
    if (stepKcal[i] != null) totals.energyBurned = stepKcal[i]!;
    if (stepDistance[i] != null) totals.distance = stepDistance[i]!;
    // Notes ride along on the first step so a HK re-pull preserves
    // them (#76.3). HK's metadata is per-sample, so siblings stay
    // unannotated and the first-step row is the canonical carrier.
    const metadata = i === 0 && trimmedNotes
      ? { [HK_METADATA_NOTES_KEY]: trimmedNotes }
      : undefined;
    try {
      const saved = await saveWorkoutSample(
        activityValue as WorkoutActivityType,
        [],
        stepStart,
        stepEnd,
        Object.keys(totals).length > 0 ? totals : undefined,
        metadata,
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

/**
 * Distance only applies to "moving" activities (#76.1). Skip strength
 * steps entirely — they get null, not a fractional share. The total is
 * split across distance-tracked steps proportional to their duration.
 *
 * If the user entered a distance but the type has no distance-tracked
 * step (e.g. picked Push for a manually-logged run), the param is
 * silently dropped — better than annotating a strength step with a
 * fake meters value HK doesn't accept.
 */
function allocateDistance(
  totalMeters: number | null,
  typeDef: WorkoutTypeDef,
): Array<number | null> {
  if (totalMeters == null) return typeDef.steps.map(() => null);
  const distanceSteps = typeDef.steps.filter((s) =>
    isDistanceTrackedActivity(s.hkActivityKey),
  );
  if (distanceSteps.length === 0) return typeDef.steps.map(() => null);
  const distanceTotalMin = distanceSteps.reduce((a, s) => a + s.durationMin, 0);
  // Per-step share + drift correction on the last distance-tracked step.
  const out: Array<number | null> = typeDef.steps.map((s) =>
    isDistanceTrackedActivity(s.hkActivityKey)
      ? Math.round((s.durationMin / distanceTotalMin) * totalMeters)
      : null,
  );
  const sum = out.reduce<number>((a, v) => a + (v ?? 0), 0);
  const drift = totalMeters - sum;
  // Patch the last non-null index.
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] != null) {
      out[i] = (out[i] ?? 0) + drift;
      break;
    }
  }
  return out;
}
