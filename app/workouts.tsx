/**
 * Workouts detail screen — port of designs/screen-workouts.jsx WorkoutsDisplay.
 *
 * Status: scaffold + this-week grid + today's slot card (issue #68).
 * Remaining sections:
 *   #69 — recent sessions list + planned-slot linking
 *   #70 — log workout drawer
 *   #71 — workouts settings page (cog destination)
 *
 * HK auth banner intentionally lives on the settings page, matching how
 * we landed the weight slice (#129) — keeps logging screens free of
 * status chrome.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

import { Glyph, SubHeader, TabBar, WorkoutLogDrawer } from '@/components/design';
import type { WorkoutEntry, WorkoutPreferences } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import {
  useLinkedWorkouts,
  useWorkoutsThisWeek,
  type LinkedWorkout,
} from '@/src/hooks/use-workouts';
import {
  fallbackLabelForHkActivity,
  workoutTypeById,
  type WorkoutTypeId,
  type WorkoutTypeTone,
} from '@/src/lib/workouts/types';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// Weekday labels + the prefs columns they map to. Mon-first to match
// the rest of the app (dowMondayFirst, the streak heatmap, fasting).
type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: ReadonlyArray<{
  key: WeekdayKey;
  label: string;
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
  durationField: keyof WorkoutPreferences;
}> = [
  { key: 'mon', label: 'M', typeField: 'monType', timeField: 'monTimeMin', durationField: 'monDurationMin' },
  { key: 'tue', label: 'T', typeField: 'tueType', timeField: 'tueTimeMin', durationField: 'tueDurationMin' },
  { key: 'wed', label: 'W', typeField: 'wedType', timeField: 'wedTimeMin', durationField: 'wedDurationMin' },
  { key: 'thu', label: 'T', typeField: 'thuType', timeField: 'thuTimeMin', durationField: 'thuDurationMin' },
  { key: 'fri', label: 'F', typeField: 'friType', timeField: 'friTimeMin', durationField: 'friDurationMin' },
  { key: 'sat', label: 'S', typeField: 'satType', timeField: 'satTimeMin', durationField: 'satDurationMin' },
  { key: 'sun', label: 'S', typeField: 'sunType', timeField: 'sunTimeMin', durationField: 'sunDurationMin' },
];

const WEEKDAY_LONG = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type CellStatus = 'done' | 'today' | 'missed' | 'planned' | 'rest';

export default function WorkoutsScreen() {
  const router = useRouter();
  const prefs = useWorkoutPreferences();
  const weekEntries = useWorkoutsThisWeek();
  const recent = useLinkedWorkouts(8);
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

  // Compute each weekday's cell + status. A slot is "done" when ≥1 entry
  // landed on that weekday whose HK type is a candidate for the planned
  // type. Time-window matching is layered on in #69.
  const cells = WEEKDAYS.map((wd, idx) => {
    const typeId = prefs[wd.typeField] as WorkoutTypeId | null;
    const dayDate = addDays(today, idx - todayIdx);
    const entriesForDay = weekEntries.filter(
      (e) => dowMondayFirst(startOfDay(e.startedAt)) === idx,
    );
    let status: CellStatus;
    if (idx === todayIdx) {
      status = 'today';
    } else if (typeId === null) {
      status = 'rest';
    } else {
      const def = workoutTypeById(typeId);
      const matched = entriesForDay.some((e) =>
        (def.hkCandidateKeys as readonly string[]).includes(e.type),
      );
      if (idx < todayIdx) status = matched ? 'done' : 'missed';
      else status = matched ? 'done' : 'planned';
    }
    return {
      idx,
      typeId,
      dayDate,
      label: wd.label,
      status,
      timeMin: prefs[wd.timeField] as number | null,
      durationMin: prefs[wd.durationField] as number | null,
    };
  });

  const todayCell = cells[todayIdx];
  const todayType = todayCell.typeId ? workoutTypeById(todayCell.typeId) : null;
  const todayTime = todayCell.timeMin;
  const todayDuration = todayCell.durationMin;

  const doneCount = cells.filter((c) => c.status === 'done').length;
  const plannedCount = cells.filter((c) => c.typeId !== null).length;
  const totalMinDone = sumMinutes(weekEntries, cells);

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
                typeId={todayCell.typeId}
                color={toneColor(todayType?.tone ?? 'mute')}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.todayTitle}>
                {todayType ? todayType.label : 'Rest day'}
              </Text>
              {todayType ? (
                <Text style={styles.todaySub}>
                  {todayTime !== null
                    ? todayDuration !== null
                      ? `planned ${formatMin(todayTime)} · ${todayDuration}m`
                      : `planned ${formatMin(todayTime)}`
                    : todayDuration !== null
                    ? `planned · ${todayDuration}m`
                    : 'no time set'}
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

        <RecentSessions sessions={recent} onEdit={openEdit} />
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
// RecentSessions — desc list of completed workouts. Linked rows render
// under their planned type id (e.g. "push"); unlinked rows fall back to
// the raw HK activity label so the user still sees what was logged.
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

function RecentSessions({
  sessions,
  onEdit,
}: {
  sessions: ReadonlyArray<LinkedWorkout>;
  onEdit: (entry: WorkoutEntry) => void;
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
        {sessions.map((s, i) => {
          const isLast = i === sessions.length - 1;
          const durationMin = Math.round(
            (s.entry.endedAt.getTime() - s.entry.startedAt.getTime()) / 60_000,
          );
          const label = s.linkedTypeId
            ? workoutTypeById(s.linkedTypeId).label
            : fallbackLabelForHkActivity(s.entry.type);
          const timeOfDay = formatMin(
            s.entry.startedAt.getHours() * 60 + s.entry.startedAt.getMinutes(),
          );
          return (
            <Pressable
              key={s.entry.id}
              onPress={() => onEdit(s.entry)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${label} session`}
              style={({ pressed }) => [
                styles.recentRow,
                !isLast && styles.recentRowBorder,
                pressed && { opacity: 0.65 },
              ]}>
              <View style={styles.recentDayCol}>
                <Text style={[styles.recentDay, textStyles.cap]}>
                  {WEEKDAY_FMT.format(s.entry.startedAt).toLowerCase()}
                </Text>
                <Text style={styles.recentDate}>
                  {MONTH_DAY_FMT.format(s.entry.startedAt).toLowerCase()}
                </Text>
              </View>
              <View style={styles.recentTypeCol}>
                <Text
                  numberOfLines={1}
                  style={
                    s.linkedTypeId ? styles.recentTypeLinked : styles.recentTypeUnlinked
                  }>
                  {label}
                </Text>
                <Text style={styles.recentTimeSub}>{timeOfDay}</Text>
              </View>
              <View style={styles.recentMetricsCol}>
                <Text style={[styles.recentMetricBig, textStyles.tnum]}>
                  {durationMin}m
                </Text>
                <Text style={[styles.recentMetricSmall, textStyles.tnum]}>
                  {s.entry.kcal != null ? `${Math.round(s.entry.kcal)} kcal` : '—'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
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
    typeId: WorkoutTypeId | null;
    label: string;
    status: CellStatus;
  };
}) {
  const def = cell.typeId ? workoutTypeById(cell.typeId) : null;
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
        <WorkoutGlyph typeId={cell.typeId} color={iconColor} />
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
        {def ? def.id : 'rest'}
      </Text>
      <View style={styles.weekPip}>
        {isDone && <View style={styles.pipDone} />}
        {isToday && <View style={styles.pipToday} />}
        {isMissed && <View style={styles.pipMissed} />}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkoutGlyph — inline SVGs matching the design's `WK_ICONS`. Tiny and
// self-contained; if more types arrive, extract.
// ─────────────────────────────────────────────────────────────────────────────
function WorkoutGlyph({
  typeId,
  color,
  size = 14,
}: {
  typeId: WorkoutTypeId | null;
  color: string;
  size?: number;
}) {
  if (typeId === null) {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Path d="M4 7h6" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
    );
  }
  if (typeId === 'tennis') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Ellipse cx={5.5} cy={5.5} rx={3.8} ry={4.2} fill="none" stroke={color} strokeWidth={1.2} />
        <Line x1={8} y1={8.5} x2={12} y2={12.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={2.3} y1={5.5} x2={9.3} y2={5.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
        <Line x1={5.5} y1={1.5} x2={5.5} y2={9.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
      </Svg>
    );
  }
  if (typeId === 'cardio') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Circle cx={9} cy={3} r={1.4} fill="none" stroke={color} strokeWidth={1.2} />
        <Path
          d="M8.5 5l-2 3 1.5 1.5L7 12M6.5 8L4 9.5M8 7l2 1.5"
          stroke={color}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  // push / pull / legs share the "lift" glyph — a stylized barbell.
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M2 7h10M3.5 5v4M10.5 5v4M5.5 4v6M8.5 4v6"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toneColor(tone: WorkoutTypeTone): string {
  if (tone === 'accent') return tokens.accentInk;
  if (tone === 'cool') return tokens.cool;
  if (tone === 'mute') return tokens.ink4;
  return tokens.ink;
}

function formatMin(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Sum durations (in minutes) of entries that match this week's planned
 * slots — used by the hero meta ("48m done"). Workouts that didn't match
 * any planned slot (ad-hoc) aren't counted here so the metric stays
 * tethered to "plan adherence" rather than gross activity.
 */
function sumMinutes(
  entries: ReadonlyArray<WorkoutEntry>,
  cells: ReadonlyArray<{ idx: number; typeId: WorkoutTypeId | null }>,
): number {
  let total = 0;
  for (const e of entries) {
    const dow = dowMondayFirst(startOfDay(e.startedAt));
    const cell = cells[dow];
    if (!cell?.typeId) continue;
    const def = workoutTypeById(cell.typeId);
    if (!(def.hkCandidateKeys as readonly string[]).includes(e.type)) continue;
    total += Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000);
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
    fontSize: 11,
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
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  recentRowBorder: {
    borderBottomColor: tokens.line,
    borderBottomWidth: 1,
  },
  recentDayCol: {
    width: 60,
  },
  recentDay: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: tokens.ink,
    letterSpacing: 1.53,
  },
  recentDate: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 1,
  },
  recentTypeCol: {
    flex: 1,
    minWidth: 0,
  },
  recentTypeLinked: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.44,
  },
  recentTypeUnlinked: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.42,
  },
  recentTimeSub: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    marginTop: 1,
    letterSpacing: 0.34,
  },
  recentMetricsCol: {
    alignItems: 'flex-end',
  },
  recentMetricBig: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
  },
  recentMetricSmall: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 1,
  },
});

