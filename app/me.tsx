/**
 * Me — profile + settings landing (#105).
 *
 * v1 ships the goals & settings card — the load-bearing surface
 * that links into every tracker's existing settings screen and
 * summarises its current state from the per-tracker preferences
 * singleton. Profile card, integrations, appearance, and general
 * sections live in follow-up issues.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { sql } from 'drizzle-orm';

import { Glyph, TabBar } from '@/components/design';
import { db } from '@/src/db';
import { updatePreferences as updateUserPreferences } from '@/src/db/queries/user-preferences';
import { workoutEntries } from '@/src/db/schema';
import {
  BODY_MASS_PERMISSIONS,
  WORKOUT_PERMISSIONS,
  ensureHkAuthorization,
  useHkAuthState,
  type HkPermissionRequest,
} from '@/src/lib/healthkit';
import { MOVE_PERMISSIONS } from '@/src/lib/healthkit/move';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { useFeatureStreaks } from '@/src/hooks/use-feature-streaks';
import { useMealPreferences } from '@/src/hooks/use-meal-preferences';
import { useUserPreferences } from '@/src/hooks/use-user-preferences';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { useWeightHistory } from '@/src/hooks/use-weight';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import { formatMinutes } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: '2-digit',
});

// Union of every HK permission the app touches today. The integrations
// row reads as "live" when this union is granted; flips to "off" when
// any side is denied or the user hasn't prompted yet. Constant
// reference so useHkAuthState doesn't re-subscribe on render.
const ALL_HK_PERMISSIONS: HkPermissionRequest = {
  toRead: Array.from(
    new Set([
      ...MOVE_PERMISSIONS.toRead,
      ...BODY_MASS_PERMISSIONS.toRead,
      ...WORKOUT_PERMISSIONS.toRead,
    ]),
  ),
  toShare: Array.from(
    new Set([
      ...(BODY_MASS_PERMISSIONS.toShare ?? []),
      ...(WORKOUT_PERMISSIONS.toShare ?? []),
    ]),
  ),
};

export default function MeScreen() {
  const router = useRouter();
  const userPrefs = useUserPreferences();
  const weightHistory = useWeightHistory({ days: 90 });
  const featureStreaks = useFeatureStreaks();
  const fasting = useFastingPreferences();
  const water = useWaterPreferences();
  const weight = useWeightPreferences();
  const meal = useMealPreferences();
  const workoutPrefs = useWorkoutPreferences();
  const workoutTypes = useWorkoutTypes();
  // Lifetime workout count for the quick-stats strip. Live so HK
  // sync drops + manual logs both refresh the readout.
  const { data: workoutCountRows } = useLiveQuery(
    db.select({ n: sql<number>`count(*)`.as('n') }).from(workoutEntries),
  );
  const totalSessions = workoutCountRows?.[0]?.n ?? 0;
  const hkAuth = useHkAuthState(ALL_HK_PERMISSIONS);

  // ── Fasting row ─────────────────────────────────────────────────
  const fastingRow = useMemo(() => {
    if (fasting === null) return { sub: '—', value: '—' };
    const eatStart = formatMinutes(fasting.eatingWindowStartMin);
    const eatEnd = formatMinutes(fasting.eatingWindowEndMin);
    return {
      sub: `${fasting.protocol} · ${eatStart} → ${eatEnd}`,
      value: `${popcount(fasting.weekdayBitmask)}d/wk`,
    };
  }, [fasting]);

  // ── Water row ───────────────────────────────────────────────────
  const waterRow = useMemo(() => {
    if (water === null) return { sub: '—', value: '—' };
    const sub =
      water.unit === 'L'
        ? `${(water.targetMl / 1000).toFixed(1)} L / day`
        : water.unit === 'cups'
        ? `${Math.round(water.targetMl / 240)} cups / day`
        : `${water.targetMl} ml / day`;
    return {
      sub,
      value: `${popcount(water.weekdayBitmask)}d/wk`,
    };
  }, [water]);

  // ── Workouts row ────────────────────────────────────────────────
  const workoutsRow = useMemo(() => {
    if (workoutPrefs === null) {
      return { sub: '—', value: '—' };
    }
    const slots = [
      workoutPrefs.monType,
      workoutPrefs.tueType,
      workoutPrefs.wedType,
      workoutPrefs.thuType,
      workoutPrefs.friType,
      workoutPrefs.satType,
      workoutPrefs.sunType,
    ];
    const counts = new Map<string, number>();
    for (const t of slots) {
      if (t === null || t === '') continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const labelByKey = new Map<string, string>();
    for (const wt of workoutTypes) labelByKey.set(wt.key, wt.label);
    const parts: string[] = [];
    for (const [key, count] of counts.entries()) {
      // Lowercased + singularized type label, e.g. '3 lift · 2 tennis'.
      const label = (labelByKey.get(key) ?? key).toLowerCase();
      parts.push(`${count} ${label}`);
    }
    const sub = parts.length === 0 ? 'no template set' : parts.join(' · ');
    return {
      sub,
      value: workoutPrefs.autoImportHealthKit ? 'auto' : 'manual',
    };
  }, [workoutPrefs, workoutTypes]);

  // ── Weight row ──────────────────────────────────────────────────
  const weightRow = useMemo(() => {
    if (weight === null) return { sub: '—', value: '—' };
    if (weight.targetKg === null) {
      return { sub: 'no goal set', value: '—' };
    }
    const dateLabel = weight.targetDate
      ? MONTH_DAY_FMT.format(weight.targetDate).toLowerCase()
      : null;
    const sub = dateLabel
      ? `goal ${formatOne(weight.targetKg)} kg · ${dateLabel}`
      : `goal ${formatOne(weight.targetKg)} kg`;
    // Rate per week: (target − start) / (end − start) × 7. Negative
    // values mean cutting; magnitude per week shown.
    let value = '—';
    if (
      weight.startKg !== null &&
      weight.startDate !== null &&
      weight.targetDate !== null
    ) {
      const dayDiff = Math.max(
        1,
        Math.round(
          (weight.targetDate.getTime() - weight.startDate.getTime()) /
            86_400_000,
        ),
      );
      const totalChange = weight.targetKg - weight.startKg;
      const perWeek = (totalChange / dayDiff) * 7;
      const sign = perWeek < 0 ? '−' : perWeek > 0 ? '+' : '±';
      value = `${sign}${Math.abs(perWeek).toFixed(1)} kg/wk`;
    }
    return { sub, value };
  }, [weight]);

  // ── Profile sub line ───────────────────────────────────────────
  const profileSub = useMemo(() => {
    // Prefer goal context when a target is set; fall back to the
    // 7-day MA delta which we already compute on /trends.
    if (weight?.targetKg !== undefined && weight?.targetKg !== null) {
      if (
        weight.targetDate &&
        weight.targetDate.getTime() > Date.now()
      ) {
        const daysToGoal = Math.max(
          0,
          Math.round(
            (weight.targetDate.getTime() - Date.now()) / 86_400_000,
          ),
        );
        return `goal ${formatOne(weight.targetKg)} kg · ${daysToGoal} days to go`;
      }
      return `goal ${formatOne(weight.targetKg)} kg`;
    }
    if (weightHistory.sevenDayDelta !== null) {
      const v = weightHistory.sevenDayDelta;
      const arrow = v < 0 ? '▼' : v > 0 ? '▲' : '·';
      return `${arrow} ${formatOne(Math.abs(v))} kg / 7d`;
    }
    return 'no weigh-ins yet';
  }, [weight, weightHistory]);

  const profileSubColor = useMemo(() => {
    if (weight?.targetKg !== undefined && weight?.targetKg !== null) {
      return tokens.ink3;
    }
    if (weightHistory.sevenDayDelta === null) return tokens.ink4;
    // Without goal direction we can't tell if down is good. Neutral.
    return tokens.ink3;
  }, [weight, weightHistory]);

  // ── Quick-stats strip ──────────────────────────────────────────
  const goalStat = useMemo(() => {
    if (weight?.targetKg === undefined || weight?.targetKg === null) {
      return { value: '—', sub: 'no goal' };
    }
    const value = `${formatOne(weight.targetKg)}kg`;
    const sub = weight.targetDate
      ? MONTH_DAY_FMT.format(weight.targetDate).toLowerCase()
      : '—';
    return { value, sub };
  }, [weight]);

  const promptName = () => {
    Alert.prompt(
      'Your name',
      'Shown on the home greeting and here on the profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (text: string | undefined) => {
            const next = (text ?? '').trim();
            updateUserPreferences({
              displayName: next === '' ? null : next,
            }).catch((err) => {
              console.warn('Failed to save display name:', err);
            });
          },
        },
      ],
      'plain-text',
      userPrefs.displayName ?? '',
    );
  };

  // ── Meals row ──────────────────────────────────────────────────
  const mealsRow = useMemo(() => {
    if (meal.prefs === null) return { sub: '—', value: '—' };
    const deficit = meal.deficitKcal;
    const deficitLabel =
      deficit > 0
        ? `· −${deficit}`
        : deficit < 0
        ? `· +${Math.abs(deficit)}`
        : '';
    return {
      sub: `${meal.budgetKcal} kcal ${deficitLabel}`.trim(),
      value: `${meal.prefs.macroPctProtein}/${meal.prefs.macroPctCarbs}/${meal.prefs.macroPctFat}`,
    };
  }, [meal]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.kicker, textStyles.cap]}>account</Text>
          <Text style={styles.title}>Me</Text>
        </View>

        {/* ── Profile card ─────────────────────────────────────── */}
        <View style={styles.profileOuter}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initialsFor(userPrefs.displayName)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.profileName}>
                {userPrefs.displayName ?? 'Tap to set name'}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.profileSub, { color: profileSubColor }]}>
                {profileSub}
              </Text>
            </View>
            <Pressable
              onPress={promptName}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              style={({ pressed }) => [
                styles.pencilBtn,
                pressed && { opacity: 0.65 },
              ]}>
              <Svg width={12} height={12} viewBox="0 0 14 14">
                <Path
                  d="M9.5 2.5l2 2-7 7H2.5v-2z"
                  stroke={tokens.ink}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          </View>

          {/* Quick stats strip — 3 columns split by left borders. */}
          <View style={styles.statsStrip}>
            <StatColumn
              label="streak"
              value={`${featureStreaks.fasting.current}d`}
              sub="fasting"
              isFirst
            />
            <StatColumn
              label="goal"
              value={goalStat.value}
              sub={goalStat.sub}
            />
            <StatColumn
              label="sessions"
              value={`${totalSessions}`}
              sub="lifetime"
            />
          </View>
        </View>

        {/* ── Goals & settings card ────────────────────────────── */}
        <View style={styles.sectionOuter}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.kicker, textStyles.cap]}>
              goals & settings
            </Text>
          </View>
          <View style={styles.card}>
            <LinkRow
              icon="fast"
              label="Fasting"
              sub={fastingRow.sub}
              value={fastingRow.value}
              onPress={() => router.push('/fasting-settings' as never)}
            />
            <LinkRow
              icon="water"
              label="Water"
              sub={waterRow.sub}
              value={waterRow.value}
              onPress={() => router.push('/water-settings' as never)}
            />
            <LinkRow
              icon="lift"
              label="Workouts"
              sub={workoutsRow.sub}
              value={workoutsRow.value}
              onPress={() => router.push('/workouts-settings' as never)}
            />
            <LinkRow
              icon="scale"
              label="Weight"
              sub={weightRow.sub}
              value={weightRow.value}
              onPress={() => router.push('/weight-settings' as never)}
            />
            <LinkRow
              icon="meal"
              label="Meals"
              sub={mealsRow.sub}
              value={mealsRow.value}
              onPress={() => router.push('/meals-settings' as never)}
              isLast
            />
          </View>
        </View>

        {/* ── Integrations card ───────────────────────────────── */}
        <View style={styles.sectionOuter}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.kicker, textStyles.cap]}>integrations</Text>
            <Text style={styles.sectionSub}>data sources</Text>
          </View>
          <View style={styles.card}>
            <IntegrationRow
              name="Apple Health"
              sub="workouts · steps · weight"
              status={hkStatusFor(hkAuth)}
              live={hkAuth === 'granted'}
              onPress={() => {
                if (hkAuth === 'granted') {
                  Alert.alert(
                    'Apple Health',
                    'Sync is live. To toggle individual data types, open Settings.app → Health → Data Access & Devices → Maß.',
                  );
                  return;
                }
                ensureHkAuthorization(ALL_HK_PERMISSIONS).catch((err) => {
                  console.warn('HK auth request failed:', err);
                });
              }}
            />
            <IntegrationRow
              name="Withings Body+"
              sub="weight scale"
              status="off"
              onPress={() =>
                Alert.alert(
                  'Coming soon',
                  'Withings sync is tracked in #58 (Auto-import from Withings / Renpho / BLE).',
                )
              }
            />
            <IntegrationRow
              name="Renpho · BLE"
              sub="not paired"
              status="off"
              onPress={() =>
                Alert.alert(
                  'Coming soon',
                  'Renpho BLE pairing is tracked in #58.',
                )
              }
            />
            <IntegrationRow
              name="Calendar"
              sub="plan as iOS events"
              status="off"
              isLast
              onPress={() =>
                Alert.alert(
                  'Coming soon',
                  'Plan-to-Calendar export hasn’t been scheduled yet.',
                )
              }
            />
          </View>
        </View>
      </ScrollView>

      <TabBar active="me" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkRow — icon tile + label + sub + value + chev. Matches the
