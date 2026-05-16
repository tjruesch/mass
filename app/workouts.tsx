/**
 * Workouts detail screen — port of designs/screen-workouts.jsx WorkoutsDisplay.
 *
 * Reads through the composite-types model (#82):
 *   - The weekly template stores type keys; per-day status uses
 *     `linkCompositeSlot` to decide done / planned / missed.
 *   - The today card shows the planned type's step breakdown.
 *   - Recent sessions group HK entries via `useLinkedSessions` — one
 *     row per composite completion, one row per ad-hoc HK entry.
 *
 * HK auth banner intentionally lives on the settings page, matching how
 * we landed the weight slice (#129).
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Glyph,
  SubHeader,
  TabBar,
  WorkoutLogDrawer,
} from '@/components/design';
import { WorkoutGlyph, toneColor } from '@/components/design/plan-day-drawer';
import {
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import type { WorkoutEntry, WorkoutPreferences } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import {
  useLinkedSessions,
  useWorkoutsThisWeek,
  type LinkedSession,
} from '@/src/hooks/use-workouts';
import {
  linkCompositeSlot,
  plannedSlotsForWeek,
} from '@/src/lib/workouts/link';
import {
  fallbackLabelForHkActivity,
} from '@/src/lib/workouts/types';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: ReadonlyArray<{
  key: WeekdayKey;
  label: string;
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
}> = [
  { key: 'mon', label: 'M', typeField: 'monType', timeField: 'monTimeMin' },
  { key: 'tue', label: 'T', typeField: 'tueType', timeField: 'tueTimeMin' },
  { key: 'wed', label: 'W', typeField: 'wedType', timeField: 'wedTimeMin' },
  { key: 'thu', label: 'T', typeField: 'thuType', timeField: 'thuTimeMin' },
  { key: 'fri', label: 'F', typeField: 'friType', timeField: 'friTimeMin' },
  { key: 'sat', label: 'S', typeField: 'satType', timeField: 'satTimeMin' },
  { key: 'sun', label: 'S', typeField: 'sunType', timeField: 'sunTimeMin' },
];

const WEEKDAY_LONG = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type CellStatus = 'done' | 'today' | 'missed' | 'planned' | 'rest';

export default function WorkoutsScreen() {
  const router = useRouter();
  const prefs = useWorkoutPreferences();
  const types = useWorkoutTypes();
  const weekEntries = useWorkoutsThisWeek();
  const recent = useLinkedSessions(8);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkoutEntry | null>(null);

  const openCreate = useCallback(() => {
    setEditingEntry(null);
    setDrawerOpen(true);
  }, []);
  const openEdit = useCallback((entry: WorkoutEntry) => {
    setEditingEntry(entry);
    setDrawerOpen(true);
  }, []);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const today = startOfDay(new Date());
  const todayIdx = dowMondayFirst(today); // 0 = Mon
  const slots = plannedSlotsForWeek(prefs, types);

  // Compute each weekday's cell status. A slot is "done" when the
  // composite linker returns a full match for that day's slot. Linking
  // is computed per-day (not week-wide) here because the week strip
  // doesn't need cross-slot dedupe — each day is independent.
  const cells = WEEKDAYS.map((wd, idx) => {
    const slot = slots[idx];
    const typeKey = prefs[wd.typeField] as string | null;
    const dayDate = addDays(today, idx - todayIdx);
    let status: CellStatus;
    let typeDef: WorkoutTypeDef | null = slot?.type ?? null;
    if (idx === todayIdx) {
      status = 'today';
    } else if (slot === null) {
      status = 'rest';
    } else {
      const result = linkCompositeSlot(slot, weekEntries, prefs, new Set());
      if (result) status = 'done';
      else if (idx < todayIdx) status = 'missed';
      else status = 'planned';
    }
    return {
      idx,
      typeKey,
      typeDef,
      dayDate,
      label: wd.label,
      status,
      timeMin: prefs[wd.timeField] as number | null,
    };
  });

  const todayCell = cells[todayIdx];
  const todaySlot = slots[todayIdx];
  const todayType = todayCell.typeDef;
  const todayTime = todayCell.timeMin;
  const todayTotalMin = todayType ? totalPlannedMinutes(todayType) : 0;

  const doneCount = cells.filter((c) => c.status === 'done').length;
  const plannedCount = cells.filter((c) => c.typeDef !== null).length;
  const totalMinDone = sumCompletedMinutes(weekEntries, slots, prefs);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader
          title="Workouts"
          back="Home"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={() => router.push('/workouts-settings')}
              hitSlop={8}>
              <View style={styles.cogBubble}>
                <Glyph name="cog" />
              </View>
            </Pressable>
          }
        />

        {/* This Week hero */}
        <View style={styles.heroOuter}>
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={[styles.kicker, textStyles.cap]}>this week</Text>
                <Text style={styles.heroTitle}>
                  <Text style={textStyles.tnum}>{doneCount}</Text>
                  <Text style={styles.heroTitleMute}> / {plannedCount} planned</Text>
                </Text>
              </View>
              <Text style={[styles.heroMeta, textStyles.tnum]}>
                {totalMinDone > 0 ? (
                  <>
                    <Text style={styles.heroMetaStrong}>{totalMinDone}m</Text>
                    <Text style={styles.heroMetaMute}> done</Text>
                  </>
                ) : (
                  <Text style={styles.heroMetaMute}>nothing logged yet</Text>
                )}
              </Text>
            </View>

            <View style={styles.weekRow}>
              {cells.map((c) => (
                <WeekdayCell key={c.idx} cell={c} />
              ))}
            </View>
          </View>
        </View>

        {/* Today's slot */}
        <View style={styles.todayOuter}>
          <Text style={[styles.kicker, textStyles.cap, styles.todayKicker]}>
            today · {WEEKDAY_LONG[todayIdx]}
          </Text>
          <View style={styles.todayCard}>
            <View
              style={[
                styles.todayIcon,
                todayType && { borderColor: tokens.line },
              ]}>
              <WorkoutGlyph
                icon={todayType?.icon ?? 'rest'}
                color={toneColor(todayType?.tone ?? 'mute')}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.todayTitle}>
                {todayType ? todayType.label : 'Rest day'}
              </Text>
              {todayType ? (
                <Text style={styles.todaySub}>
                  {formatTodaySub(todayTime, todayTotalMin, todayType.steps.length)}
                </Text>
              ) : (
                <Text style={styles.todaySub}>
                  recovery — log an ad-hoc session if you trained anyway
                </Text>
              )}
            </View>
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Log workout"
              style={({ pressed }) => [
                styles.todayBtn,
                pressed && { opacity: 0.65 },
              ]}>
              <Glyph name="plus" color={tokens.accent} size={14} />
              <Text style={styles.todayBtnText}>log</Text>
            </Pressable>
          </View>
        </View>

        <RecentSessions sessions={recent} onEdit={openEdit} types={types} />
      </ScrollView>
      <TabBar active="home" />

      <WorkoutLogDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entry={editingEntry}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentSessions — desc list of completed composite + ad-hoc sessions.
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

