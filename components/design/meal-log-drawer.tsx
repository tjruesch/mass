/**
 * Bottom drawer for logging a meal (#85). Two paths in one component:
 *
 *   1. **One-off** — free-form name + manual kcal + macros, single
 *      `meal_items` row with `freeText`.
 *   2. **From library** — pick a saved library meal (added in #87) and
 *      a portion multiplier. The drawer copies the library meal's
 *      `meal_items` into a fresh logged meal with macros scaled by the
 *      portion.
 *
 * Sections:
 *   - Library picker  — 4 recent library meals as chips; "one-off"
 *                       chip falls back to manual entry. Empty until
 *                       #87 makes the new-meal composer available.
 *   - One-off block   — name input + 4 macro fields (visible only
 *                       when no library meal is selected).
 *   - Portion         — ×0.5 / ×0.75 / ×1 / ×1.5 / ×2 chips (visible
 *                       only when a library meal is selected).
 *   - Slot tag        — 4 chips. Default = slot for the current hour.
 *   - When            — `now` (default) + `−1h` quick chips + a custom
 *                       date-time field below.
 *   - kcal hero       — derived; updates as you change values.
 *   - Notes           — optional, ≤200 chars.
 *
 * Edit mode is deferred to #93 (long-press edit affordance). This
 * component ships create-only for now.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addMeal,
  deleteMeal,
  getMealById,
  replaceMealItems,
  updateMeal,
  type MealItemInput,
} from '@/src/db/queries/meals';
import { getPlanEntry } from '@/src/db/queries/meal-plan';
import { useLibraryMeals, useTodayMeals, slotForHour, type MealSlot, MEAL_SLOTS } from '@/src/hooks/use-meals';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimeField } from './datetime-field';
import { Drawer, DrawerSection } from './drawer';
import { PrimaryButton } from './primary-button';

const NOTES_MAX = 200;
const NAME_MAX = 48;
const PORTIONS: ReadonlyArray<number> = [0.5, 0.75, 1, 1.5, 2];

type LibrarySelection =
  | { kind: 'oneOff' }
  | { kind: 'library'; id: number };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-select a slot when the drawer opens — used by /meals slot cards
   *  so tapping "+ log dinner" defaults to dinner instead of hour-of-day. */
  initialSlot?: MealSlot;
  /**
   * Edit mode (#93). When set, the drawer hydrates from this meal and
   * save calls updateMeal + replaceMealItems instead of addMeal.
   *
   * v1 simplification: edit always re-saves as a single-item "one-off"
   * row, regardless of whether the source was a library copy. Macros
   * are editable directly; ingredient-level editing lives on the meal
   * composer (#87). The library breadcrumb is preserved by leaving the
   * meal name intact.
   */
  editingMealId?: number;
};

