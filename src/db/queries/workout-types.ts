/**
 * Workout types library — CRUD + seed for the composite-types model (#82).
 *
 * A type is one row in `workout_types` plus N rows in `workout_type_steps`.
 * The accessor joins them into a single `WorkoutTypeDef` shape that callers
 * use without touching SQL directly.
 *
 * Seeding policy: the 5 built-ins (push/pull/legs/tennis/cardio) are
 * upserted to id-less single-step routines on first read, matching what
 * Slice 4 shipped before the refactor. Customizing them, or adding new
 * types, comes from #72 — those don't have `is_builtin` set.
 */

import { asc, eq } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  workoutTypeSteps,
  workoutTypes,
  type WorkoutTypeRow,
  type WorkoutTypeStepRow,
} from '@/src/db/schema';

/** Compact step shape exposed to UI / linker / HK adapter. */
export type WorkoutStep = {
  readonly position: number;
  readonly durationMin: number;
  readonly hkActivityKey: string;
  readonly hkCandidateKeys: ReadonlyArray<string>;
};

export type WorkoutTypeDef = {
  readonly id: number;
  readonly key: string;
  readonly label: string;
  readonly tone: WorkoutTypeRow['tone'];
  readonly icon: WorkoutTypeRow['icon'];
  readonly isBuiltin: boolean;
  readonly steps: ReadonlyArray<WorkoutStep>;
};

/**
 * Built-in seed definitions. Each is a single-step composite — the user can
 * later expand them via the (deferred) custom-types editor in #72 without
 * losing back-references from existing planned slots.
 */
const BUILTIN_SEEDS: ReadonlyArray<{
  key: string;
  label: string;
  tone: WorkoutTypeRow['tone'];
  icon: WorkoutTypeRow['icon'];
  steps: ReadonlyArray<Omit<WorkoutStep, 'position'>>;
}> = [
  {
    key: 'push',
    label: 'Push',
    tone: 'ink',
    icon: 'lift',
    steps: [
      {
        durationMin: 60,
        hkActivityKey: 'functionalStrengthTraining',
        hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
      },
    ],
  },
  {
    key: 'pull',
    label: 'Pull',
    tone: 'ink',
    icon: 'lift',
    steps: [
      {
        durationMin: 60,
        hkActivityKey: 'functionalStrengthTraining',
        hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
      },
    ],
  },
  {
    key: 'legs',
    label: 'Legs',
    tone: 'ink',
    icon: 'lift',
    steps: [
      {
        durationMin: 60,
        hkActivityKey: 'functionalStrengthTraining',
        hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
      },
    ],
  },
  {
    key: 'tennis',
    label: 'Tennis',
    tone: 'accent',
    icon: 'tennis',
    steps: [
      {
        durationMin: 60,
        hkActivityKey: 'tennis',
        hkCandidateKeys: ['tennis'],
      },
    ],
  },
  {
    key: 'cardio',
    label: 'Cardio',
    tone: 'cool',
    icon: 'walk',
    steps: [
      {
        durationMin: 45,
        hkActivityKey: 'walking',
        hkCandidateKeys: ['walking', 'running', 'cycling'],
      },
    ],
  },
];

/**
 * Idempotent seed. Inserts the built-ins only when the table is empty.
 * Designed to be called from app bootstrap (parallel to the preference
 * seeders in app/_layout.tsx). Running it again is a no-op.
 */
export async function seedBuiltinWorkoutTypes(): Promise<void> {
  const existing = await db.select({ id: workoutTypes.id }).from(workoutTypes).limit(1);
  if (existing.length > 0) return;

  await db.transaction(async (tx) => {
    for (const seed of BUILTIN_SEEDS) {
      const [row] = await tx
        .insert(workoutTypes)
        .values({
          key: seed.key,
          label: seed.label,
          tone: seed.tone,
          icon: seed.icon,
          isBuiltin: true,
        })
        .returning({ id: workoutTypes.id });
      await tx.insert(workoutTypeSteps).values(
        seed.steps.map((s, i) => ({
          typeId: row.id,
          position: i,
          durationMin: s.durationMin,
          hkActivityKey: s.hkActivityKey,
          hkCandidateKeys: JSON.stringify(s.hkCandidateKeys),
        })),
      );
    }
  });
}

/**
 * Load all types with their steps. The result is ordered by
 * `workout_types.id` (insertion order — built-ins first) and each type's
 * steps are ordered by `position`.
 */
export async function getWorkoutTypes(
  client: DbClient = db,
): Promise<ReadonlyArray<WorkoutTypeDef>> {
  const types = await client.select().from(workoutTypes).orderBy(asc(workoutTypes.id));
  if (types.length === 0) return [];
  const stepRows = await client
    .select()
    .from(workoutTypeSteps)
    .orderBy(asc(workoutTypeSteps.typeId), asc(workoutTypeSteps.position));
  return composeTypes(types, stepRows);
}

/**
 * Internal join helper — exposed for the hook that does its own live queries
 * (it can't reuse the async `getWorkoutTypes` directly since live queries
 * return rows from each table independently).
 */
export function composeTypes(
  types: ReadonlyArray<WorkoutTypeRow>,
  stepRows: ReadonlyArray<WorkoutTypeStepRow>,
): ReadonlyArray<WorkoutTypeDef> {
  const stepsByType = new Map<number, WorkoutStep[]>();
  for (const r of stepRows) {
    const list = stepsByType.get(r.typeId) ?? [];
    list.push({
      position: r.position,
      durationMin: r.durationMin,
      hkActivityKey: r.hkActivityKey,
      hkCandidateKeys: parseCandidates(r.hkCandidateKeys),
    });
    stepsByType.set(r.typeId, list);
  }
  return types.map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    tone: t.tone,
    icon: t.icon,
    isBuiltin: t.isBuiltin,
    steps: (stepsByType.get(t.id) ?? []).sort((a, b) => a.position - b.position),
  }));
}

function parseCandidates(json: string): ReadonlyArray<string> {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Sum of step durations — used as the planned duration of the type. */
export function totalPlannedMinutes(def: WorkoutTypeDef): number {
  let total = 0;
  for (const s of def.steps) total += s.durationMin;
  return total;
}

/** O(N) lookup — N is at most a handful, so no Map indirection needed. */
export function findTypeByKey(
  types: ReadonlyArray<WorkoutTypeDef>,
  key: string | null,
): WorkoutTypeDef | null {
  if (key === null) return null;
  return types.find((t) => t.key === key) ?? null;
}

/** Delete a non-builtin type by id. Builtins can't be deleted via this. */
export async function deleteWorkoutType(id: number): Promise<void> {
  await db.delete(workoutTypes).where(eq(workoutTypes.id, id));
}
