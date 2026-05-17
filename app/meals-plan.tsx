/**
 * Meals · plan (#95). Edit-only week planner.
 *
 * Layout mirrors `/meals` so the user stays oriented: 7-day strip on
 * top, 4 vertical slot cards below for the selected day. The big
 * differences are:
 *   - No hero / kcal / deficit. Planning is forward-looking, not
 *     today-focused.
 *   - Empty slots are dashed "+ plan <slot>" CTAs. Tap → opens a
 *     library picker sheet for that (date, slot).
 *   - Populated slots show the planned meal name + kcal + an inline
 *     "replace" tap target plus a small × to clear.
 *
 * The plan is persisted via `meal_plan` rows keyed on (dateKey, slot).
 * Saving / clearing happens immediately; there's no draft state to
 * preserve across the picker so reactive updates flow straight back
 * through `useWeekPlan`.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BottomSheet, Glyph, SubHeader, TabBar } from '@/components/design';
import { updatePreferences as updateMealPreferences } from '@/src/db/queries/meal-preferences';
import {
  removePlanEntry,
  setPlanEntry,
} from '@/src/db/queries/meal-plan';
import type { Meal } from '@/src/db/schema';
import {
  useWeekPlan,
  type WeekPlanEntry,
} from '@/src/hooks/use-meal-plan';
import { useMealPreferences } from '@/src/hooks/use-meal-preferences';
import { useLibraryMeals, MEAL_SLOTS, type MealSlot } from '@/src/hooks/use-meals';
import {
  addDays,
  dowMondayFirst,
} from '@/src/lib/time';
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

type PickerState =
  | { kind: 'closed' }
  | { kind: 'open'; dow: number; slot: MealSlot };

type SlotSplit = {
  readonly breakfast: number;
  readonly lunch: number;
  readonly dinner: number;
  readonly snack: number;
};

const SPLIT_PRESETS: ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly split: SlotSplit;
}> = [
  // Even split — the default. Useful as a "reset".
  {
    id: 'even',
    label: 'even',
    split: { breakfast: 25, lunch: 25, dinner: 25, snack: 25 },
  },
  // Lunch-heavy cut split — example from the request.
  {
    id: 'cut',
    label: 'cut',
    split: { breakfast: 0, lunch: 50, dinner: 30, snack: 20 },
  },
  // OMAD — one meal a day, everything in dinner.
  {
    id: 'omad',
    label: 'omad',
    split: { breakfast: 0, lunch: 0, dinner: 100, snack: 0 },
  },
];

function splitsEqual(a: SlotSplit, b: SlotSplit): boolean {
  return (
    a.breakfast === b.breakfast &&
    a.lunch === b.lunch &&
    a.dinner === b.dinner &&
    a.snack === b.snack
  );
}

export default function MealsPlanScreen() {
  const router = useRouter();
  const plan = useWeekPlan();
  const library = useLibraryMeals();
  const mealPrefs = useMealPreferences();

  const todayDow = dowMondayFirst(new Date());
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);
  const [picker, setPicker] = useState<PickerState>({ kind: 'closed' });

  const dayEntries = plan.bySlot[selectedDow] ?? {};

  const handleClearSlot = (dow: number, slot: MealSlot) => {
    const entry = plan.bySlot[dow]?.[slot];
    if (!entry) return;
    removePlanEntry(entry.entry.id).catch((err) => {
      Alert.alert(
        'Could not clear plan',
        err instanceof Error ? err.message : String(err),
      );
    });
  };

  const handlePickMeal = (mealId: number) => {
    if (picker.kind !== 'open') return;
    const date = addDays(plan.weekStart, picker.dow);
    setPlanEntry({ date, slot: picker.slot, mealId })
      .then(() => setPicker({ kind: 'closed' }))
      .catch((err) => {
        Alert.alert(
          'Could not save plan',
          err instanceof Error ? err.message : String(err),
        );
      });
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title="Meals · plan"
          back="Meals"
          onBack={() => router.back()}
        />

        {/* ── Stat strip ──────────────────────────────────────────── */}
        <View style={styles.statRow}>
          <Text style={[styles.kicker, textStyles.cap]}>this week</Text>
          <Text style={[styles.statValue, textStyles.tnum]}>
            <Text style={styles.statStrong}>{plan.count}</Text>
            <Text style={styles.statMute}>
              {' '}of 28 slots planned
            </Text>
          </Text>
        </View>

        {/* ── Day strip ───────────────────────────────────────────── */}
        <View style={styles.dayStripOuter}>
          <View style={styles.dayStrip}>
            {plan.bySlot.map((slots, d) => {
              const isToday = d === todayDow;
              const isSelected = d === selectedDow;
              const planned = Object.keys(slots).length;
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
                    {addDays(plan.weekStart, d).getDate()}
                  </Text>
                  <View style={styles.dayDots}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.dayDot,
                          i < planned
                            ? isSelected
                              ? styles.dayDotOnSelected
                              : styles.dayDotOn
                            : isSelected
                            ? styles.dayDotOffSelected
                            : styles.dayDotOff,
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Selected day's slots ────────────────────────────────── */}
        <View style={styles.dayOuter}>
          <View style={styles.dayHeader}>
            <Text style={[styles.kicker, textStyles.cap]}>
              {selectedDow === todayDow
                ? `today · ${DAY_NAMES[selectedDow]}`
                : DAY_NAMES[selectedDow]}
            </Text>
            <Text style={[styles.statValue, textStyles.tnum]}>
              <Text style={styles.statStrong}>
                {Math.round(slotsKcalSum(dayEntries))}
              </Text>
              <Text style={styles.statMute}> kcal planned</Text>
            </Text>
          </View>
          <View style={styles.slotList}>
            {MEAL_SLOTS.map((slot) => (
              <PlanSlotCard
                key={slot}
                slot={slot}
                entry={dayEntries[slot]}
                onPlan={() =>
                  setPicker({ kind: 'open', dow: selectedDow, slot })
                }
                onClear={() => handleClearSlot(selectedDow, slot)}
              />
            ))}
          </View>
        </View>

        {/* ── Slot split editor ───────────────────────────────────── */}
        {mealPrefs.prefs && (
          <SlotSplitEditor
            initial={{
              breakfast: mealPrefs.prefs.slotPctBreakfast,
              lunch: mealPrefs.prefs.slotPctLunch,
              dinner: mealPrefs.prefs.slotPctDinner,
              snack: mealPrefs.prefs.slotPctSnack,
            }}
          />
        )}
      </ScrollView>

      <TabBar active="home" />

      <LibraryPickerSheet
        open={picker.kind === 'open'}
        slot={picker.kind === 'open' ? picker.slot : null}
        library={library}
        selectedMealId={
          picker.kind === 'open'
            ? plan.bySlot[picker.dow]?.[picker.slot]?.meal.id ?? null
            : null
        }
        onClose={() => setPicker({ kind: 'closed' })}
        onSelect={handlePickMeal}
        onCreateNew={() => {
          // Close first so the BottomSheet Modal doesn't float over
          // the composer. The user retaps the slot after creating
          // the meal — sheet then shows the new library entry.
          setPicker({ kind: 'closed' });
          router.push('/meals/new' as never);
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanSlotCard — empty (dashed CTA) vs populated (meal name + kcal + ×).
// ─────────────────────────────────────────────────────────────────────────────
function PlanSlotCard({
  slot,
  entry,
  onPlan,
  onClear,
}: {
  slot: MealSlot;
  entry: WeekPlanEntry | undefined;
  onPlan: () => void;
  onClear: () => void;
}) {
  if (!entry) {
    return (
      <Pressable
        onPress={onPlan}
        accessibilityRole="button"
        accessibilityLabel={`Plan ${slot}`}
        style={({ pressed }) => [
          styles.slotCard,
          styles.slotCardEmpty,
          pressed && { opacity: 0.6 },
        ]}>
        <View style={styles.slotEmptyRow}>
          <Glyph name="plus" color={tokens.ink3} size={11} />
          <Text style={[styles.slotEmptyText, textStyles.cap]}>
            plan {SLOT_LABEL[slot]}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPlan}
      accessibilityRole="button"
      accessibilityLabel={`Replace ${slot}`}
      style={({ pressed }) => [
        styles.slotCard,
        styles.slotCardFilled,
        pressed && { opacity: 0.75 },
      ]}>
      <View style={styles.slotInner}>
        <View style={styles.slotBody}>
          <Text style={[styles.slotKicker, textStyles.cap]}>
            {SLOT_LABEL[slot]}
          </Text>
          <Text numberOfLines={1} style={styles.slotMealName}>
            {entry.meal.name ?? 'Meal'}
          </Text>
          <Text style={[styles.slotMacroLine, textStyles.tnum]}>
            <Text style={styles.slotMacroNum}>
              {Math.round(entry.meal.kcal ?? 0)}
            </Text>
            <Text style={styles.slotMacroUnit}> kcal</Text>
            {entry.meal.proteinG !== null && entry.meal.proteinG > 0 && (
              <>
                <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
                <Text style={styles.slotMacroNum}>
                  P {formatG(entry.meal.proteinG)}
                </Text>
              </>
            )}
            {entry.meal.carbsG !== null && entry.meal.carbsG > 0 && (
              <>
                <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
                <Text style={styles.slotMacroNum}>
                  C {formatG(entry.meal.carbsG)}
                </Text>
              </>
            )}
            {entry.meal.fatG !== null && entry.meal.fatG > 0 && (
              <>
                <Text style={styles.slotMacroSep}>{'  ·  '}</Text>
                <Text style={styles.slotMacroNum}>
                  F {formatG(entry.meal.fatG)}
                </Text>
              </>
            )}
          </Text>
        </View>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${slot} plan`}
          style={({ pressed }) => [
            styles.clearBtn,
            pressed && { opacity: 0.55 },
          ]}>
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke={tokens.ink3}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LibraryPickerSheet — bottom sheet listing library meals with search.
// Mirrors the pantry picker pattern from the composer.
// ─────────────────────────────────────────────────────────────────────────────
function LibraryPickerSheet({
  open,
  slot,
  library,
  selectedMealId,
  onClose,
  onSelect,
  onCreateNew,
}: {
  open: boolean;
  slot: MealSlot | null;
  library: ReadonlyArray<Meal>;
  selectedMealId: number | null;
  onClose: () => void;
  onSelect: (mealId: number) => void;
  /** Navigate to the new-meal composer. Sheet stays open behind it
   *  so the new meal appears in the library list on return. */
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  // Pad scroll content to clear keyboard — matches pantry picker.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const sShow = Keyboard.addListener('keyboardWillShow', (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const sHide = Keyboard.addListener('keyboardWillHide', () =>
      setKbHeight(0),
    );
    return () => {
      sShow.remove();
      sHide.remove();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return library;
    return library.filter((m) =>
      (m.name ?? '').toLowerCase().includes(q),
    );
  }, [library, search]);

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.sheetHandleWrap}>
        <View style={styles.sheetHandle} />
      </View>
      <View style={styles.sheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sheetKicker, textStyles.cap]}>
            plan · {slot ?? ''}
          </Text>
          <Text style={styles.sheetTitle}>Pick a meal</Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.65 },
          ]}>
          <Svg width={11} height={11} viewBox="0 0 12 12">
            <Path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke={tokens.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
      <View style={styles.sheetSearchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="search library"
          placeholderTextColor={tokens.ink4}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.sheetSearchInput}
        />
      </View>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={{ paddingBottom: 24 + kbHeight }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={onCreateNew}
          accessibilityRole="button"
          accessibilityLabel="Create a new library meal"
          style={({ pressed }) => [
            styles.newMealBtn,
            pressed && { opacity: 0.55 },
          ]}>
          <Glyph name="plus" color={tokens.accentInk} size={11} />
          <Text style={[styles.newMealBtnText, textStyles.cap]}>
            new library meal
          </Text>
        </Pressable>
        {filtered.length === 0 ? (
          <Text style={styles.sheetEmpty}>
            {library.length === 0
              ? 'no library meals yet — build one from /meals'
              : 'no match'}
          </Text>
        ) : (
          <View style={styles.sheetList}>
            {filtered.map((m, i) => {
              const isLast = i === filtered.length - 1;
              const active = selectedMealId === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => onSelect(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Plan ${m.name ?? 'meal'}`}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    !isLast && styles.sheetRowBorder,
                    active && { backgroundColor: tokens.bg2 },
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sheetRowName} numberOfLines={1}>
                      {m.name ?? 'Meal'}
                    </Text>
                    <Text
                      style={[styles.sheetRowMacros, textStyles.tnum]}>
                      {Math.round(m.kcal ?? 0)} kcal
                      {m.proteinG !== null && m.proteinG > 0 && (
                        <Text> · P {formatG(m.proteinG)}</Text>
                      )}
                      {m.carbsG !== null && m.carbsG > 0 && (
                        <Text> · C {formatG(m.carbsG)}</Text>
                      )}
                      {m.fatG !== null && m.fatG > 0 && (
                        <Text> · F {formatG(m.fatG)}</Text>
                      )}
                    </Text>
                  </View>
                  <Glyph name="chev" color={tokens.ink3} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SlotSplitEditor — bottom-of-page editor for meal_preferences's
// slotPct* columns. The plan grid on /plan reads these to compute
// per-slot on_target / below / above per day.
//
// Local draft state lets the user type freely; we save on each
// edit when the four percentages sum to exactly 100, and surface a
// warning chip when they don't.
// ─────────────────────────────────────────────────────────────────────────────
function SlotSplitEditor({ initial }: { initial: SlotSplit }) {
  const [draft, setDraft] = useState<SlotSplit>(initial);
  // Sync if the underlying prefs change from elsewhere (e.g. a preset
  // tap re-renders this; we don't want stale local values).
  useEffect(() => {
    setDraft(initial);
  }, [initial.breakfast, initial.lunch, initial.dinner, initial.snack]);

  const sum =
    draft.breakfast + draft.lunch + draft.dinner + draft.snack;
  const valid = sum === 100;

  const persist = useCallback((next: SlotSplit) => {
    if (
      next.breakfast + next.lunch + next.dinner + next.snack !== 100
    ) {
      return;
    }
    updateMealPreferences({
      slotPctBreakfast: next.breakfast,
      slotPctLunch: next.lunch,
      slotPctDinner: next.dinner,
      slotPctSnack: next.snack,
    }).catch((err) => {
      Alert.alert(
        'Could not save slot split',
        err instanceof Error ? err.message : String(err),
      );
    });
  }, []);

  const onChange = (slot: keyof SlotSplit, value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const next = { ...draft, [slot]: clamped };
    setDraft(next);
    persist(next);
  };

  const applyPreset = (split: SlotSplit) => {
    setDraft(split);
    persist(split);
  };

  return (
    <View style={splitStyles.outer}>
      <View style={splitStyles.headerRow}>
        <Text style={[splitStyles.kicker, textStyles.cap]}>slot split</Text>
        <Text
          style={[
            splitStyles.sumText,
            textStyles.tnum,
            !valid && splitStyles.sumTextWarn,
          ]}>
          {sum}/100
        </Text>
      </View>
      <View style={splitStyles.inputsRow}>
        {(MEAL_SLOTS as ReadonlyArray<keyof SlotSplit>).map((slot) => (
          <SlotPctInput
            key={slot}
            label={SLOT_LABEL[slot as MealSlot]}
            value={draft[slot]}
            onChange={(v) => onChange(slot, v)}
          />
        ))}
      </View>
      <View style={splitStyles.presetRow}>
        {SPLIT_PRESETS.map((p) => {
          const active = splitsEqual(draft, p.split);
          return (
            <Pressable
              key={p.id}
              onPress={() => applyPreset(p.split)}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${p.label}`}
              style={({ pressed }) => [
                splitStyles.presetChip,
                active && splitStyles.presetChipActive,
                pressed && !active && { opacity: 0.65 },
              ]}>
              <Text
                style={[
                  splitStyles.presetValue,
                  textStyles.tnum,
                  active && { color: tokens.bg },
                ]}>
                {p.split.breakfast}/{p.split.lunch}/{p.split.dinner}/
                {p.split.snack}
              </Text>
              <Text
                style={[
                  splitStyles.presetLabel,
                  textStyles.cap,
                  active && { color: tokens.bg, opacity: 0.6 },
                ]}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!valid && (
        <Text style={splitStyles.warn}>
          slots must sum to 100 to save
        </Text>
      )}
    </View>
  );
}

function SlotPctInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value.toString());
  useEffect(() => {
    setText(value.toString());
  }, [value]);

  return (
    <View style={splitStyles.cell}>
      <Text style={[splitStyles.cellLabel, textStyles.cap]}>{label}</Text>
      <View style={splitStyles.cellInputRow}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            const cleaned = t.replace(/[^0-9]/g, '').slice(0, 3);
            setText(cleaned);
            const n = Number.parseInt(cleaned, 10);
            if (Number.isFinite(n)) onChange(n);
            else if (cleaned === '') onChange(0);
          }}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={3}
          style={[splitStyles.cellInput, textStyles.tnum]}
        />
        <Text style={splitStyles.cellPct}>%</Text>
      </View>
    </View>
  );
}

const splitStyles = StyleSheet.create({
  outer: {
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sumText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  sumTextWarn: {
    color: tokens.warn,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cell: {
    flex: 1,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  cellLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.12,
  },
  cellInputRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  cellInput: {
    flex: 1,
    fontFamily: fonts.monoSemibold,
    fontSize: 18,
    color: tokens.ink,
    paddingVertical: 0,
    minWidth: 24,
  },
  cellPct: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  presetRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 2,
  },
  presetChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  presetValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },
  presetLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink,
    letterSpacing: 1.44,
  },
  warn: {
    marginTop: 8,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.warn,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});

function slotsKcalSum(
  bySlot: Partial<Record<MealSlot, WeekPlanEntry>>,
): number {
  let sum = 0;
  for (const slot of MEAL_SLOTS) {
    const e = bySlot[slot];
    if (e) sum += e.meal.kcal ?? 0;
  }
  return sum;
}
function formatG(g: number): string {
  if (g === 0) return '0g';
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}

// ─── Styles ──────────────────────────────────────────────────────────────
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

  statRow: {
    paddingTop: 14,
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  statValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.44,
  },
  statStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoSemibold,
  },
  statMute: {
    color: tokens.ink4,
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
  dayDots: {
    flexDirection: 'row',
    gap: 2,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  dayDotOn: { backgroundColor: tokens.accentInk },
  dayDotOff: { backgroundColor: tokens.line },
  dayDotOnSelected: { backgroundColor: tokens.accent },
  dayDotOffSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },

  // Day selected + slots
  dayOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
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
  slotMealName: {
    marginTop: 4,
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  slotMacroLine: {
    marginTop: 3,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  slotMacroNum: { color: tokens.ink3 },
  slotMacroUnit: { color: tokens.ink4 },
  slotMacroSep: { color: tokens.ink4 },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet
  sheet: {
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.line2,
  },
  sheetHeader: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sheetKicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sheetTitle: {
    marginTop: 4,
    fontFamily: fonts.sansSemibold,
    fontSize: 19,
    color: tokens.ink,
    letterSpacing: -0.38,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSearchRow: {
    marginTop: 10,
    marginHorizontal: 22,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sheetSearchInput: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink,
    paddingVertical: 0,
  },
  sheetScroll: {
    marginTop: 12,
    paddingHorizontal: 22,
  },
  sheetEmpty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 24,
  },
  sheetList: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  sheetRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  sheetRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  sheetRowMacros: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
  },
  newMealBtn: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newMealBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.accentInk,
    letterSpacing: 1.98,
  },
});
