/**
 * Reactive workout state.
 *
 *   useRecentWorkouts(limit)    — live desc list of raw HK-mirrored entries.
 *   useWorkoutsThisWeek()       — entries within this Mon→Sun (local).
 *   useLinkedSessions(limit)    — composite + ad-hoc sessions for display.
 *
 * `useLinkedSessions` is the read-side of the composite linker (#82): it
 * groups recent HK entries by their planned slot when all steps match,
 * and surfaces the rest as ad-hoc rows. Replaces the old per-entry
 * `useLinkedWorkouts` from before the composite refactor.
 */

import { and, desc, gte, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { workoutEntries, type WorkoutEntry } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import {
  linkCompositeSlot,
  plannedSlotsForWeek,
  type CompositeLinkResult,
} from '@/src/lib/workouts/link';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';

export function useRecentWorkouts(limit: number = 8): ReadonlyArray<WorkoutEntry> {
  const { data } = useLiveQuery(
    db
      .select()
      .from(workoutEntries)
      .orderBy(desc(workoutEntries.startedAt))
      .limit(limit),
  );
  return data ?? [];
}

/**
 * Discriminated union: either a composite match (one row per planned-and-
 * completed slot, grouping all matched HK entries) or an unlinked HK
 * entry (ad-hoc session that didn't satisfy any plan).
 */
export type LinkedSession =
  | {
      readonly kind: 'composite';
      readonly weekday: number;
      readonly typeKey: string;
      readonly result: CompositeLinkResult;
      readonly entries: ReadonlyArray<WorkoutEntry>; // ordered by step position
    }
  | {
      readonly kind: 'unlinked';
      readonly entry: WorkoutEntry;
    };

/**
 * Group the most recent entries into linked composite sessions + lone
 * ad-hoc entries. Linking is computed week-by-week (Mon→Sun spans) so
 * the cross-slot dedupe stays bounded — an entry can never be claimed
 * by a slot in a different week.
 */
export function useLinkedSessions(
  limit: number = 8,
): ReadonlyArray<LinkedSession> {
  const prefs = useWorkoutPreferences();
  const types = useWorkoutTypes();
  // Fetch enough entries to cover the linker's window comfortably — we
  // resolve per-week, so pull `limit * step ceiling` to be safe. Practical
  // ceiling: limit * 5 (a composite type might have up to ~5 steps).
  const rawEntries = useRecentWorkouts(Math.max(limit, limit * 5));

  return useMemo<ReadonlyArray<LinkedSession>>(() => {
    if (!prefs || types.length === 0) {
      // No prefs yet (first paint) or empty library → render every entry
      // as ad-hoc; the screen still has something to show.
      return rawEntries.slice(0, limit).map((entry) => ({
        kind: 'unlinked' as const,
        entry,
      }));
    }
    return groupEntriesIntoSessions(rawEntries, prefs, types, limit);
  }, [rawEntries, prefs, types, limit]);
}

function groupEntriesIntoSessions(
  entries: ReadonlyArray<WorkoutEntry>,
  prefs: ReturnType<typeof useWorkoutPreferences> & object,
  types: ReadonlyArray<ReturnType<typeof useWorkoutTypes>[number]>,
  limit: number,
): ReadonlyArray<LinkedSession> {
  // Group entries by ISO week so the linker has a consistent slot context.
  // Week key: monday-of-week local time, as `yyyy-mm-dd`.
  const byWeek = new Map<string, WorkoutEntry[]>();
  for (const e of entries) {
    const monday = mondayOf(e.startedAt);
    const key = monday.toISOString().slice(0, 10);
    const bucket = byWeek.get(key) ?? [];
    bucket.push(e);
    byWeek.set(key, bucket);
  }
  const slotsTemplate = plannedSlotsForWeek(prefs, types);

  const out: LinkedSession[] = [];
  // Sort weeks newest-first.
  const weekKeysDesc = [...byWeek.keys()].sort().reverse();
  for (const wk of weekKeysDesc) {
    const weekEntries = byWeek.get(wk)!;
    const consumed = new Set<number>();
    const sessions: LinkedSession[] = [];
    // Walk slots Mon → Sun so the linker is deterministic per week.
    for (let wd = 0; wd < 7; wd++) {
      const slot = slotsTemplate[wd];
      if (!slot) continue;
      const result = linkCompositeSlot(slot, weekEntries, prefs, consumed);
      if (!result) continue;
      const entryById = new Map(weekEntries.map((e) => [e.id, e] as const));
      const ordered = result.matches.map((m) => entryById.get(m.entryId)!);
      sessions.push({
        kind: 'composite',
        weekday: wd,
        typeKey: result.typeKey,
        result,
        entries: ordered,
      });
      for (const m of result.matches) consumed.add(m.entryId);
    }
    // Unlinked entries — anything in the week not consumed by a composite.
    const unlinked = weekEntries
      .filter((e) => !consumed.has(e.id))
      .map((e) => ({ kind: 'unlinked' as const, entry: e }));
    // Sort week's sessions desc by their effective timestamp.
    const weekSessions: LinkedSession[] = [...sessions, ...unlinked];
    weekSessions.sort((a, b) => sessionTime(b) - sessionTime(a));
    out.push(...weekSessions);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function sessionTime(s: LinkedSession): number {
  if (s.kind === 'composite') return s.result.spanStart.getTime();
  return s.entry.startedAt.getTime();
}

function mondayOf(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -dowMondayFirst(day));
}

/**
 * Current calendar week (Mon → next Mon, local). Returned desc so the
 * caller can render newest-first.
 */
export function useWorkoutsThisWeek(): ReadonlyArray<WorkoutEntry> {
  const today = startOfDay(new Date());
  const monday = addDays(today, -dowMondayFirst(today));
  const nextMonday = addDays(monday, 7);
  const { data } = useLiveQuery(
    db
      .select()
      .from(workoutEntries)
      .where(
        and(
          gte(workoutEntries.startedAt, monday),
          lt(workoutEntries.startedAt, nextMonday),
        ),
      )
      .orderBy(desc(workoutEntries.startedAt)),
  );
  return data ?? [];
}
