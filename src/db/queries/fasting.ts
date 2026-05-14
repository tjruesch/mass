/**
 * Fasting query + mutation surface.
 *
 * Invariant: at most one row in `fasting_sessions` has `ended_at IS NULL` at
 * any time. `startSession` enforces this by rejecting if an active session
 * already exists; the UI should disable Start while one is in flight, but
 * defense-in-depth lives here too.
 */

import { desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/src/db';
import { fastingSessions, type FastingSession } from '@/src/db/schema';

export async function getActiveSession(): Promise<FastingSession | null> {
  const rows = await db.select().from(fastingSessions).where(isNull(fastingSessions.endedAt)).limit(1);
  return rows[0] ?? null;
}

export async function startSession(opts: {
  startedAt?: Date;
  targetHours: number;
  notes?: string;
}): Promise<FastingSession> {
  const existing = await getActiveSession();
  if (existing) {
    throw new Error('A fasting session is already active; end it before starting a new one.');
  }
  const [row] = await db
    .insert(fastingSessions)
    .values({
      startedAt: opts.startedAt ?? new Date(),
      targetHours: opts.targetHours,
      notes: opts.notes,
    })
    .returning();
  return row;
}

/**
 * End the currently active session. If no session is active, this is a no-op
 * and returns null — useful when the UI offers an End button even from a
 * stale state.
 */
export async function endSession(opts: { endedAt?: Date } = {}): Promise<FastingSession | null> {
  const active = await getActiveSession();
  if (!active) return null;
  const [row] = await db
    .update(fastingSessions)
    .set({ endedAt: opts.endedAt ?? new Date() })
    .where(eq(fastingSessions.id, active.id))
    .returning();
  return row;
}

export async function listRecent(limit: number = 14): Promise<FastingSession[]> {
  return db
    .select()
    .from(fastingSessions)
    .orderBy(desc(fastingSessions.startedAt))
    .limit(limit);
}
