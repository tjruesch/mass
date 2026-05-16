/**
 * Workouts ↔ HealthKit adapter — parallels src/lib/healthkit/weight.ts
 * but for HKWorkout samples instead of body-mass quantity samples.
 *
 * Pull path: `syncWorkoutsFromHealthKit` pulls HK workouts since the
 * stored anchor and upserts via `addWorkoutEntry`. Deletes flow through
 * too.
 *
 * Push path: `logWorkout` writes a manual workout locally, then — if HK
 * auth is granted and `autoImportHealthKit` is on — pushes the same
 * workout to HK via `saveWorkoutSample` and backfills the returned UUID
 * onto the local row. The UUID linkage means a follow-up HK pull won't
 * double-count.
 *
 * The HK activity type is stored as the string enum *key* (e.g.
 * `'functionalStrengthTraining'`) in `workout_entries.type`. Pull
 * converts from the numeric enum to a key via a small inverse map; push
 * uses the canonical key listed on each library entry's `hkActivityKey`.
 * Unknown HK activities (outside the small map) are stored as
 * `activity_${num}` so the row is still rendered with a debuggable label.
 *
 * Edits / deletes on rows that already have a `healthkit_uuid` are
 * intentionally NOT mirrored back to HK in v1 — same precedent as #59.
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
import type { WorkoutEntry } from '@/src/db/schema';
import {
  WorkoutActivityKey,
  workoutTypeById,
  type WorkoutTypeId,
} from '@/src/lib/workouts/types';

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

/**
 * Inverse of `WorkoutActivityKey`: numeric HK enum value → string key.
 * Built once at module load.
 */
const HK_KEY_BY_VALUE: Record<number, string> = Object.fromEntries(
  Object.entries(WorkoutActivityKey).map(([k, v]) => [v as number, k]),
);

function hkKeyFromActivity(activityType: WorkoutActivityType): string {
  return HK_KEY_BY_VALUE[activityType as unknown as number] ?? `activity_${activityType}`;
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
      // exposes them in those by default. If a user-locale flips lb or
      // mi, the numbers might be off; refine when units arise as a real
      // problem.
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
 * Log a manual workout. Always writes locally; pushes to HK best-effort.
 *
 * The `typeId` is one of our library ids (push / pull / legs / tennis /
 * cardio). It maps to a canonical HK activity type for the push side and
 * to its own string key for the local `type` column.
 */
export async function logWorkout(opts: {
  typeId: WorkoutTypeId;
  startedAt: Date;
  endedAt: Date;
  kcal?: number | null;
  distanceM?: number | null;
  notes?: string | null;
}): Promise<WorkoutEntry> {
  const typeDef = workoutTypeById(opts.typeId);
  const entry = await addWorkoutEntry({
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
    type: typeDef.hkActivityKey,
    kcal: opts.kcal ?? null,
    distanceM: opts.distanceM ?? null,
    notes: opts.notes ?? null,
  });

  const prefs = await getWorkoutPreferences();
  if (!prefs.autoImportHealthKit) return entry;

  const auth = await getHkAuthState(WORKOUT_PERMISSIONS);
  if (auth !== 'granted') return entry;

  try {
    const activityValue = WorkoutActivityKey[typeDef.hkActivityKey];
    const totals: { energyBurned?: number; distance?: number } = {};
    if (opts.kcal != null) totals.energyBurned = opts.kcal;
    if (opts.distanceM != null) totals.distance = opts.distanceM;

    const saved = await saveWorkoutSample(
      activityValue as WorkoutActivityType,
      [],
      opts.startedAt,
      opts.endedAt,
      Object.keys(totals).length > 0 ? totals : undefined,
    );
    if (saved?.uuid) {
      await attachHealthKitUuid(entry.id, saved.uuid);
      return { ...entry, healthkitUuid: saved.uuid };
    }
    return entry;
  } catch (err) {
    // Local write is durable — only the HK mirror failed. Don't surface.
    console.warn('Failed to write workout to HealthKit:', err);
    return entry;
  }
}
