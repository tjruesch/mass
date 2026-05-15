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

import { isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { fastingSessions, type FastingSession } from '@/src/db/schema';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { useNow } from '@/src/lib/use-now';
import {
  addDays,
  dowMondayFirst,
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
  /** Per-day level for the heatmap. Last entry = today. Empty days = level 0. */
  readonly cells: ReadonlyArray<{ date: string; level: DailyFastLevel }>;
  /**
   * Consecutive days back from today on which a target-hit fast was logged,
   * **threading through scheduled-off days** (per `weekdayBitmask`). Breaks
   * on a scheduled-on day that did not hit target.
   */
  readonly currentStreak: number;
  /** Longest such run across all-time history (not bounded to `weeks`). */
  readonly bestStreak: number;
};

/**
 * Aggregate fasting history into heatmap cells and streak counts.
 *
 * Heatmap cells: windowed to the last `weeks * 7` days. Each cell's color
 * level reflects the day's *longest* fast, bucketed by absolute thresholds
 * (12h / 16h / 18h) — see `levelForHours`.
 *
 * Streak rules (issue #35):
 *   • A day extends the streak iff ≥ 1 session attributed to that day hit
 *     **its own** `targetHours` — not the user's current default.
 *   • Days flagged as scheduled-off in `fasting_preferences.weekdayBitmask`
 *     are *neutral*: they neither extend nor break the streak.
 *   • `bestStreak` is computed across **all** sessions in the DB, not just
 *     the windowed cells, so a 50-day run from a year ago still surfaces.
 *
 * Attribution rule: a session contributes to the calendar day its `endedAt`
 * falls on (or today, if still active).
 */
export function useFastingHistory(weeks: number = 14): FastingHistory {
  const today = startOfDay(new Date());
  const now = useNow(60_000);
  const prefs = useFastingPreferences();

  // All-time sessions — needed for the all-time bestStreak (and the windowed
  // heatmap is a cheap derivation of the same data).
  const { data } = useLiveQuery(db.select().from(fastingSessions));

  return useMemo<FastingHistory>(() => {
    const sessions = data ?? [];
    const totalDays = weeks * 7;

    // Per-day aggregation:
    //   longestHours  → heatmap color bucket
    //   targetHit     → true iff ANY session attributed to that day hit its
    //                   own target. Streak math reads this; heatmap doesn't.
    const byDay = new Map<string, { longestHours: number; targetHit: boolean }>();
    for (const s of sessions) {
      const end = s.endedAt ?? now;
      const hours = (end.getTime() - s.startedAt.getTime()) / 3_600_000;
      if (hours <= 0) continue;
      const key = ymd(end);
      const prev = byDay.get(key) ?? { longestHours: 0, targetHit: false };
      byDay.set(key, {
        longestHours: Math.max(prev.longestHours, hours),
        targetHit: prev.targetHit || hours >= s.targetHours,
      });
    }

    // ── Heatmap cells (windowed) ─────────────────────────────────────────
    // `addDays` walks local calendar days; ms-arithmetic would drift one
    // calendar day around DST shifts (e.g. CET→CEST) and corrupt the keys.
    const cells: { date: string; level: DailyFastLevel }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = ymd(d);
      cells.push({ date: key, level: levelForHours(byDay.get(key)?.longestHours ?? 0) });
    }

    // ── Streak math ──────────────────────────────────────────────────────
    // Default all-on while preferences are still loading — better to over-
    // count slightly for one render than to silently swallow days.
    const bitmask = prefs?.weekdayBitmask ?? 0b1111111;
    const isScheduledOn = (d: Date) => (bitmask & (1 << dowMondayFirst(d))) !== 0;

    // Cheap bound for the loops: don't walk further back than the earliest
    // session in the DB.
    const earliestSession =
      sessions.length === 0
        ? null
        : startOfDay(new Date(Math.min(...sessions.map((s) => s.startedAt.getTime()))));

    let currentStreak = 0;
    if (earliestSession) {
      for (let cursor = today; cursor.getTime() >= earliestSession.getTime(); cursor = addDays(cursor, -1)) {
        if (!isScheduledOn(cursor)) continue; // neutral
        if (byDay.get(ymd(cursor))?.targetHit) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    let bestStreak = 0;
    if (earliestSession) {
      let run = 0;
      for (let cursor = earliestSession; cursor.getTime() <= today.getTime(); cursor = addDays(cursor, 1)) {
        if (!isScheduledOn(cursor)) continue; // neutral
        if (byDay.get(ymd(cursor))?.targetHit) {
          run++;
          if (run > bestStreak) bestStreak = run;
        } else {
          run = 0;
        }
      }
    }

    return { cells, currentStreak, bestStreak };
  }, [data, prefs, now, today, weeks]);
}