export function MealLogDrawer({
  open,
  onClose,
  initialSlot,
  editingMealId,
}: Props) {
  const library = useLibraryMeals();
  // Pulled in for the bySlot index — if the user has already logged
  // a meal for the current slot, default the drawer to the next empty
  // one so they don't have to switch manually.
  const today = useTodayMeals();

  const [selection, setSelection] = useState<LibrarySelection>({ kind: 'oneOff' });
  const [name, setName] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbsText, setCarbsText] = useState('');
  const [fatText, setFatText] = useState('');
  const [portion, setPortion] = useState<number>(1);
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [eatenAt, setEatenAt] = useState<Date>(() => new Date());
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  /** True while the edit-mode hydration is in flight. Prevents the
   *  form from reading stale defaults the user starts typing into. */
  const [hydrating, setHydrating] = useState(false);
  /**
   * Edit-mode portion base. Holds the macros at the moment of
   * hydration so the portion chips can scale them without losing the
   * source values across multiple ×N taps. `null` outside edit mode.
   */
  const [editBase, setEditBase] = useState<{
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>(null);

  const isEdit = editingMealId !== undefined;

  // Reset every time the drawer opens — clears any stale state from a
  // prior session, picks a fresh default slot + time. In edit mode we
  // then hydrate from the meal row.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setSelection({ kind: 'oneOff' });
    setName('');
    setKcalText('');
    setProteinText('');
    setCarbsText('');
    setFatText('');
    setPortion(1);
    const initialSlotPick = initialSlot ?? pickDefaultSlot(now, today.bySlot);
    setSlot(initialSlotPick);
    setEatenAt(now);
    setNotes('');
    setSaving(false);

    setEditBase(null);
    if (editingMealId === undefined) {
      // Create mode — best-effort prefill from the plan for today's
      // (date, slot). Falls back to the existing one-off blank state
      // when no plan exists or the lookup fails.
      let cancelled = false;
      getPlanEntry(now, initialSlotPick)
        .then((entry) => {
          if (cancelled || entry === null) return;
          setSelection({ kind: 'library', id: entry.mealId });
        })
        .catch((err) => {
          console.warn('[meal-log] plan lookup failed:', err);
        });
      return () => {
        cancelled = true;
      };
    }
    setHydrating(true);
    let cancelled = false;
    getMealById(editingMealId)
      .then((row) => {
        if (cancelled || !row) return;
        const m = row.meal;
        setName(m.name ?? '');
        setKcalText(m.kcal === null ? '' : formatNum(m.kcal));
        setProteinText(m.proteinG === null ? '' : formatNum(m.proteinG));
        setCarbsText(m.carbsG === null ? '' : formatNum(m.carbsG));
        setFatText(m.fatG === null ? '' : formatNum(m.fatG));
        if (m.eatenAt !== null) {
          setEatenAt(m.eatenAt);
          setSlot(slotForHour(m.eatenAt.getHours()));
        }
        setNotes(m.notes ?? '');
        // Snapshot the hydrated macros as the ×1 base so portion chips
        // can scale relative to "what was originally logged" rather
        // than the most recent ×N apply.
        setEditBase({
          kcal: m.kcal ?? 0,
          proteinG: m.proteinG ?? 0,
          carbsG: m.carbsG ?? 0,
          fatG: m.fatG ?? 0,
        });
        setPortion(1);
      })
      .catch((err) => {
        Alert.alert(
          'Could not load meal',
          err instanceof Error ? err.message : String(err),
        );
        if (!cancelled) onClose();
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally re-run only on the open transition; pulling
    // today/bySlot every render would reseed the slot pick whenever a
    // sibling meal logged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingMealId]);

  // ─── Derived totals ──────────────────────────────────────────────────────

  const libraryMeal = useMemo(() => {
    if (selection.kind !== 'library') return null;
    return library.find((m) => m.id === selection.id) ?? null;
  }, [selection, library]);

  const isOneOff = selection.kind === 'oneOff';

  const oneOffMacros = useMemo(() => {
    return {
      kcal: parseDecimal(kcalText),
      proteinG: parseDecimal(proteinText) ?? 0,
      carbsG: parseDecimal(carbsText) ?? 0,
      fatG: parseDecimal(fatText) ?? 0,
    };
  }, [kcalText, proteinText, carbsText, fatText]);

  const computedKcal = isOneOff
    ? oneOffMacros.kcal
    : libraryMeal != null
    ? (libraryMeal.kcal ?? 0) * portion
    : null;

  const trimmedName = name.trim();
  const trimmedNotes = notes.trim();

  // Edit mode is always the one-off path — see the prop docstring.
  const valid =
    isEdit
      ? trimmedName.length > 0 &&
        oneOffMacros.kcal !== null &&
        oneOffMacros.kcal >= 0
      : isOneOff
      ? trimmedName.length > 0 && oneOffMacros.kcal !== null && oneOffMacros.kcal >= 0
      : libraryMeal !== null;

  // ─── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);

    let mealRow: Parameters<typeof addMeal>[0];
    let items: ReadonlyArray<MealItemInput>;

    // Edit mode treats the form as one-off regardless of original source.
    if (isEdit) {
      mealRow = {
        eatenAt,
        name: trimmedName,
        kcal: oneOffMacros.kcal,
        proteinG: oneOffMacros.proteinG,
        carbsG: oneOffMacros.carbsG,
        fatG: oneOffMacros.fatG,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      };
      items = [
        {
          freeText: trimmedName,
          quantity: 1,
          unit: 'serving',
          kcal: oneOffMacros.kcal,
          proteinG: oneOffMacros.proteinG,
          carbsG: oneOffMacros.carbsG,
          fatG: oneOffMacros.fatG,
        },
      ];
      (async () => {
        await updateMeal(editingMealId!, mealRow);
        await replaceMealItems(editingMealId!, items);
      })()
        .then(() => onClose())
        .catch((err) => {
          Alert.alert(
            'Could not save changes',
            err instanceof Error ? err.message : String(err),
          );
          setSaving(false);
        });
      return;
    }

    if (isOneOff) {
      // Single-item meal whose freeText carries the name. Roll-up
      // macros on the parent mirror the single item.
      mealRow = {
        eatenAt,
        name: trimmedName,
        kcal: oneOffMacros.kcal,
        proteinG: oneOffMacros.proteinG,
        carbsG: oneOffMacros.carbsG,
        fatG: oneOffMacros.fatG,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      };
      items = [
        {
          freeText: trimmedName,
          quantity: 1,
          unit: 'serving',
          kcal: oneOffMacros.kcal,
          proteinG: oneOffMacros.proteinG,
          carbsG: oneOffMacros.carbsG,
          fatG: oneOffMacros.fatG,
        },
      ];
    } else if (libraryMeal !== null) {
      // Library copy: scale parent macros by the portion. Item-level
      // copies happen in a follow-up commit since we'd need to fetch
      // library items via getMealById here — for the first cut, the
      // logged meal carries only the rolled-up macros and a single
      // free-text breadcrumb pointing at the source library entry.
      const scale = portion;
      mealRow = {
        eatenAt,
        name: libraryMeal.name ?? 'Meal',
        kcal: (libraryMeal.kcal ?? 0) * scale,
        proteinG: (libraryMeal.proteinG ?? 0) * scale,
        carbsG: (libraryMeal.carbsG ?? 0) * scale,
        fatG: (libraryMeal.fatG ?? 0) * scale,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      };
      items = [
        {
          freeText: `${libraryMeal.name ?? 'Meal'} · ×${portion}`,
          quantity: scale,
          unit: 'serving',
          kcal: (libraryMeal.kcal ?? 0) * scale,
          proteinG: (libraryMeal.proteinG ?? 0) * scale,
          carbsG: (libraryMeal.carbsG ?? 0) * scale,
          fatG: (libraryMeal.fatG ?? 0) * scale,
        },
      ];
    } else {
      setSaving(false);
      return;
    }

    addMeal(mealRow, items)
      .then(() => onClose())
      .catch((err) => {
        Alert.alert(
          'Could not log meal',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [
    valid,
    saving,
    isEdit,
    editingMealId,
    isOneOff,
    libraryMeal,
    portion,
    oneOffMacros,
    trimmedName,
    trimmedNotes,
    eatenAt,
    onClose,
  ]);

  const handleDelete = useCallback(() => {
    if (!isEdit || editingMealId === undefined || saving) return;
    Alert.alert(
      'Delete this meal?',
      "Today's totals + the home kcal ring will update. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteMeal(editingMealId)
              .then(() => onClose())
              .catch((err) => {
                Alert.alert(
                  'Could not delete',
                  err instanceof Error ? err.message : String(err),
                );
                setSaving(false);
              });
          },
        },
      ],
    );
  }, [isEdit, editingMealId, saving, onClose]);

  // Pre-fill the eatenAt back by one hour while keeping today's date —
  // the most common "I forgot to log" use case.
  const handleQuickWhen = (variant: 'now' | 'minus1h') => {
    setEatenAt(variant === 'now' ? new Date() : new Date(Date.now() - 60 * 60_000));
  };

  /**
   * Edit-mode portion tap. Scales the macro inputs to `editBase × p`.
   * Manual typing afterwards continues to win — the next portion tap
   * still scales from the original `editBase`, not from the typed
   * values, so the chips remain a stable "reset to ×N of original".
   */
  const handleEditPortion = (p: number) => {
    if (!isEdit || editBase === null) return;
    setPortion(p);
    setKcalText(formatNum(editBase.kcal * p));
    setProteinText(formatNum(editBase.proteinG * p));
    setCarbsText(formatNum(editBase.carbsG * p));
    setFatText(formatNum(editBase.fatG * p));
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const ctaLabel = saving
    ? 'saving…'
    : isEdit
    ? valid
      ? `save changes · ${Math.round(computedKcal ?? 0)} kcal`
      : 'name + kcal required'
    : valid
    ? `log ${Math.round(computedKcal ?? 0)} kcal · ${slot}`
    : isOneOff
    ? 'name + kcal required'
    : 'pick a meal';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker={isEdit ? 'MEAL · EDIT' : 'MEAL · LOG'}
      title={isEdit ? 'Edit meal' : 'Log meal'}
      cta={
        <PrimaryButton label={ctaLabel} onPress={handleSave} disabled={!valid || saving} />
      }>
      {/* LIBRARY PICKER — create mode only. Edit mode flattens to the
          one-off form (see prop docstring) so the picker is hidden. */}
      {!isEdit && (
        <DrawerSection
          label="library"
          sub={library.length === 0 ? 'none yet — log as one-off' : undefined}
          marginTop={8}>
          <View style={styles.libraryRow}>
            <Pressable
              onPress={() => setSelection({ kind: 'oneOff' })}
              style={({ pressed }) => [
                styles.libraryChip,
                isOneOff && styles.libraryChipActive,
                pressed && !isOneOff && { opacity: 0.7 },
              ]}>
              <Text
                style={[
                  styles.libraryChipLabel,
                  isOneOff && { color: tokens.bg },
                ]}>
                one-off
              </Text>
            </Pressable>
            {library.slice(0, 4).map((m) => {
              const active =
                selection.kind === 'library' && selection.id === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelection({ kind: 'library', id: m.id })}
                  style={({ pressed }) => [
                    styles.libraryChip,
                    active && styles.libraryChipActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.libraryChipLabel,
                      active && { color: tokens.bg },
                    ]}>
                    {m.name ?? 'Meal'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </DrawerSection>
      )}

      {/* ONE-OFF NAME + MACROS — both in create-one-off and in edit mode. */}
      {(isOneOff || isEdit) && (
        <>
          <DrawerSection label="name">
            <View style={styles.textRow}>
              <TextInput
                value={name}
                onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
                placeholder="e.g. Pizza slice, leftover thai"
                placeholderTextColor={tokens.ink4}
                style={styles.textInput}
              />
            </View>
          </DrawerSection>

          <DrawerSection label="macros">
            <View style={styles.cardList}>
              <MacroRow
                label="kcal"
                value={kcalText}
                onChange={(t) => setKcalText(sanitizeDecimal(t))}
                isLast={false}
              />
              <MacroRow
                label="protein"
                unit="g"
                value={proteinText}
                onChange={(t) => setProteinText(sanitizeDecimal(t))}
                isLast={false}
              />
              <MacroRow
                label="carbs"
                unit="g"
                value={carbsText}
                onChange={(t) => setCarbsText(sanitizeDecimal(t))}
                isLast={false}
              />
              <MacroRow
                label="fat"
                unit="g"
                value={fatText}
                onChange={(t) => setFatText(sanitizeDecimal(t))}
                isLast
              />
            </View>
          </DrawerSection>
        </>
      )}

      {/* PORTION — edit mode shows portion chips that scale the
          hydrated macros (×0.5 → ×2). The chips operate on the
          `editBase` snapshot so re-taps are stable, and the user can
          fine-tune macros manually afterwards. */}
      {isEdit && editBase !== null && (
        <DrawerSection
          label="scale"
          sub="multiplier of the original macros">
          <View style={styles.portionRow}>
            {PORTIONS.map((p) => {
              const active = portion === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => handleEditPortion(p)}
                  style={({ pressed }) => [
                    styles.portionChip,
                    active && styles.portionChipActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text
                    style={[
                      styles.portionLabel,
                      active && { color: tokens.bg },
                    ]}>
                    ×{p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </DrawerSection>
      )}

      {/* PORTION — only when a library meal is selected (create only). */}
      {!isEdit && !isOneOff && libraryMeal !== null && (
        <DrawerSection label="portion" sub={`${libraryMeal.name ?? 'Meal'} · ${Math.round((libraryMeal.kcal ?? 0))} kcal base`}>
          <View style={styles.portionRow}>
            {PORTIONS.map((p) => {
              const active = portion === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPortion(p)}
                  style={({ pressed }) => [
                    styles.portionChip,
                    active && styles.portionChipActive,
                    pressed && !active && { opacity: 0.7 },
                  ]}>
                  <Text
                    style={[
                      styles.portionLabel,
                      active && { color: tokens.bg },
                    ]}>
                    ×{p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </DrawerSection>
      )}

      {/* SLOT */}
      <DrawerSection label="slot">
        <View style={styles.slotRow}>
          {MEAL_SLOTS.map((s) => {
            const active = slot === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSlot(s)}
                style={({ pressed }) => [
                  styles.slotChip,
                  active && styles.slotChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.slotLabel,
                    active && { color: tokens.bg },
                  ]}>
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DrawerSection>

      {/* WHEN */}
      <DrawerSection label="when">
        <View style={styles.whenRow}>
          <Pressable
            onPress={() => handleQuickWhen('now')}
            style={({ pressed }) => [styles.whenChip, pressed && { opacity: 0.7 }]}>
            <Text style={styles.whenChipLabel}>now</Text>
          </Pressable>
          <Pressable
            onPress={() => handleQuickWhen('minus1h')}
            style={({ pressed }) => [styles.whenChip, pressed && { opacity: 0.7 }]}>
            <Text style={styles.whenChipLabel}>−1h</Text>
          </Pressable>
        </View>
        <View style={{ height: 8 }} />
        <DateTimeField
          value={eatenAt}
          onChange={setEatenAt}
          label="eaten"
          title="Eaten at"
          maximumDate={new Date()}
        />
      </DrawerSection>

      {/* NOTES */}
      <DrawerSection label="notes · optional">
        <TextInput
          value={notes}
          onChangeText={(t) => setNotes(t.slice(0, NOTES_MAX))}
          multiline
          placeholder="e.g. with hot sauce, post-workout"
          placeholderTextColor={tokens.ink4}
          style={styles.notesInput}
        />
        <Text style={styles.notesHint}>
          {notes.length}/{NOTES_MAX}
        </Text>
      </DrawerSection>

      {isEdit && (
        <Pressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete this meal"
          disabled={saving}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && { opacity: 0.6 },
          ]}>
          <Text style={[styles.deleteText, textStyles.cap]}>
            delete meal
          </Text>
        </Pressable>
      )}

      <View style={{ height: 12 }} />
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MacroRow — same shape as the pantry editor's macro card.
// ─────────────────────────────────────────────────────────────────────────────
function MacroRow({
  label,
  unit,
  value,
  onChange,
  isLast,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (s: string) => void;
  isLast: boolean;
}) {
  return (
    <View style={[styles.macroRow, !isLast && styles.rowBorder]}>
      <Text style={styles.macroLabel}>{label}</Text>
      <View style={styles.macroInputCell}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="0"
          placeholderTextColor={tokens.ink4}
          maxLength={6}
          style={[styles.macroInput, textStyles.tnum]}
        />
        {unit && <Text style={styles.macroUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeDecimal(s: string): string {
  const normalised = s.replace(',', '.');
  let seenDot = false;
  let out = '';
  for (const ch of normalised) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenDot) {
      out += '.';
      seenDot = true;
    }
  }
  return out;
}

function parseDecimal(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatNum(n: number): string {
  if (n === 0) return '0';
  if (Number.isInteger(n)) return n.toString();
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Choose the most useful default slot:
 *   1. Slot that fits the current hour AND is empty today.
 *   2. Slot that fits the current hour even if it has a meal already.
 *
 * No fallback to the first empty slot — sticking with the hour's slot
 * matches what the user was about to log anyway. They can always tap
 * a different chip.
 */
function pickDefaultSlot(
  now: Date,
  bySlot: Record<MealSlot, ReadonlyArray<unknown>>,
): MealSlot {
  const hourSlot = slotForHour(now.getHours());
  if (bySlot[hourSlot].length === 0) return hourSlot;
  return hourSlot;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  libraryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  libraryChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    maxWidth: 180,
  },
  libraryChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  libraryChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.44,
    textTransform: 'lowercase',
  },

  textRow: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  textInput: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
    paddingVertical: 0,
  },

  cardList: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  macroLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokens.ink,
  },
  macroInputCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 90,
    justifyContent: 'flex-end',
  },
  macroInput: {
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: tokens.ink,
    paddingVertical: 0,
    minWidth: 50,
    textAlign: 'right',
  },
  macroUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },

  portionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  portionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  portionChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  portionLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 0.36,
  },

  slotRow: {
    flexDirection: 'row',
    gap: 6,
  },
  slotChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  slotChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  slotLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.44,
    textTransform: 'lowercase',
  },

  whenRow: {
    flexDirection: 'row',
    gap: 6,
  },
  whenChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  whenChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 0.48,
    textTransform: 'lowercase',
  },

  notesInput: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 70,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokens.ink,
    textAlignVertical: 'top',
  },
  notesHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    marginTop: 4,
    textAlign: 'right',
    letterSpacing: 0.4,
  },

  deleteBtn: {
    marginTop: 18,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  deleteText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 1.92,
  },
});