// design's link-row pattern; one tap routes to the tracker's
// settings screen.
// ─────────────────────────────────────────────────────────────────────────────
function LinkRow({
  icon,
  label,
  sub,
  value,
  onPress,
  isLast = false,
}: {
  icon: 'fast' | 'water' | 'lift' | 'scale' | 'meal';
  label: string;
  sub: string;
  value: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} · ${sub}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowBorder,
        pressed && { opacity: 0.65 },
      ]}>
      <View style={styles.iconTile}>
        <Glyph name={icon} color={tokens.ink2} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={[styles.rowValue, textStyles.tnum]} numberOfLines={1}>
        {value}
      </Text>
      <Glyph name="chev" color={tokens.ink3} />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IntegrationRow — variant of LinkRow with a status pill instead of
// a metric value. Heart-tinted icon when 'live', muted otherwise.
// ─────────────────────────────────────────────────────────────────────────────
function IntegrationRow({
  name,
  sub,
  status,
  live = false,
  onPress,
  isLast = false,
}: {
  name: string;
  sub: string;
  /** Pill label — 'live' / 'off' / 'unknown' / 'denied'. */
  status: 'live' | 'off' | 'unknown' | 'denied';
  live?: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const tinted = live;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} · ${sub} · ${status}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowBorder,
        pressed && { opacity: 0.65 },
      ]}>
      <View
        style={[
          styles.iconTile,
          tinted && styles.iconTileLive,
        ]}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path
            d="M7 12s-5-3-5-7a2.8 2.8 0 0 1 5-1.8A2.8 2.8 0 0 1 12 5c0 4-5 7-5 7z"
            fill={tinted ? '#D63D52' : tokens.ink4}
          />
        </Svg>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{name}</Text>
        <Text style={[styles.rowSub, { fontStyle: 'italic' }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <StatusPill status={status} />
      <Glyph name="chev" color={tokens.ink3} />
    </Pressable>
  );
}

