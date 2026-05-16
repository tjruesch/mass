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
import Svg, { G, Path, Rect } from 'react-native-svg';

import { Glyph, MealLogDrawer, SubHeader, TabBar } from '@/components/design';
import type { Meal } from '@/src/db/schema';
import { useMealPreferences } from '@/src/hooks/use-meal-preferences';
import { useWeekPlan, type WeekPlanEntry } from '@/src/hooks/use-meal-plan';
import { useWeekStockNeed } from '@/src/hooks/use-week-stock-need';
import type { PantryItem } from '@/src/db/schema';
import {
  MEAL_SLOTS,
  useLastNDaysKcal,
  useLibraryMeals,
  useThisWeekMeals,
  type DayMeals,
  type MealSlot,
} from '@/src/hooks/use-meals';
import { dowMondayFirst } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

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
  const mealPrefs = useMealPreferences();
  const last7 = useLastNDaysKcal(7);
  const plan = useWeekPlan();
  const stockNeed = useWeekStockNeed();

  const todayDow = dowMondayFirst(new Date());
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);

  const today = week.days[todayDow]!;
  const selectedDay = week.days[selectedDow]!;
  const selectedPlan = plan.bySlot[selectedDow] ?? {};
  const budgetKcal = mealPrefs.budgetKcal;
  const tdeeKcal = mealPrefs.prefs?.tdeeKcal ?? 2400;

  // Rolling deficit. Only counts days that actually have logged meals
  // — including a zero-kcal day in the sum would treat any unlogged
  // day as a full-budget deficit and inflate the number wildly.
  // Positive = cut (under budget on avg); negative = surplus.
  const rollingDeficit = useMemo(() => {
    const loggedDays = last7.filter((d) => d.kcal > 0);
    const totalDeficit = loggedDays.reduce(
      (acc, d) => acc + (budgetKcal - d.kcal),
      0,
    );
    return {
      totalDeficit,
      // 7700 kcal ≈ 1 kg of body fat. Used to project the weight impact.
      kgEquivalent: totalDeficit / 7700,
      dayCount: loggedDays.length,
    };
  }, [last7, budgetKcal]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlot, setDrawerSlot] = useState<MealSlot | undefined>(undefined);
  const [editingMealId, setEditingMealId] = useState<number | undefined>(
    undefined,
  );
  const openDrawerForSlot = useCallback((slot?: MealSlot) => {
    setEditingMealId(undefined);
    setDrawerSlot(slot);
    setDrawerOpen(true);
  }, []);
  const openDrawerForEdit = useCallback((mealId: number) => {
    setDrawerSlot(undefined);
    setEditingMealId(mealId);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const remaining = Math.max(0, budgetKcal - today.totalKcal);
  const overBudget = today.totalKcal > budgetKcal;
  // Actual deficit = TDEE − consumed. Positive when still cutting,
  // negative on surplus. Goes red as soon as consumption crosses
  // budget — at that point the actual deficit drops below the planned
  // deficit and the day is no longer on plan.
  const actualDeficitKcal = tdeeKcal - today.totalKcal;
  // Progress bar spans 0 → TDEE (not just 0 → budget) so the user
  // can see the planned-deficit zone painted at the right end.
  // `consumedPctOfTdee` drives the ink fill; `budgetPctOfTdee` marks
  // the boundary where the bar transitions into the warn-coloured
  // deficit area.
  const consumedPctOfTdee =
    tdeeKcal > 0 ? Math.min(1, today.totalKcal / tdeeKcal) : 0;
  const budgetPctOfTdee =
    tdeeKcal > 0 ? Math.min(1, budgetKcal / tdeeKcal) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title="Meals"
          back="Home"
          onBack={() => router.back()}
          trailing={
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push('/meals-plan' as never)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit week plan"
                style={({ pressed }) => [
                  styles.planLink,
                  pressed && { opacity: 0.55 },
                ]}>
                <Text style={[styles.planLinkText, textStyles.cap]}>plan</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/meals-settings' as never)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Meal settings"
                style={({ pressed }) => [
                  styles.cogBtn,
                  pressed && { opacity: 0.65 },
                ]}>
                <Glyph name="cog" color={tokens.ink} size={14} />
              </Pressable>
            </View>
          }
        />

        {/* ── Hero: today's energy budget ─────────────────────────────── */}
        <View style={styles.heroOuter}>
          <View style={styles.heroCard}>
            <View style={styles.heroBigRow}>
              <View style={styles.heroNumberRow}>
                <Text style={[styles.heroNumber, textStyles.tnum]}>
                  {overBudget
                    ? Math.round(today.totalKcal - budgetKcal)
                    : Math.round(remaining)}
                </Text>
                <Text style={styles.heroNumberUnit}>
                  kcal {overBudget ? 'over' : 'left'}
                </Text>
              </View>
              <Text style={styles.heroDeficitInline}>
                <Text
                  style={[
                    styles.heroDeficit,
                    textStyles.tnum,
                    { color: overBudget ? tokens.warn : '#1F7A3A' },
                  ]}>
                  {Math.abs(Math.round(actualDeficitKcal))}
                </Text>
                <Text style={styles.heroDeficitLabel}> deficit</Text>
              </Text>
            </View>

            <View style={styles.progressTrack}>
              {/* Deficit zone — paints the budget→tdee region warn so
                  the user can see how much room is left in their
                  planned cut. Rendered first so the ink fill below
                  paints over it once consumption crosses into the
                  deficit zone. */}
              {budgetPctOfTdee < 1 && (
                <View
                  style={[
                    styles.progressDeficitZone,
                    { left: `${budgetPctOfTdee * 100}%` },
                  ]}
                />
              )}
              <View
                style={[
                  styles.progressFill,
                  { width: `${consumedPctOfTdee * 100}%` },
                ]}
              />
            </View>

            <View style={styles.heroSubRow}>
              <Text style={[styles.heroSubLeft, textStyles.tnum]}>
                <Text style={styles.heroSubStrong}>
                  {Math.round(today.totalKcal)}
                </Text>
                <Text style={styles.heroSubMute}> of </Text>
                <Text style={styles.heroSubStrong}>{budgetKcal}</Text>
                <Text style={styles.heroSubMute}> budget</Text>
              </Text>
              <Text style={styles.heroSubRight}>
                <Text style={styles.heroSubMute}>tdee </Text>
                <Text style={[styles.heroSubStrong, textStyles.tnum]}>
                  {tdeeKcal}
                </Text>
              </Text>
            </View>

            {/* Rolling deficit row — labelled `Nd deficit` where N is
                the number of logged days (skips unlogged days so the
                total isn't inflated by full-budget zeros). Hides when
                nothing has been logged in the window. */}
            {rollingDeficit.dayCount > 0 && (
              <View style={styles.sevenDayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kickerSmall, textStyles.cap]}>
                    {rollingDeficit.dayCount}d deficit
                  </Text>
                  <Text style={[styles.sevenDayValue, textStyles.tnum]}>
                    {formatSignedKcalLong(rollingDeficit.totalDeficit)}
                    <Text style={styles.heroSubMute}> kcal </Text>
                    <Text style={styles.heroSubMute}>≈ </Text>
                    <Text style={styles.heroSubStrong}>
                      {formatKgDelta(rollingDeficit.kgEquivalent)}
                    </Text>
                  </Text>
                </View>
                <SevenDayBars days={last7} budgetKcal={budgetKcal} />
              </View>
            )}
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

        {/* ── Missing-ingredients banner ───────────────────────────── */}
        {stockNeed.missingMealCount > 0 && (
          <Pressable
            onPress={() => router.push('/pantry' as never)}
            accessibilityRole="button"
            accessibilityLabel="Review pantry shortage"
            style={({ pressed }) => [
              styles.missingBanner,
              pressed && { opacity: 0.75 },
            ]}>
            <View style={styles.missingBannerIcon}>
              <Svg width={13} height={13} viewBox="0 0 14 14">
                <Path
                  d="M7 1.5L13 12H1z"
                  fill="none"
                  stroke={tokens.warn}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
                <Path
                  d="M7 5.5v3.5M7 10.5v.5"
                  stroke={tokens.warn}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.missingBannerTitle}>
                {stockNeed.missingMealCount} meal
                {stockNeed.missingMealCount === 1 ? '' : 's'} missing
                ingredients
              </Text>
              <Text style={styles.missingBannerSub} numberOfLines={1}>
                {topMissingNames(stockNeed)}
              </Text>
            </View>
            <Glyph name="chev" color={tokens.warn} />
          </Pressable>
        )}

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
            {MEAL_SLOTS.map((slot) => {
              const planEntry = selectedPlan[slot];
              const missing = planEntry
                ? stockNeed.missingByMealId.get(planEntry.meal.id) ?? []
                : [];
              return (
                <SlotCard
                  key={slot}
                  slot={slot}
                  meals={selectedDay.bySlot[slot]}
                  plan={planEntry}
                  missingItems={missing}
                  canLog={selectedDow === todayDow}
                  onLog={() => openDrawerForSlot(slot)}
                  onEditMeal={openDrawerForEdit}
                />
              );
            })}
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
        editingMealId={editingMealId}
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
  plan,
  missingItems,
  canLog,
  onLog,
  onEditMeal,
}: {
  slot: MealSlot;
  meals: ReadonlyArray<Meal>;
  /** Planned library meal for (date, slot), if any. Renders as a
   *  ghost card with a 'log as planned' affordance when nothing is
   *  logged yet. Ignored once a meal has been logged for the slot. */
  plan: WeekPlanEntry | undefined;
  /** Pantry items the planned meal references that are currently
   *  `out` or `short` for the week. Drives the `missing N` warn
   *  pill + `needs:` row on the planned-ghost card. */
  missingItems: ReadonlyArray<PantryItem>;
  canLog: boolean;
  onLog: () => void;
  /** Tap handler for a populated slot — opens the drawer in edit
   *  mode for the primary (first) meal in the slot. */
  onEditMeal: (mealId: number) => void;
}) {
  if (meals.length === 0) {
    if (plan !== undefined) {
      // Ghost-planned card. Past days fall through the canLog check
      // and become read-only "missed" plans.
      const hasMissing = missingItems.length > 0;
      return (
        <Pressable
          onPress={canLog ? onLog : undefined}
          accessibilityRole="button"
          accessibilityLabel={`${slot} planned · ${plan.meal.name ?? 'meal'}`}
          style={({ pressed }) => [
            styles.slotCard,
            styles.slotCardPlanned,
            !canLog && { opacity: 0.6 },
            pressed && canLog && { opacity: 0.75 },
          ]}>
          <View style={styles.slotInner}>
            <View style={styles.slotBody}>
              <Text style={[styles.slotKicker, textStyles.cap]}>
                {SLOT_LABEL[slot]}
                <Text style={styles.slotKickerDot}>{'  ·  planned'}</Text>
              </Text>
              <Text numberOfLines={1} style={styles.slotMealName}>
                {plan.meal.name ?? 'Meal'}
              </Text>
              <Text style={[styles.slotMacroLine, textStyles.tnum]}>
                <Text style={styles.slotMacroNum}>
                  {Math.round(plan.meal.kcal ?? 0)}
                </Text>
                <Text style={styles.slotMacroUnit}> kcal</Text>
              </Text>
            </View>
            {hasMissing ? (
              <View style={styles.slotMissingPill}>
                <Text style={[styles.slotMissingPillText, textStyles.cap]}>
                  missing {missingItems.length}
                </Text>
              </View>
            ) : (
              canLog && (
                <View style={styles.slotPlannedCta}>
                  <Text
                    style={[styles.slotPlannedCtaText, textStyles.cap]}>
                    log
                  </Text>
                </View>
              )
            )}
          </View>
          {hasMissing && (
            <View style={styles.slotNeedsRow}>
              <Text style={[styles.slotNeedsLabel, textStyles.cap]}>
                needs:
              </Text>
              <View style={styles.slotNeedsChipRow}>
                {missingItems.slice(0, 3).map((p) => (
                  <View key={p.id} style={styles.slotNeedsChip}>
                    <Text style={styles.slotNeedsChipText}>
                      {p.name.toLowerCase()}
                    </Text>
                  </View>
                ))}
                {missingItems.length > 3 && (
                  <Text style={styles.slotNeedsMore}>
                    + {missingItems.length - 3} more
                  </Text>
                )}
              </View>
            </View>
          )}
        </Pressable>
      );
    }
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
      onPress={canLog ? () => onEditMeal(primary.id) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${slot} · ${primaryName}`}
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
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.libraryScroll}>
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
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SevenDayBars — 7 bars sized by per-day deficit magnitude. Today's
// bar uses the accent ink so the rolling view stays anchored to "what
// am I doing right now".
// ─────────────────────────────────────────────────────────────────────────────
function SevenDayBars({
  days,
  budgetKcal,
}: {
  days: ReadonlyArray<{ date: Date; kcal: number }>;
  budgetKcal: number;
}) {
  const width = 98;
  const height = 26;
  const barW = 10;
  const gap = (width - days.length * barW) / Math.max(1, days.length - 1);
  // Scale: 1.2× budget caps the bar so an extreme over-budget day
  // doesn't dwarf the rest of the row.
  const max = Math.max(budgetKcal * 1.2, 800);
  return (
    <Svg width={width} height={height}>
      <G>
        {days.map((d, i) => {
          const x = i * (barW + gap);
          // Empty days render as a tiny placeholder tick so the row
          // still reads as "7 buckets" without inflating the deficit.
          if (d.kcal <= 0) {
            return (
              <Rect
                key={i}
                x={x}
                y={height - 2}
                width={barW}
                height={2}
                rx={1}
                fill={tokens.line2}
                opacity={0.6}
              />
            );
          }
          // Deficit magnitude (cut OR surplus) drives bar height.
          const deficit = budgetKcal - d.kcal;
          const magnitude = Math.min(Math.abs(deficit), max);
          const h = (magnitude / max) * (height - 4);
          const isToday = i === days.length - 1;
          return (
            <Rect
              key={i}
              x={x}
              y={height - h}
              width={barW}
              height={h}
              rx={1.5}
              fill={isToday ? tokens.accentInk : tokens.ink}
              opacity={isToday ? 1 : 0.35}
            />
          );
        })}
      </G>
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the comma-separated list of the top missing pantry items
 * across all planned-with-shortage meals for the banner subline.
 * De-dupes by item id so the same shortage doesn't show twice when
 * referenced by multiple planned meals.
 */
function topMissingNames(
  stockNeed: ReturnType<typeof useWeekStockNeed>,
): string {
  const seen = new Set<number>();
  const names: string[] = [];
  for (const items of stockNeed.missingByMealId.values()) {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      names.push(item.name.toLowerCase());
      if (names.length >= 3) break;
    }
    if (names.length >= 3) break;
  }
  const remaining = stockNeed.missingByMealId.size - names.length;
  const more = remaining > 0 ? ` + ${remaining} more` : '';
  return names.join(' · ') + more;
}

function formatSignedKcal(d: number): string {
  if (d > 0) return `−${d}`;
  if (d < 0) return `+${Math.abs(d)}`;
  return '0';
}

function formatSignedKcalLong(d: number): string {
  const abs = Math.abs(d).toLocaleString();
  if (d > 0) return `−${abs}`;
  if (d < 0) return `+${abs}`;
  return '0';
}

function formatKgDelta(kg: number): string {
  if (Math.abs(kg) < 0.05) return '0 kg';
  const sign = kg > 0 ? '−' : '+';
  return `${sign}${Math.abs(kg).toFixed(1)} kg`;
}

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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planLink: {
    paddingVertical: 4,
  },
  planLinkText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.accentInk,
    letterSpacing: 1.98,
  },
  cogBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kickerSmall: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  heroBigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  heroDeficitInline: {
    flexShrink: 0,
  },
  heroDeficit: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: '#1F7A3A',
  },
  heroDeficitLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  sevenDayRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sevenDayValue: {
    marginTop: 2,
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  heroNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 36,
    color: tokens.ink,
    letterSpacing: -1.26,
    // Match natural line-height (~1.2×) so digit ascenders don't clip
    // against the row above. Tight 1.0 was cutting the top edge.
    lineHeight: 44,
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
    position: 'relative',
  },
  progressDeficitZone: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(180,90,30,0.32)',
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
  slotCardPlanned: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bg,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
  },
  slotPlannedCta: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: tokens.ink,
  },
  slotPlannedCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.8,
  },
  slotMissingPill: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(180,90,30,0.10)',
  },
  slotMissingPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: tokens.warn,
    letterSpacing: 1.6,
  },
  slotNeedsRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    borderStyle: 'dashed',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  slotNeedsLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 0.4,
    fontStyle: 'italic',
  },
  slotNeedsChipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  slotNeedsChip: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(180,90,30,0.10)',
  },
  slotNeedsChipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9.5,
    color: tokens.warn,
    letterSpacing: 0.2,
  },
  slotNeedsMore: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
  },

  // Missing-ingredients banner (top of /meals)
  missingBanner: {
    marginTop: 12,
    marginHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(180,90,30,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(180,90,30,0.22)',
  },
  missingBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(180,90,30,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingBannerTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12.5,
    color: tokens.ink,
    letterSpacing: -0.06,
  },
  missingBannerSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
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
    paddingHorizontal: 22,
    marginBottom: 10,
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
