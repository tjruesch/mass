/**
 * Reactive water state.
 *
 * Two hooks:
 *   - `useWaterToday`: today's sips + summed ml. Live via Drizzle's
 *     `useLiveQuery` on `water_logs` filtered to the local day.
 *   - `useWaterHistory(weeks)`: per-day heatmap cells + current/best streak
 *     using the same scheduled-day / target-hit semantics as fasting.
 *
 * All three kinds (water/tea/coffee) count 100% toward the goal — the
 * previous partial-counting logic was removed at the user's request, since
 * the friction of remembering which kind to log outweighed the accuracy.
 */

import { and, gte, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { type HeatLevel } from '@/components/design/streak-heatmap';
import { db } from '@/src/db';
import { waterLogs, type WaterLog } from '@/src/db/schema';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { useNow } from '@/src/lib/use-now';
import { addDays, dowMondayFirst, startOfDay, ymd } from '@/src/lib/time';

export type WaterTodayState = {
  readonly sips: ReadonlyArray<WaterLog>;
  /** Total ml across all sips today — every kind counts equally. */
  readonly totalMl: number;
  /** Convenience: `totalMl / preferences.targetMl`, clamped at 0+ (can exceed 1). */
  readonly progress: number;
  /** When the most recent sip was logged, or null if none today. */
  readonly lastSipAt: Date | null;
};

export function useWaterToday(): WaterTodayState {
  const prefs = useWaterPreferences();
  // Day window — `startOfDay` is computed once per hook call. That means the
  // window doesn't auto-roll at local midnight unless the component re-mounts
  // or some other state changes. Acceptable for v1 since the app is in the
  // foreground for short bursts; if we ever surface this on a long-running
  // screen, recompute on a midnight tick.
  const dayStart = startOfDay(new Date());
  const dayEnd = addDays(dayStart, 1);

  const { data } = useLiveQuery(
    db
      .select()
      .from(waterLogs)
      .where(and(gte(waterLogs.at, dayStart), lt(waterLogs.at, dayEnd))),
  );

  return useMemo<WaterTodayState>(() => {
    const sips = (data ?? []).slice().sort((a, b) => b.at.getTime() - a.at.getTime());
    let totalMl = 0;
    for (const s of sips) totalMl += s.ml;
    const target = prefs?.targetMl ?? 3000;
    return {
      sips,
      totalMl,
      progress: target > 0 ? totalMl / target : 0,
      lastSipAt: sips[0]?.at ?? null,
    };
  }, [data, prefs]);
}

/**
 * Heatmap bucket for one day's total ml against target.
 * Aliased to the shared `HeatLevel` so cells flow directly into `StreakHeatmap`.
 */
export type DailyWaterLevel = HeatLevel;

function levelForRatio(ratio: number): DailyWaterLevel {
  if (ratio <= 0) return 0;
  if (ratio < 0.5) return 1;
  if (ratio < 0.75) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export type WaterHistory = {
  /** Per-day level for the heatmap. Last entry = today. */
  readonly cells: ReadonlyArray<{ date: string; level: DailyWaterLevel }>;
  /**
   * Consecutive days back from today where counted ≥ target, threading through
   * scheduled-off days (per `weekdayBitmask`). Breaks on a scheduled-on day
   * that didn't hit target.
   */
  readonly currentStreak: number;
  /** Longest such run across all-time. */
  readonly bestStreak: number;
};

/**
 * Aggregate water logs into heatmap cells + streak counts.
 *
 * Mirrors `useFastingHistory` deliberately so the visuals match. Attribution:
 * a sip contributes to the calendar day its `at` falls on.
 */
export function useWaterHistory(weeks: number = 14): WaterHistory {
  const today = startOfDay(new Date());
  // 60s ticker so the "today" cell flips bucket as sips come in. Sips arrive
  // via the live query anyway, but the ticker also catches the date roll at
  // midnight without requiring extra plumbing.
  const _now = useNow(60_000);
  const prefs = useWaterPreferences();
  const { data } = useLiveQuery(db.select().from(waterLogs));

  return useMemo<WaterHistory>(() => {
    const sips = data ?? [];
    const totalDays = weeks * 7;
    const target = prefs?.targetMl ?? 3000;

    // Aggregate ml per day. All kinds count equally; partial-counting was
    // removed (see file header).
    const byDay = new Map<string, number>();
    for (const s of sips) {
      const key = ymd(s.at);
      const prev = byDay.get(key) ?? 0;
      byDay.set(key, prev + s.ml);
    }

    // Heatmap window — addDays for DST-safe calendar walking.
    const cells: { date: string; level: DailyWaterLevel }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = ymd(d);
      const counted = byDay.get(key) ?? 0;
      cells.push({ date: key, level: levelForRatio(target > 0 ? counted / target : 0) });
    }

    const bitmask = prefs?.weekdayBitmask ?? 0b1111111;
    const isScheduledOn = (d: Date) => (bitmask & (1 << dowMondayFirst(d))) !== 0;
    const hit = (d: Date) => (byDay.get(ymd(d)) ?? 0) >= target;

    const earliestSip =
      sips.length === 0
        ? null
        : startOfDay(new Date(Math.min(...sips.map((s) => s.at.getTime()))));

    let currentStreak = 0;
    if (earliestSip) {
      for (
        let cursor = today;
        cursor.getTime() >= earliestSip.getTime();
        cursor = addDays(cursor, -1)
      ) {
        if (!isScheduledOn(cursor)) continue;
        if (hit(cursor)) currentStreak++;
        else break;
      }
    }

    let bestStreak = 0;
    if (earliestSip) {
      let run = 0;
      for (
        let cursor = earliestSip;
        cursor.getTime() <= today.getTime();
        cursor = addDays(cursor, 1)
      ) {
        if (!isScheduledOn(cursor)) continue;
        if (hit(cursor)) {
          run++;
          if (run > bestStreak) bestStreak = run;
        } else {
          run = 0;
        }
      }
    }

    return { cells, currentStreak, bestStreak };
  }, [data, prefs, today, weeks, _now]);
}
