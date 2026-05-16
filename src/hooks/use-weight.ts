/**
 * Reactive weight hooks.
 *
 *   useLatestWeight — live latest entry, or null.
 *   useWeightHistory({ days }) — entries asc, with 7-day moving average
 *     attached per-entry plus a `sevenDayDelta` rollup. Drives the stat
 *     hero and feeds the chart.
 */

import { desc, gte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { type HeatLevel } from '@/components/design/streak-heatmap';
import { db } from '@/src/db';
import { weightEntries, type WeightEntry } from '@/src/db/schema';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useNow } from '@/src/lib/use-now';
import { addDays, dowMondayFirst, startOfDay, ymd } from '@/src/lib/time';

/** Live latest weight entry, or null if no entries yet. */
export function useLatestWeight(): WeightEntry | null {
  const { data } = useLiveQuery(
    db.select().from(weightEntries).orderBy(desc(weightEntries.at)).limit(1),
  );
  return data?.[0] ?? null;
}

/**
 * Live recent weigh-ins (desc). Sized for the "recent entries" list on
 * the weight screen — default 8 rows covers ~a week of daily logging
 * without bleeding into the heatmap below.
 */
export function useRecentWeightEntries(limit: number = 8): ReadonlyArray<WeightEntry> {
  const { data } = useLiveQuery(
    db.select().from(weightEntries).orderBy(desc(weightEntries.at)).limit(limit),
  );
  return data ?? [];
}

export type WeightHistoryPoint = {
  /** Original entry. */
  readonly entry: WeightEntry;
  /** 7-day trailing moving average ending at this entry's day, in kg. */
  readonly ma: number;
};

export type WeightHistory = {
  /** Entries in chronological order (ascending). */
  readonly points: ReadonlyArray<WeightHistoryPoint>;
  /** Latest entry's kg, or null if the window is empty. */
  readonly latestKg: number | null;
  /** Latest entry's 7-day MA, or null. */
  readonly latestMa: number | null;
  /**
   * Signed kg delta of `latestMa` vs the MA at the latest-minus-7-days
   * point — answers "how much did the moving average shift over the last
   * week?". Null when the window doesn't contain ≥2 points spanning a week.
   */
  readonly sevenDayDelta: number | null;
};

/**
 * Compute history for the last `days` calendar days (default 90). Each
 * point's MA is computed against a trailing 7-calendar-day window of
 * available entries, so missed days don't artificially flatten the curve.
 */
export function useWeightHistory({ days = 90 }: { days?: number } = {}): WeightHistory {
  const since = addDays(startOfDay(new Date()), -(days - 1));
  const { data } = useLiveQuery(
    db
      .select()
      .from(weightEntries)
      .where(gte(weightEntries.at, since))
      .orderBy(desc(weightEntries.at)),
  );

  return useMemo<WeightHistory>(() => {
    const rows = data ?? [];
    if (rows.length === 0) {
      return { points: [], latestKg: null, latestMa: null, sevenDayDelta: null };
    }
    // useLiveQuery returns desc; the chart wants asc. Flip a copy.
    const asc = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());

    // 7-day trailing MA per point. We look at the prior `MA_WINDOW_MS`
    // window of entries (inclusive of the current one) rather than the
    // last 6 entries — handles irregular logging cadence cleanly.
    const MA_WINDOW_MS = 7 * 24 * 3_600_000;
    const points: WeightHistoryPoint[] = asc.map((entry) => {
      const windowStart = entry.at.getTime() - MA_WINDOW_MS;
      let sum = 0;
      let count = 0;
      for (const e of asc) {
        const t = e.at.getTime();
        if (t > entry.at.getTime()) break;
        if (t < windowStart) continue;
        sum += e.kg;
        count++;
      }
      return { entry, ma: count > 0 ? sum / count : entry.kg };
    });

    const latest = points[points.length - 1];
    // Find the MA point closest to (latest.at - 7d) for the rollup delta.
    const targetTime = latest.entry.at.getTime() - MA_WINDOW_MS;
    let prior: WeightHistoryPoint | null = null;
    for (let i = points.length - 2; i >= 0; i--) {
      const t = points[i].entry.at.getTime();
      if (t <= targetTime) {
        prior = points[i];
        break;
      }
    }
    const sevenDayDelta = prior ? latest.ma - prior.ma : null;

    return {
      points,
      latestKg: latest.entry.kg,
      latestMa: latest.ma,
      sevenDayDelta,
    };
  }, [data]);
}