function StatusPill({
  status,
}: {
  status: 'live' | 'off' | 'unknown' | 'denied';
}) {
  // Same green tone used elsewhere for 'on plan'; warn-tint for denied
  // so the user notices they need to revisit Settings.
  const palette =
    status === 'live'
      ? {
          fg: '#1F7A3A',
          bg: 'rgba(31,122,58,0.10)',
          border: 'rgba(31,122,58,0.20)',
          label: 'live',
        }
      : status === 'denied'
      ? {
          fg: tokens.warn,
          bg: 'rgba(180,90,30,0.10)',
          border: 'rgba(180,90,30,0.22)',
          label: 'denied',
        }
      : status === 'unknown'
      ? {
          fg: tokens.ink3,
          bg: tokens.bg2,
          border: tokens.line,
          label: 'connect',
        }
      : {
          fg: tokens.ink3,
          bg: tokens.bg2,
          border: tokens.line,
          label: 'off',
        };
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}>
      <Text
        style={[
          styles.statusPillText,
          textStyles.cap,
          { color: palette.fg },
        ]}>
        {palette.label}
      </Text>
    </View>
  );
}

function hkStatusFor(
  auth: ReturnType<typeof useHkAuthState>,
): 'live' | 'off' | 'unknown' | 'denied' {
  switch (auth) {
    case 'granted':
      return 'live';
    case 'denied':
      return 'denied';
    case 'unknown':
      return 'unknown';
    case 'unavailable':
    case 'checking':
    default:
      return 'off';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StatColumn — one cell of the quick-stats strip below the profile.
// ─────────────────────────────────────────────────────────────────────────────
function StatColumn({
  label,
  value,
  sub,
  isFirst = false,
}: {
  label: string;
  value: string;
  sub: string;
  isFirst?: boolean;
}) {
  return (
    <View style={[styles.statCol, !isFirst && styles.statColBorder]}>
      <Text style={[styles.statLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.statValue, textStyles.tnum]}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function initialsFor(name: string | null): string {
  if (name === null) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v > 0) {
    if (v & 1) count++;
    v >>>= 1;
  }
  return count;
}

function formatOne(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return (Math.round(n * 10) / 10).toString();
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  title: {
    marginTop: 6,
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.6,
  },

  // Profile card
  profileOuter: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    shadowOpacity: 0.03,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: tokens.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.1,
  },
  avatarText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 18,
    color: tokens.bg,
    letterSpacing: -0.18,
  },
  profileName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
  },
  profileSub: {
    marginTop: 3,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  pencilBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Quick-stats strip — sized to match /plan's this-week strip so
  // numbers read at the same scale as the rest of the app's stat
  // surfaces.
  statsStrip: {
    marginTop: 14,
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  statColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: tokens.line,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  statValue: {
    marginTop: 4,
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.77,
    lineHeight: 28,
  },
  statSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  sectionOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  card: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },

  // LinkRow
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
  },
  rowSub: {
    marginTop: 3,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 0.4,
  },
  rowValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    color: tokens.ink3,
  },

  // Integrations row variants
  iconTileLive: {
    backgroundColor: 'rgba(214,61,82,0.08)',
    borderColor: 'rgba(214,61,82,0.18)',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 12,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
});
