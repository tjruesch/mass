/**
 * Meals · week planner — follows designs/screen-meals-week.jsx.
 *
 * Layout (top → bottom):
 *   1. SubHeader
 *   2. Today · energy hero — "kcal LEFT" big number, progress bar,
 *      tiny "X of Y · budget" sub-row.
 *   3. "this week" stat strip — N meals logged · μ kcal/day.
 *   4. Day strip — M T W T F S S with date numbers + status dot.
 *      Selected day is inverted (ink fill); today gets a bold label.
 *   5. Selected day header — "today · Thursday" + "X kcal logged".
 *   6. Slot cards — full-width vertical stack of 4 cards (breakfast,
 *      lunch, dinner, snack). Populated cards show name + macros + ✓.
 *      Empty cards are dashed with a "+ add <slot>" CTA.
 *   7. Library strip — horizontal scroll of saved library meals (130px
 *      mini-cards) + dashed "+ new meal" CTA at the end.
 *
 * Out of scope until later slices:
 *   - "on pace" pill (top-right of hero) — needs time-of-day budget
 *     pacing; lands with Slice 6 goal infra.
 *   - Deficit + TDEE display — Slice 6 goal infra.
 *   - 7d deficit bar chart at bottom of hero — Slice 6.
 *   - Pantry stock "missing N" warning chips on slot cards — Slice 5
 *     deferred D1 (stock tracking).
 *   - Prep time on slot cards — meals.prep is not stored yet.
 *
 * Budget remains hardcoded at 1820 until Slice 6 wires meal_preferences.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Glyph, MealLogDrawer, SubHeader, TabBar } from '@/components/design';
import type { Meal } from '@/src/db/schema';
import {
  MEAL_SLOTS,
  useLibraryMeals,
  useThisWeekMeals,
  type DayMeals,
  type MealSlot,
} from '@/src/hooks/use-meals';
import { dowMondayFirst } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const KCAL_BUDGET_PLACEHOLDER = 1820;

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
};

export default function MealsScreen() {
  const router = useRouter();
  const week = useThisWeekMeals();
  const library = useLibraryMeals();

  const todayDow = dowMondayFirst(new Date());
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);

  const today = week.days[todayDow]!;
  const selectedDay = week.days[selectedDow]!;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlot, setDrawerSlot] = useState<MealSlot | undefined>(undefined);
  const openDrawerForSlot = useCallback((slot?: MealSlot) => {
    setDrawerSlot(slot);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const remaining = Math.max(0, KCAL_BUDGET_PLACEHOLDER - today.totalKcal);
  const consumedPct =
    KCAL_BUDGET_PLACEHOLDER > 0
      ? Math.min(1, today.totalKcal / KCAL_BUDGET_PLACEHOLDER)
      : 0;
  const overBudget = today.totalKcal > KCAL_BUDGET_PLACEHOLDER;

  const avgKcalPerActiveDay = useMemo(() => {
    return week.daysWithMeals > 0
      ? Math.round(week.weekKcal / week.daysWithMeals)
      : 0;
  }, [week.weekKcal, week.daysWithMeals]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SubHeader title="Meals" back="Home" onBack={() => router.back()} />

        {/* ── Hero: today's energy budget ─────────────────────────────── */}
        <View style={styles.heroOuter}>
          <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <Text style={[styles.kicker, textStyles.cap]}>
                today · energy
              </Text>
              {/* `on pace` pill skipped — needs Slice 6 budget pacing. */}
            </View>
            <View style={styles.heroNumberRow}>
              <Text style={[styles.heroNumber, textStyles.tnum]}>
                {overBudget
                  ? Math.round(today.totalKcal - KCAL_BUDGET_PLACEHOLDER)
                  : Math.round(remaining)}
              </Text>
              <Text style={styles.heroNumberUnit}>
                kcal {overBudget ? 'over' : 'left'}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, consumedPct * 100)}%` },
                ]}
              />
            </View>

            <View style={styles.heroSubRow}>
              <Text style={[styles.heroSubLeft, textStyles.tnum]}>
                <Text style={styles.heroSubStrong}>
                  {Math.round(today.totalKcal)}
                </Text>
                <Text style={styles.heroSubMute}> of </Text>
                <Text style={styles.heroSubStrong}>
                  {KCAL_BUDGET_PLACEHOLDER}
                </Text>
                <Text style={styles.heroSubMute}> · budget</Text>
              </Text>
              <Text style={styles.heroSubRight}>
                <Text style={styles.heroSubMute}>μ </Text>
                <Text style={[styles.heroSubStrong, textStyles.tnum]}>
                  {avgKcalPerActiveDay}
                </Text>
                <Text style={styles.heroSubMute}> kcal/day</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ── This-week stat strip ────────────────────────────────────── */}
        <View style={styles.thisWeekRow}>
          <Text style={[styles.kicker, textStyles.cap]}>this week</Text>
          <Text style={[styles.thisWeekStat, textStyles.tnum]}>
            <Text style={styles.heroSubStrong}>{week.plannedCount}</Text>
            <Text style={styles.heroSubMute}>
              {' '}
              meal{week.plannedCount === 1 ? '' : 's'} logged
            </Text>
          </Text>
        </View>

        {/* ── Day strip (M-S) ─────────────────────────────────────────── */}
        <View style={styles.dayStripOuter}>
          <View style={styles.dayStrip}>
            {week.days.map((day, d) => {
              const isToday = d === todayDow;
              const isSelected = d === selectedDow;
              const hasMeals = day.meals.length > 0;
              return (
                <Pressable
                  key={d}
                  onPress={() => setSelectedDow(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${DAY_NAMES[d]}`}
                  style={({ pressed }) => [
                    styles.dayCell,
                    isSelected
                      ? styles.dayCellSelected
                      : styles.dayCellDefault,
                    pressed && !isSelected && { opacity: 0.65 },
                  ]}>
                  <Text
                    style={[
                      styles.dayDow,
                      textStyles.cap,
                      isSelected && styles.dayDowSelected,
                      isToday && !isSelected && styles.dayDowToday,
                    ]}>
                    {DOW_LABELS[d]}
                  </Text>
                  <Text
                    style={[
                      styles.dayDate,
                      isSelected && styles.dayDateSelected,
                    ]}>
                    {day.date.getDate()}
                  </Text>
                  <View
                    style={[
                      styles.statusDot,
                      hasMeals
                        ? isSelected
                          ? styles.statusDotOkSelected
                          : styles.statusDotOk
                        : styles.statusDotEmpty,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Selected day · header + slot cards ──────────────────────── */}
        <View style={styles.selectedDayOuter}>
          <View style={styles.selectedDayHeader}>
            <Text style={[styles.kicker, textStyles.cap]}>
              {selectedDow === todayDow
                ? `today · ${DAY_NAMES[selectedDow]}`
                : DAY_NAMES[selectedDow]}
            </Text>
            <Text style={[styles.selectedDayStat, textStyles.tnum]}>
              <Text style={styles.heroSubStrong}>
                {Math.round(selectedDay.totalKcal)}
              </Text>
              <Text style={styles.heroSubMute}> kcal logged</Text>
            </Text>
          </View>
          <View style={styles.slotList}>
            {MEAL_SLOTS.map((slot) => (
              <SlotCard
                key={slot}
                slot={slot}
                meals={selectedDay.bySlot[slot]}
                canLog={selectedDow === todayDow}
                onLog={() => openDrawerForSlot(slot)}
              />
            ))}
          </View>
        </View>

        {/* ── Library strip — horizontal scroll ───────────────────────── */}
        <LibraryStrip
          meals={library}
          onTapMeal={(id) => router.push(`/meals/${id}` as never)}
          onCreate={() => router.push('/meals/new' as never)}
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      <TabBar active="home" />

      <MealLogDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        initialSlot={drawerSlot}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotCard — full-width row. Populated card: kicker + name + macros line
// + ✓ ok icon. Empty card: dashed border + "+ add <slot>".
//
// Past-day empty slots render as a muted "—" line rather than a CTA, since
// we don't support backdated logging via this entry point.
// ─────────────────────────────────────────────────────────────────────────────
function SlotCard({
  slot,
  meals,
  canLog,
  onLog,
}: {
  slot: MealSlot;
  meals: ReadonlyArray<Meal>;
  canLog: boolean;
  onLog: () => void;
}) {
  if (meals.length === 0) {
    if (!canLog) {
      return (
        <View style={[styles.slotCard, styles.slotCardPast]}>
          <View style={styles.slotHeadRow}>
            <Text style={[styles.slotKicker, textStyles.cap]}>
              {SLOT_LABEL[slot]}
            </Text>
            <Text style={styles.slotPastDash}>—</Text>
          </View>
        </View>
      );
    }
    return (
      <Pressable
        onPress={onLog}
        accessibilityRole="button"
        accessibilityLabel={`Log ${slot}`}
        style={({ pressed }) => [
          styles.slotCard,
          styles.slotCardEmpty,
          pressed && { opacity: 0.6 },
        ]}>
        <View style={styles.slotEmptyRow}>
          <Glyph name="plus" color={tokens.ink3} size={11} />
          <Text style={[styles.slotEmptyText, textStyles.cap]}>
            add {SLOT_LABEL[slot]}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Single primary meal headlines the card. If a slot has additional
  // entries (multi-snack day), surface a "+N" tail next to the name.
  const primary = meals[0];
  const primaryName = primary.name ?? 'Meal';
  const slotKcal = meals.reduce((a, m) => a + (m.kcal ?? 0), 0);
  const slotP = meals.reduce((a, m) => a + (m.proteinG ?? 0), 0);
  const slotC = meals.reduce((a, m) => a + (m.carbsG ?? 0), 0);
  const slotF = meals.reduce((a, m) => a + (m.fatG ?? 0), 0);

  return (
    <Pressable
      onPress={canLog ? onLog : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${slot} · ${primaryName}`}
      style={({ pressed }) => [
        styles.slotCard,
        styles.slotCardFilled,
        pressed && canLog && { opacity: 0.75 },
      ]}>
      <View style={styles.slotInner}>
        <View style={styles.slotBody}>
          <Text style={[styles.slotKicker, textStyles.cap]}>
            {SLOT_LABEL[slot]}
            {meals.length > 1 && (
              <>
                <Text style={styles.slotKickerDot}>{'  ·  '}</Text>
                <Text>+{meals.length - 1}</Text>
              </>
            )}
          </Text>
          <Text numberOfLines={1} style={styles.slotMealName}>
            {primaryName}
          </Text>
          <Text style={[styles.slotMacroLine, textStyles.tnum]}>
            <Text style={styles.slotMacroNum}>{Math.round(slotKcal)}</Text>
            <Text style={styles.slotMacroUnit}> kcal</Text>
            <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
            <Text style={styles.slotMacroNum}>P {formatMacro(slotP)}</Text>
            <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
            <Text style={styles.slotMacroNum}>C {formatMacro(slotC)}</Text>
            <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
            <Text style={styles.slotMacroNum}>F {formatMacro(slotF)}</Text>
          </Text>
        </View>
        <View style={styles.slotCheck}>
          <Svg width={11} height={11} viewBox="0 0 12 12">
            <Path
              d="M2.5 6L5 8.5 9.5 3.5"
              stroke="#1F7A3A"
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LibraryStrip — horizontal scroll of saved library meals. Each card
// shows the meal name + kcal. Tap → /meals/<id> (edit). Trailing "+"
// card → /meals/new (composer).
// ─────────────────────────────────────────────────────────────────────────────
function LibraryStrip({
  meals,
  onTapMeal,
  onCreate,
}: {
  meals: ReadonlyArray<Meal>;
  onTapMeal: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <View style={styles.libraryOuter}>
      <View style={styles.libraryHeader}>
        <Text style={[styles.kicker, textStyles.cap]}>
          your library · {meals.length} meal{meals.length === 1 ? '' : 's'}
        </Text>
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new meal"
          hitSlop={6}
          style={({ pressed }) => [
            styles.libraryNewLink,
            pressed && { opacity: 0.55 },
          ]}>
          <Glyph name="plus" color={tokens.accentInk} size={11} />
          <Text style={[styles.libraryNewLinkText, textStyles.cap]}>
            new meal
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.libraryScroll}>
        {meals.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onTapMeal(m.id)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${m.name ?? 'meal'}`}
            style={({ pressed }) => [
              styles.libraryCard,
              pressed && { opacity: 0.75 },
            ]}>
            <Text numberOfLines={2} style={styles.libraryCardName}>
              {m.name ?? 'Meal'}
            </Text>
            <Text style={[styles.libraryCardKcal, textStyles.tnum]}>
              {Math.round(m.kcal ?? 0)}
              <Text style={styles.libraryCardKcalUnit}> kcal</Text>
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="New meal"
          style={({ pressed }) => [
            styles.libraryAddCard,
            pressed && { opacity: 0.55 },
          ]}>
          <Glyph name="plus" color={tokens.ink3} size={14} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMacro(g: number): string {
  if (g === 0) return '0g';
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}

// `selectedDay` is kept referentially stable across renders but we don't
// want eslint to flag the implicit `DayMeals` type import.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ReferencedTypes = DayMeals;

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },

  // Hero
  heroOuter: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  heroCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
  },
  heroNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 36,
    color: tokens.ink,
    letterSpacing: -1.26,
    lineHeight: 36,
  },
  heroNumberUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },

  progressTrack: {
    marginTop: 14,
    height: 6,
    backgroundColor: tokens.bg2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.ink,
    borderRadius: 3,
  },

  heroSubRow: {
    marginTop: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heroSubLeft: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.44,
  },
  heroSubRight: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.44,
  },
  heroSubStrong: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  heroSubMute: {
    color: tokens.ink4,
  },

  // This-week strip
  thisWeekRow: {
    paddingTop: 16,
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  thisWeekStat: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.44,
  },

  // Day strip
  dayStripOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: 5,
  },
  dayCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 12,
    alignItems: 'center',
    gap: 5,
  },
  dayCellDefault: {
    backgroundColor: tokens.bg,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  dayCellSelected: {
    backgroundColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.1,
  },
  dayDow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.8,
  },
  dayDowSelected: {
    color: tokens.bg,
    opacity: 0.6,
  },
  dayDowToday: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  dayDate: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.14,
  },
  dayDateSelected: {
    color: tokens.bg,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  statusDotOk: {
    backgroundColor: tokens.accentInk,
  },
  statusDotOkSelected: {
    backgroundColor: tokens.accent,
  },
  statusDotEmpty: {
    borderWidth: 1,
    borderColor: tokens.line,
    backgroundColor: 'transparent',
  },

  // Selected day + slot cards
  selectedDayOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  selectedDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  selectedDayStat: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.44,
  },
  slotList: {
    gap: 8,
  },
  slotCard: {
    borderRadius: 14,
  },
  slotCardEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: tokens.bg,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
  },
  slotCardPast: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bg,
    borderWidth: 1,
    borderColor: tokens.line,
    opacity: 0.6,
  },
  slotCardFilled: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  slotHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotPastDash: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
  },
  slotEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  slotEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.32,
    fontStyle: 'italic',
  },
  slotInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  slotBody: {
    flex: 1,
    minWidth: 0,
  },
  slotKicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  slotKickerDot: {
    color: tokens.ink3,
  },
  slotMealName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
    marginTop: 4,
  },
  slotMacroLine: {
    marginTop: 3,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  slotMacroNum: {
    color: tokens.ink3,
  },
  slotMacroUnit: {
    color: tokens.ink4,
  },
  slotMacroSep: {
    color: tokens.ink4,
  },
  slotCheck: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(31,122,58,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Library strip
  libraryOuter: {
    paddingTop: 18,
  },
  libraryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  libraryNewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  libraryNewLinkText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.accentInk,
    letterSpacing: 2.2,
  },
  libraryScroll: {
    paddingHorizontal: 22,
    gap: 8,
  },
  libraryCard: {
    width: 130,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  libraryCardName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: -0.06,
    lineHeight: 15,
  },
  libraryCardKcal: {
    marginTop: 6,
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
  },
  libraryCardKcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
  },
  libraryAddCard: {
    width: 60,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
