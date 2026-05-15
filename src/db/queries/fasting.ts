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

/**
 * Update the `startedAt` of an existing session — typically the active one
 * when the user realizes after the fact that they actually started earlier
 * or later than they tapped the Start button.
 *
 * Validation:
 *   • Must be in the past (no future-dating an active session).
 *   • Must be within the last 72 hours — sane bound for corrections; past
 *     that we'd want a retroactive-log flow instead (issue #33).
 *   • If the session has an `endedAt`, the new `startedAt` must come
 *     before it.
 */
const MAX_BACKDATE_MS = 72 * 3_600_000;

export async function updateSessionStart(
  sessionId: number,
  newStartedAt: Date,
): Promise<FastingSession | null> {
  const now = new Date();
  if (newStartedAt.getTime() > now.getTime()) {
    throw new Error("Start time can't be in the future.");
  }
  if (now.getTime() - newStartedAt.getTime() > MAX_BACKDATE_MS) {
    throw new Error('Start time must be within the last 72 hours.');
  }
  // Guard against newStartedAt >= endedAt for completed sessions.
  const existing = await db
    .select()
    .from(fastingSessions)
    .where(eq(fastingSessions.id, sessionId))
    .limit(1);
  const row = existing[0];
  if (!row) return null;
  if (row.endedAt && newStartedAt.getTime() >= row.endedAt.getTime()) {
    throw new Error("Start time must come before the session's end time.");
  }

  const [updated] = await db
    .update(fastingSessions)
    .set({ startedAt: newStartedAt })
    .where(eq(fastingSessions.id, sessionId))
    .returning();
  return updated ?? null;
}

/**
 * Insert a completed past session — used when the user forgot to track a
 * fast in real time. Distinct from `startSession` (which creates an
 * *active* session) in that this one is born already `endedAt`-stamped.
 *
 * Validation:
 *   • `endedAt > startedAt`.
 *   • Both timestamps in the past.
 *   • If an active session exists, the past range must not overlap it.
 *     We treat the active session as occupying [active.startedAt, ∞).
 */
export async function logPastSession(opts: {
  startedAt: Date;
  endedAt: Date;
  targetHours: number;
  notes?: string;
}): Promise<FastingSession> {
  const now = new Date();
  if (opts.endedAt.getTime() <= opts.startedAt.getTime()) {
    throw new Error('End time must be after start time.');
  }
  if (opts.startedAt.getTime() > now.getTime() || opts.endedAt.getTime() > now.getTime()) {
    throw new Error('Past sessions must lie entirely in the past.');
  }
  if (opts.targetHours <= 0 || opts.targetHours > 72) {
    throw new Error('Target hours must be between 1 and 72.');
  }

  const active = await getActiveSession();
  if (active) {
    const overlap =
      opts.endedAt.getTime() > active.startedAt.getTime() &&
      opts.startedAt.getTime() < now.getTime();
    if (overlap) {
      throw new Error("This range overlaps the currently active session — end it first.");
    }
  }

  const [row] = await db
    .insert(fastingSessions)
    .values({
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
      targetHours: opts.targetHours,
      notes: opts.notes,
    })
    .returning();
  return row;
}