// ─── Weigh-in adherence + streak ─────────────────────────────────────────────

export type WeighInHistory = {
  /** Per-day heat cells (binary): 4 = logged, 0 = no entry. Last entry = today. */
  readonly cells: ReadonlyArray<{ date: string; level: HeatLevel }>;
  /**
   * Consecutive days back from today with at least one weigh-in, threading
   * through scheduled-off days (per `weight_preferences.weekdayBitmask`).
   * Breaks on a scheduled-on day with no entry.
   */
  readonly currentStreak: number;
  /** Longest such run across all-time history (not just the window). */
  readonly bestStreak: number;
  /**
   * Share of scheduled-on days within the window that have ≥1 entry.
   * 0..1; useful for the "adherence NN%" badge.
   */
  readonly adherencePct: number;
};

/**
 * Aggregate weigh-in history into a binary heatmap + streak + adherence.
 *
 * Mirrors `useWaterHistory` but with only two heat levels — for weight a
 * day is either "logged" or "not", not bucketed by amount. Streak math is
 * the same bitmask-threading model as fasting/water.
 */
export function useWeighInHistory(weeks: number = 14): WeighInHistory {
  const today = startOfDay(new Date());
  // 60s tick so the today cell flips when an entry lands. Live query
  // already reacts to inserts, but the tick catches the midnight rollover.
  const _now = useNow(60_000);
  const prefs = useWeightPreferences();
  const { data } = useLiveQuery(db.select().from(weightEntries));

  return useMemo<WeighInHistory>(() => {
    const entries = data ?? [];
    const totalDays = weeks * 7;

    // Set of local days with ≥1 entry.
    const byDay = new Set<string>();
    for (const e of entries) byDay.add(ymd(e.at));

    // Heatmap cells — binary 0/4, addDays for DST-safe day walking.
    const cells: { date: string; level: HeatLevel }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = ymd(d);
      cells.push({ date: key, level: byDay.has(key) ? 4 : 0 });
    }

    const bitmask = prefs?.weekdayBitmask ?? 0b1111111;
    const isScheduledOn = (d: Date) => (bitmask & (1 << dowMondayFirst(d))) !== 0;
    const hit = (d: Date) => byDay.has(ymd(d));

    // Adherence within the visible window only — the user expects "last
    // 14 weeks" to be the denominator.
    let scheduledCount = 0;
    let hitCount = 0;
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      if (isScheduledOn(d)) {
        scheduledCount++;
        if (hit(d)) hitCount++;
      }
    }
    const adherencePct = scheduledCount > 0 ? hitCount / scheduledCount : 0;

    // Streak math — anchor walks bounded by the earliest entry to cap work.
    const earliestEntry =
      entries.length === 0
        ? null
        : startOfDay(new Date(Math.min(...entries.map((e) => e.at.getTime()))));

    let currentStreak = 0;
    if (earliestEntry) {
      for (
        let cursor = today;
        cursor.getTime() >= earliestEntry.getTime();
        cursor = addDays(cursor, -1)
      ) {
        if (!isScheduledOn(cursor)) continue;
        if (hit(cursor)) currentStreak++;
        else break;
      }
    }

    let bestStreak = 0;
    if (earliestEntry) {
      let run = 0;
      for (
        let cursor = earliestEntry;
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

    return { cells, currentStreak, bestStreak, adherencePct };
  }, [data, prefs, today, weeks, _now]);
}
