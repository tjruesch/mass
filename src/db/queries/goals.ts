/**
 * Goal CRUD (Slice 6).
 *
 * A goal is a multi-day program — a cut, maintain, or bulk — with a
 * start date, an optional end date, and an optional target weight.
 * The home greeting reads `day X / Y` from the active goal; trends
 * and adherence calculations downstream will too.
 *
 * Only one goal is `isActive` at a time. `markActive(id)` enforces
 * this by clearing the flag on every other row in the same
 * transaction so the screen never sees two actives during a write.
 */

import { and, desc, eq, ne } from 'drizzle-orm';

import { db } from '@/src/db';
import { goals, type Goal, type NewGoal } from '@/src/db/schema';

export type GoalKind = NonNullable<NewGoal['kind']>;

export async function addGoal(
  opts: Omit<NewGoal, 'id' | 'createdAt'>,
): Promise<Goal> {
  if (!Number.isFinite(opts.startedAt?.getTime?.() ?? 0)) {
    throw new Error('startedAt is required.');
  }
  return db.transaction(async (tx) => {
    if (opts.isActive) {
      // Single-active invariant — clear any other active rows first.
      await tx
        .update(goals)
        .set({ isActive: false })
        .where(eq(goals.isActive, true));
    }
    const [row] = await tx.insert(goals).values(opts).returning();
    return row;
  });
}

export async function updateGoal(
  id: number,
  patch: Partial<Omit<NewGoal, 'id' | 'createdAt'>>,
): Promise<Goal | null> {
  return db.transaction(async (tx) => {
    if (patch.isActive === true) {
      // Make sure no other row hangs onto the active flag.
      await tx
        .update(goals)
        .set({ isActive: false })
        .where(and(eq(goals.isActive, true), ne(goals.id, id)));
    }
    const [row] = await tx
      .update(goals)
      .set(patch)
      .where(eq(goals.id, id))
      .returning();
    return row ?? null;
  });
}

/** Mark a goal as ended without deleting it. Keeps the row around
 *  for trend / history queries; just flips isActive off. */
export async function endGoal(id: number): Promise<void> {
  await db
    .update(goals)
    .set({ isActive: false, endsAt: new Date() })
    .where(eq(goals.id, id));
}

export async function deleteGoal(id: number): Promise<void> {
  await db.delete(goals).where(eq(goals.id, id));
}

export async function getActiveGoal(): Promise<Goal | null> {
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.isActive, true))
    .limit(1);
  return rows[0] ?? null;
}

export async function getGoalById(id: number): Promise<Goal | null> {
  const rows = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listGoals(): Promise<Goal[]> {
  return db.select().from(goals).orderBy(desc(goals.startedAt));
}
