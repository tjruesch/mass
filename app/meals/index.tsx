/**
 * Meals detail screen (#86).
 *
 * Today's energy hero + macro mini-bar + 4 slot cards
 * (breakfast/lunch/dinner/snack) + a recent-meals list. Each empty
 * slot card opens the meal log drawer pre-selected to that slot.
 *
 * Week strip + library carousel come in #88. Settings cog routes to
 * a placeholder until #92 (meals-settings, overlaps Slice 6) ships.
 *
 * Daily budget stays hardcoded at 1820 until Slice 6 wires the real
 * goal source via `meal_preferences` / `daily_targets`.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, MealLogDrawer, SubHeader, TabBar } from '@/components/design';
import {
  MEAL_SLOTS,
  useRecentMeals,
  useTodayMeals,
  type MealSlot,
} from '@/src/hooks/use-meals';
import type { Meal } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const KCAL_BUDGET_PLACEHOLDER = 1820;

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
};

export default function MealsScreen() {
  const router = useRouter();
  const today = useTodayMeals();
  const recent = useRecentMeals(8);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSlot, setDrawerSlot] = useState<MealSlot | undefined>(undefined);

  const openDrawerForSlot = useCallback((slot?: MealSlot) => {
    setDrawerSlot(slot);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const remaining = Math.max(0, KCAL_BUDGET_PLACEHOLDER - today.totalKcal);
  const pct =
    KCAL_BUDGET_PLACEHOLDER > 0
      ? Math.min(1, today.totalKcal / KCAL_BUDGET_PLACEHOLDER)
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title="Meals"
          back="Home"
          onBack={() => router.back()}
        />

        {/* Today's energy hero */}
        <View style={styles.heroOuter}>
          <View style={styles.heroCard}>
            <Text style={[styles.kicker, textStyles.cap]}>today · kcal</Text>
            <View style={styles.heroNumberRow}>
              <Text style={[styles.heroNumber, textStyles.tnum]}>
                {Math.round(today.totalKcal)}
              </Text>
              <Text style={styles.heroNumberSep}>/</Text>
              <Text style={[styles.heroBudget, textStyles.tnum]}>
                {KCAL_BUDGET_PLACEHOLDER}
              </Text>
            </View>
            <Text style={[styles.heroSub, textStyles.tnum]}>
              <Text style={styles.heroSubStrong}>{Math.round(remaining)} kcal</Text>
              <Text style={styles.heroSubMute}>
                {remaining > 0 ? ' remaining' : ' over'}
                {'   ·   '}
              </Text>
              <Text style={styles.heroSubStrong}>{Math.round(pct * 100)}%</Text>
            </Text>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, pct * 100)}%` },
                ]}
              />
            </View>

            <MacroMiniBar
              kcal={today.totalKcal}
              proteinG={today.totalProteinG}
              carbsG={today.totalCarbsG}
              fatG={today.totalFatG}
            />
          </View>
        </View>

        {/* Slot cards */}
        <View style={styles.slotsOuter}>
          <Text style={[styles.kicker, textStyles.cap, styles.sectionKicker]}>
            today · slots
          </Text>
          <View style={styles.slotsGrid}>
            {MEAL_SLOTS.map((slot) => (
              <SlotCard
                key={slot}
                slot={slot}
                meals={today.bySlot[slot]}
                onLog={() => openDrawerForSlot(slot)}
              />
            ))}
          </View>
        </View>

        {/* Recent meals */}
        <RecentMeals meals={recent} />

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
// MacroMiniBar — three-color stack with per-macro labels below.
// ─────────────────────────────────────────────────────────────────────────────
function MacroMiniBar({
  kcal,
  proteinG,
  carbsG,
  fatG,
}: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}) {
  // Energy contribution per macro — useful for the stacked bar widths
  // since per-gram caloric density differs. Protein 4, carbs 4, fat 9.
  const pKcal = proteinG * 4;
  const cKcal = carbsG * 4;
  const fKcal = fatG * 9;
  const total = Math.max(pKcal + cKcal + fKcal, kcal, 1);

  return (
    <View style={styles.macroBlock}>
      <View style={styles.macroBar}>
        <View
          style={{
            flex: pKcal,
            backgroundColor: tokens.ink,
          }}
        />
        <View
          style={{
            flex: cKcal,
            backgroundColor: tokens.cool,
          }}
        />
        <View
          style={{
            flex: fKcal,
            backgroundColor: tokens.accentInk,
          }}
        />
        {/* Tail: any unaccounted kcal (e.g. one-off entries with kcal but
            zero macros) renders as muted bg2 so the bar reads to the
            user's `pct` summary even when macro breakdown is missing. */}
        <View
          style={{
            flex: Math.max(0, total - (pKcal + cKcal + fKcal)),
            backgroundColor: tokens.bg2,
          }}
        />
      </View>
      <View style={styles.macroLegendRow}>
        <MacroLegend label="P" value={proteinG} color={tokens.ink} />
        <MacroLegend label="C" value={carbsG} color={tokens.cool} />
        <MacroLegend label="F" value={fatG} color={tokens.accentInk} />
      </View>
    </View>
  );
}

function MacroLegend({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.macroLegend}>
      <View style={[styles.macroSwatch, { backgroundColor: color }]} />
      <Text style={styles.macroLetter}>{label}</Text>
      <Text style={[styles.macroValue, textStyles.tnum]}>
        {formatMacro(value)}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotCard — one of four daily slots. Empty card shows a + log CTA;
// populated card shows the meal(s) name + kcal.
// ─────────────────────────────────────────────────────────────────────────────
function SlotCard({
  slot,
  meals,
  onLog,
}: {
  slot: MealSlot;
  meals: ReadonlyArray<Meal>;
  onLog: () => void;
}) {
  const isEmpty = meals.length === 0;
  if (isEmpty) {
    return (
      <Pressable
        onPress={onLog}
        accessibilityRole="button"
        accessibilityLabel={`Log ${slot}`}
        style={({ pressed }) => [
          styles.slotCard,
          styles.slotCardEmpty,
          pressed && { opacity: 0.65 },
        ]}>
        <Text style={[styles.slotLabel, textStyles.cap]}>{SLOT_LABEL[slot]}</Text>
        <View style={styles.slotEmptyRow}>
          <Glyph name="plus" color={tokens.ink3} size={11} />
          <Text style={[styles.slotEmptyText, textStyles.cap]}>
            log {SLOT_LABEL[slot]}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Sum kcal across all meals in this slot — happens rarely (most
  // slots have one entry) but multi-snack days shouldn't render
  // truncated.
  const slotKcal = meals.reduce((a, m) => a + (m.kcal ?? 0), 0);
  const primaryName =
    meals.length === 1
      ? meals[0].name ?? 'Meal'
      : `${meals[0].name ?? 'Meal'} +${meals.length - 1}`;

  return (
    <Pressable
      onPress={onLog}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${slot}`}
      style={({ pressed }) => [
        styles.slotCard,
        styles.slotCardFilled,
        pressed && { opacity: 0.75 },
      ]}>
      <Text style={[styles.slotLabel, textStyles.cap]}>{SLOT_LABEL[slot]}</Text>
      <Text numberOfLines={1} style={styles.slotMealName}>
        {primaryName}
      </Text>
      <View style={styles.slotKcalRow}>
        <Text style={[styles.slotKcal, textStyles.tnum]}>
          {Math.round(slotKcal)}
        </Text>
        <Text style={styles.slotKcalUnit}>kcal</Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RecentMeals — desc list of recently-logged meals. Tap is a no-op
