/**
 * Reactive fasting state.
 *
 * Combines two reactivity sources:
 *   1. Drizzle's `useLiveQuery` for the active session row — re-runs when
 *      `fasting_sessions` is mutated (start/end).
 *   2. `useNow` for the elapsed counter — re-renders on a tick interval.
 *
 * Returns a stable shape so components don't have to handle "still loading"
 * differently from "no session" unless they care.
 */

import { gte, isNull, or } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { fastingSessions, type FastingSession } from '@/src/db/schema';
import { useNow } from '@/src/lib/use-now';
import {
  elapsedHours,
  elapsedMs,
  findPhase,
  nextPhase,
  startOfDay,
  ymd,
  type FastingPhase,
} from '@/src/lib/time';

export type FastingState =
  | {
      readonly status: 'idle';
      readonly session: null;
    }
  | {
      readonly status: 'active';
      readonly session: FastingSession;
      readonly elapsedMs: number;
      readonly elapsedHours: number;
      readonly targetMs: number;
      readonly progress: number; // 0..1+ (can exceed 1 past target)
      readonly currentPhase: FastingPhase;
      readonly nextPhase: FastingPhase | null;
      /** Milliseconds until the next phase boundary, or null if at last phase. */
      readonly msToNextPhase: number | null;
      /** Milliseconds until the target duration, negative when over target. */
      readonly msToTarget: number;
    };

/**
 * `tickMs` is the re-render interval. Default 1s is comfortable for a
 * detail screen with a live HH:MM:SS hero. Pass 60_000 from cards/lists.
 */
export function useFasting(tickMs: number = 1000): FastingState {
  const { data } = useLiveQuery(
    db.select().from(fastingSessions).where(isNull(fastingSessions.endedAt)).limit(1),
  );
  const now = useNow(tickMs);

  return useMemo<FastingState>(() => {
    const session = data?.[0];
    if (!session) return { status: 'idle', session: null };

    const ms = elapsedMs(session.startedAt, now);
    const hours = elapsedHours(session.startedAt, now);
    const targetMs = session.targetHours * 3_600_000;
    const phase = findPhase(hours);
    const next = nextPhase(phase);
    return {
      status: 'active',
      session,
      elapsedMs: ms,
      elapsedHours: hours,
      targetMs,
      progress: ms / targetMs,
      currentPhase: phase,
      nextPhase: next,
      msToNextPhase: next ? next.start * 3_600_000 - ms : null,
      msToTarget: targetMs - ms,
    };
  }, [data, now]);
}

/** Heatmap intensity bucket for one day's longest fast. Mirrors the design. */
export type DailyFastLevel = 0 | 1 | 2 | 3 | 4;

function levelForHours(hours: number): DailyFastLevel {
  if (hours <= 0) return 0;
  if (hours < 12) return 1;
  if (hours < 16) return 2;
  if (hours < 18) return 3;
  return 4;
}

export type FastingHistory = {
  /** Per-day level. Last entry = today. Days with no fast are level 0. */
  readonly cells: ReadonlyArray<{ date: string; level: DailyFastLevel }>;
  /** Consecutive days back from today with level ≥ 1. */
  readonly currentStreak: number;
  /** Longest run in the queried window. */
  readonly bestStreak: number;
};

/**
 * Aggregate the last `weeks * 7` days into per-day fast levels.
 *
 * Attribution rule: each session contributes to the day it *ended* — or to
 * today if it's still active. That mirrors how the design draws the
 * heatmap (today's cell reflects the in-progress session), and avoids
 * double-counting cross-midnight fasts.
 */
export function useFastingHistory(weeks: number = 14): FastingHistory {
  const today = startOfDay(new Date());
  const rangeStartMs = today.getTime() - (weeks * 7 - 1) * 86_400_000;
  const now = useNow(60_000);

  // Pull sessions that could plausibly contribute to the window:
  //   ended within range OR active (ended_at is null and probably ongoing).
  const { data } = useLiveQuery(
    db
      .select()
      .from(fastingSessions)
      .where(or(gte(fastingSessions.endedAt, new Date(rangeStartMs)), isNull(fastingSessions.endedAt))),
    [rangeStartMs],
  );

  return useMemo<FastingHistory>(() => {
    const totalDays = weeks * 7;
    const byDay = new Map<string, number>(); // ymd → max hours

    for (const s of data ?? []) {
      const end = s.endedAt ?? now;
      const hours = (end.getTime() - s.startedAt.getTime()) / 3_600_000;
      if (hours <= 0) continue;
      const key = ymd(end);
      const prev = byDay.get(key) ?? 0;
      if (hours > prev) byDay.set(key, hours);
    }

    const cells: { date: string; level: DailyFastLevel }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = ymd(d);
      const hours = byDay.get(key) ?? 0;
      cells.push({ date: key, level: levelForHours(hours) });
    }

    // streaks
    let currentStreak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].level >= 1) currentStreak++;
      else break;
    }
    let bestStreak = 0;
    let run = 0;
    for (const c of cells) {
      if (c.level >= 1) {
        run++;
        if (run > bestStreak) bestStreak = run;
      } else {
        run = 0;
      }
    }

    return { cells, currentStreak, bestStreak };
  }, [data, now, today, weeks]);
}
