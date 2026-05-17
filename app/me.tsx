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
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, TabBar } from '@/components/design';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { useMealPreferences } from '@/src/hooks/use-meal-preferences';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import { formatMinutes } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: '2-digit',
});

export default function MeScreen() {
  const router = useRouter();
  const fasting = useFastingPreferences();
  const water = useWaterPreferences();
  const weight = useWeightPreferences();
  const meal = useMealPreferences();
  const workoutPrefs = useWorkoutPreferences();
  const workoutTypes = useWorkoutTypes();

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
        <Glyph name={icon} color={tokens.ink2} size={14} />
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

// ─── Helpers ────────────────────────────────────────────────────────────────
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
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
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  rowSub: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    letterSpacing: 0.38,
  },
  rowValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: tokens.ink3,
  },
});