// for now; edit support lands with #93.
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

function RecentMeals({ meals }: { meals: ReadonlyArray<Meal> }) {
  if (meals.length === 0) {
    return (
      <View style={styles.recentOuter}>
        <Text style={[styles.kicker, textStyles.cap, styles.sectionKicker]}>
          recent
        </Text>
        <Text style={styles.recentEmptyText}>no meals logged yet</Text>
      </View>
    );
  }
  return (
    <View style={styles.recentOuter}>
      <Text style={[styles.kicker, textStyles.cap, styles.sectionKicker]}>
        recent
      </Text>
      <View style={styles.recentCard}>
        {meals.map((m, i) => {
          const isLast = i === meals.length - 1;
          const eatenAt = m.eatenAt ?? new Date(0);
          return (
            <View
              key={m.id}
              style={[styles.recentRow, !isLast && styles.recentRowBorder]}>
              <View style={styles.recentDayCol}>
                <Text style={[styles.recentDay, textStyles.cap]}>
                  {WEEKDAY_FMT.format(eatenAt).toLowerCase()}
                </Text>
                <Text style={styles.recentDate}>
                  {MONTH_DAY_FMT.format(eatenAt).toLowerCase()}
                </Text>
              </View>
              <View style={styles.recentBody}>
                <Text numberOfLines={1} style={styles.recentName}>
                  {m.name ?? 'Meal'}
                </Text>
                <Text style={styles.recentTimeSub}>
                  {formatClock(eatenAt)}
                </Text>
              </View>
              <View style={styles.recentMetricsCol}>
                <Text style={[styles.recentKcal, textStyles.tnum]}>
                  {Math.round(m.kcal ?? 0)}
                </Text>
                <Text style={styles.recentKcalUnit}>kcal</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatMacro(g: number): string {
  if (g === 0) return '0g';
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}

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
  sectionKicker: {
    marginBottom: 10,
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
    paddingHorizontal: 18,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  heroNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 38,
    color: tokens.ink,
    letterSpacing: -1.14,
    lineHeight: 42,
  },
  heroNumberSep: {
    fontFamily: fonts.mono,
    fontSize: 22,
    color: tokens.ink4,
  },
  heroBudget: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: tokens.ink4,
    letterSpacing: -0.18,
  },
  heroSub: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  heroSubStrong: {
    fontFamily: fonts.monoMedium,
    color: tokens.ink,
  },
  heroSubMute: {
    color: tokens.ink4,
  },

  progressTrack: {
    marginTop: 12,
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

  macroBlock: {
    marginTop: 14,
  },
  macroBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: tokens.bg2,
  },
  macroLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  macroLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroSwatch: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  macroLetter: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },
  macroValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.06,
  },

  // Slot cards
  slotsOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotCard: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  slotCardEmpty: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
  },
  slotCardFilled: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  slotLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  slotEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  slotEmptyText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.76,
  },
  slotMealName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.15,
  },
  slotKcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  slotKcal: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
  },
  slotKcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
  },

  // Recent
  recentOuter: {
    paddingTop: 20,
    paddingHorizontal: 22,
  },
  recentEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.26,
  },
  recentCard: {
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
    width: 60,
  },
  recentDay: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 1.76,
  },
  recentDate: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 2,
  },
  recentBody: {
    flex: 1,
    minWidth: 0,
  },
  recentName: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: tokens.ink,
  },
  recentTimeSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 0.4,
  },
  recentMetricsCol: {
    alignItems: 'flex-end',
  },
  recentKcal: {
    fontFamily: fonts.monoSemibold,
    fontSize: 15,
    color: tokens.ink,
  },
  recentKcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
  },
});
