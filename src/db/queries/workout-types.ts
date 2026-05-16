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

/** Step shape coming in from the editor — same as runtime `WorkoutStep` but
 *  position is assigned in CRUD based on array order, so callers don't have
 *  to track it. Candidate keys are passed as an array; storage layer
 *  serializes to JSON. */
export type WorkoutStepInput = {
  durationMin: number;
  hkActivityKey: string;
  hkCandidateKeys: ReadonlyArray<string>;
};

/**
 * Create a new (custom) workout type with its steps in a single
 * transaction. `is_builtin` is forced to false here — the seeder is the
 * only place built-ins are written.
 */
export async function createWorkoutType(opts: {
  key: string;
  label: string;
  tone: WorkoutTypeRow['tone'];
  icon: WorkoutTypeRow['icon'];
  steps: ReadonlyArray<WorkoutStepInput>;
}): Promise<number> {
  if (opts.steps.length === 0) {
    throw new Error('A workout type needs at least one step');
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workoutTypes)
      .values({
        key: opts.key,
        label: opts.label,
        tone: opts.tone,
        icon: opts.icon,
        isBuiltin: false,
      })
      .returning({ id: workoutTypes.id });
    await tx.insert(workoutTypeSteps).values(
      opts.steps.map((s, i) => ({
        typeId: row.id,
        position: i,
        durationMin: s.durationMin,
        hkActivityKey: s.hkActivityKey,
        hkCandidateKeys: JSON.stringify(s.hkCandidateKeys),
      })),
    );
    return row.id;
  });
}

/**
 * Update the parent type's mutable fields. Steps are managed via
 * `replaceWorkoutTypeSteps` — kept separate so the editor's "save"
 * doesn't have to diff arrays.
 */
export async function updateWorkoutType(
  id: number,
  patch: Partial<{
    key: string;
    label: string;
    tone: WorkoutTypeRow['tone'];
    icon: WorkoutTypeRow['icon'];
  }>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(workoutTypes).set(patch).where(eq(workoutTypes.id, id));
}

/**
 * Replace the full steps list for a type. Simpler than diffing — the
 * editor saves rarely and the step count is tiny. Wrapped in a
 * transaction so a partial failure doesn't leave the type with zero
 * steps.
 */
export async function replaceWorkoutTypeSteps(
  typeId: number,
  steps: ReadonlyArray<WorkoutStepInput>,
): Promise<void> {
  if (steps.length === 0) {
    throw new Error('A workout type needs at least one step');
  }
  await db.transaction(async (tx) => {
    await tx.delete(workoutTypeSteps).where(eq(workoutTypeSteps.typeId, typeId));
    await tx.insert(workoutTypeSteps).values(
      steps.map((s, i) => ({
        typeId,
        position: i,
        durationMin: s.durationMin,
        hkActivityKey: s.hkActivityKey,
        hkCandidateKeys: JSON.stringify(s.hkCandidateKeys),
      })),
    );
  });
}

/**
 * Derive a kebab-case key from a free-form label. Used as the editor's
 * default key value; user can override.
 */
export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