function RecentSessions({
  sessions,
  onEdit,
  types,
}: {
  sessions: ReadonlyArray<LinkedSession>;
  onEdit: (entry: WorkoutEntry) => void;
  types: ReadonlyArray<WorkoutTypeDef>;
}) {
  if (sessions.length === 0) {
    return (
      <View style={styles.recentOuter}>
        <Text style={[styles.kicker, textStyles.cap, styles.recentKicker]}>
          recent sessions
        </Text>
        <Text style={styles.recentEmptyText}>no sessions logged yet</Text>
      </View>
    );
  }
  return (
    <View style={styles.recentOuter}>
      <Text style={[styles.kicker, textStyles.cap, styles.recentKicker]}>
        recent sessions
      </Text>
      <View style={styles.recentCard}>
        {sessions.map((s, i) => (
          <SessionRow
            key={sessionRowKey(s, i)}
            session={s}
            isLast={i === sessions.length - 1}
            onEdit={onEdit}
            types={types}
          />
        ))}
      </View>
    </View>
  );
}

function SessionRow({
  session,
  isLast,
  onEdit,
  types,
}: {
  session: LinkedSession;
  isLast: boolean;
  onEdit: (entry: WorkoutEntry) => void;
  types: ReadonlyArray<WorkoutTypeDef>;
}) {
  if (session.kind === 'composite') {
    const def = types.find((t) => t.key === session.typeKey);
    const totalMin =
      Math.round(
        (session.result.spanEnd.getTime() - session.result.spanStart.getTime()) /
          60_000,
      );
    return (
      <Pressable
        onPress={() => onEdit(session.entries[0])}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${def?.label ?? session.typeKey} session`}
        style={({ pressed }) => [
          styles.recentRow,
          !isLast && styles.recentRowBorder,
          pressed && { opacity: 0.65 },
        ]}>
        <View style={styles.recentDayCol}>
          <Text style={[styles.recentDay, textStyles.cap]}>
            {WEEKDAY_FMT.format(session.result.spanStart).toLowerCase()}
          </Text>
          <Text style={styles.recentDate}>
            {MONTH_DAY_FMT.format(session.result.spanStart).toLowerCase()}
          </Text>
        </View>
        <View style={styles.recentTypeCol}>
          <Text numberOfLines={1} style={styles.recentTypeLinked}>
            {def?.label ?? session.typeKey}
          </Text>
          <Text style={styles.recentTimeSub}>
            {formatClock(session.result.spanStart)}
            {session.entries.length > 1 ? ` · ${session.entries.length} steps` : ''}
          </Text>
        </View>
        <View style={styles.recentMetricsCol}>
          <Text style={[styles.recentMetricBig, textStyles.tnum]}>{totalMin}m</Text>
          <Text style={[styles.recentMetricSmall, textStyles.tnum]}>
            {formatTotalKcal(session.entries)}
          </Text>
        </View>
      </Pressable>
    );
  }
  const e = session.entry;
  const durationMin = Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000);
  const label = fallbackLabelForHkActivity(e.type);
  return (
    <Pressable
      onPress={() => onEdit(e)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label} session`}
      style={({ pressed }) => [
        styles.recentRow,
        !isLast && styles.recentRowBorder,
        pressed && { opacity: 0.65 },
      ]}>
      <View style={styles.recentDayCol}>
        <Text style={[styles.recentDay, textStyles.cap]}>
          {WEEKDAY_FMT.format(e.startedAt).toLowerCase()}
        </Text>
        <Text style={styles.recentDate}>
          {MONTH_DAY_FMT.format(e.startedAt).toLowerCase()}
        </Text>
      </View>
      <View style={styles.recentTypeCol}>
        <Text numberOfLines={1} style={styles.recentTypeUnlinked}>
          {label}
        </Text>
        <Text style={styles.recentTimeSub}>{formatClock(e.startedAt)}</Text>
      </View>
      <View style={styles.recentMetricsCol}>
        <Text style={[styles.recentMetricBig, textStyles.tnum]}>{durationMin}m</Text>
        <Text style={[styles.recentMetricSmall, textStyles.tnum]}>
          {e.kcal != null ? `${Math.round(e.kcal)} kcal` : '—'}
        </Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WeekdayCell — single column in the 7-cell strip.
// ─────────────────────────────────────────────────────────────────────────────
function WeekdayCell({
  cell,
}: {
  cell: {
    idx: number;
    typeDef: WorkoutTypeDef | null;
    label: string;
    status: CellStatus;
  };
}) {
  const def = cell.typeDef;
  const isToday = cell.status === 'today';
  const isDone = cell.status === 'done';
  const isPlanned = cell.status === 'planned';
  const isMissed = cell.status === 'missed';
  const isRest = cell.status === 'rest';

  const iconBg = isDone ? tokens.ink : tokens.bg2;
  const iconColor = isDone ? tokens.bg : isRest ? tokens.ink4 : tokens.ink3;
  return (
    <View style={styles.weekCell}>
      <Text
        style={[
          styles.weekLabel,
          textStyles.cap,
          isToday && styles.weekLabelToday,
        ]}>
        {cell.label}
      </Text>
      <View
        style={[
          styles.weekIconWrap,
          { backgroundColor: iconBg },
          isToday && styles.weekIconToday,
          isPlanned && styles.weekIconPlanned,
        ]}>
        <WorkoutGlyph icon={def?.icon ?? 'rest'} color={iconColor} />
      </View>
      <Text
        style={[
          styles.weekType,
          {
            color: isRest
              ? tokens.ink4
              : isToday
              ? tokens.ink2
              : isDone
              ? tokens.ink2
              : tokens.ink3,
          },
          isRest && { fontStyle: 'italic' },
        ]}>
        {def ? def.key : 'rest'}
      </Text>
      <View style={styles.weekPip}>
        {isDone && <View style={styles.pipDone} />}
        {isToday && <View style={styles.pipToday} />}
        {isMissed && <View style={styles.pipMissed} />}
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatTodaySub(
  timeMin: number | null,
  totalMin: number,
  stepCount: number,
): string {
  const stepSuffix = stepCount > 1 ? ` (${stepCount} steps)` : '';
  if (timeMin === null) return `${totalMin}m planned${stepSuffix}`;
  const h = Math.floor(timeMin / 60).toString().padStart(2, '0');
  const m = (timeMin % 60).toString().padStart(2, '0');
  return `planned ${h}:${m} · ${totalMin}m${stepSuffix}`;
}

function formatTotalKcal(entries: ReadonlyArray<WorkoutEntry>): string {
  let kcal = 0;
  let any = false;
  for (const e of entries) {
    if (e.kcal != null) {
      kcal += e.kcal;
      any = true;
    }
  }
  return any ? `${Math.round(kcal)} kcal` : '—';
}

function sessionRowKey(s: LinkedSession, idx: number): string {
  if (s.kind === 'composite') return `c-${s.result.spanStart.getTime()}-${idx}`;
  return `u-${s.entry.id}`;
}

/**
 * Sum durations of completed composite slots only. Ad-hoc sessions don't
 * count toward "plan adherence" — the metric is intentionally tethered
 * to the plan rather than gross activity.
 */
function sumCompletedMinutes(
  entries: ReadonlyArray<WorkoutEntry>,
  slots: ReadonlyArray<ReturnType<typeof plannedSlotsForWeek>[number]>,
  prefs: WorkoutPreferences,
): number {
  let total = 0;
  const consumed = new Set<number>();
  for (let wd = 0; wd < 7; wd++) {
    const slot = slots[wd];
    if (!slot) continue;
    const result = linkCompositeSlot(slot, entries, prefs, consumed);
    if (!result) continue;
    total += Math.round((result.spanEnd.getTime() - result.spanStart.getTime()) / 60_000);
    for (const m of result.matches) consumed.add(m.entryId);
  }
  return total;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  cogBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },

  // Hero card
  heroOuter: {
    paddingTop: 4,
    paddingHorizontal: 22,
  },
  heroCard: {
    backgroundColor: tokens.card,
    borderRadius: 22,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 18,
    color: tokens.ink,
    marginTop: 4,
    letterSpacing: -0.27,
  },
  heroTitleMute: {
    color: tokens.ink4,
    fontFamily: fonts.sans,
  },
  heroMeta: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink3,
  },
  heroMetaStrong: {
    fontFamily: fonts.monoMedium,
    color: tokens.ink,
  },
  heroMetaMute: {
    color: tokens.ink4,
  },

  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weekLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.87,
  },
  weekLabelToday: {
    color: tokens.ink,
    fontFamily: fonts.monoSemibold,
  },
  weekIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekIconToday: {
    borderWidth: 2,
    borderColor: tokens.ink,
  },
  weekIconPlanned: {
    borderWidth: 1,
    borderColor: tokens.line,
    opacity: 0.85,
  },
  weekType: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    letterSpacing: 0.85,
  },
  weekPip: {
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipDone: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: tokens.ink,
  },
  pipToday: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  pipMissed: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: tokens.warn,
    opacity: 0.7,
  },

  // Today's slot card
  todayOuter: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  todayKicker: {
    marginBottom: 8,
  },
  todayCard: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  todayIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.15,
  },
  todaySub: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink3,
    marginTop: 4,
    letterSpacing: 0.42,
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.12,
  },
  todayBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  // Recent sessions
  recentOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  recentKicker: {
    marginBottom: 8,
  },
  recentEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.22,
  },
  recentCard: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  recentRowBorder: {
    borderBottomColor: tokens.line,
    borderBottomWidth: 1,
  },
  recentDayCol: {
    width: 70,
  },
  recentDay: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 1.65,
  },
  recentDate: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 2,
  },
  recentTypeCol: {
    flex: 1,
    minWidth: 0,
  },
  recentTypeLinked: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: 0.42,
  },
  recentTypeUnlinked: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  recentTimeSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    marginTop: 1,
    letterSpacing: 0.34,
  },
  recentMetricsCol: {
    alignItems: 'flex-end',
  },
  recentMetricBig: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
  },
  recentMetricSmall: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    marginTop: 2,
  },
});
