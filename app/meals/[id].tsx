/**
 * New-meal composer (#87). Builds reusable library meals from pantry
 * items so the meal log drawer's library picker has something to
 * choose from.
 *
 * Route: /meals/new (create) or /meals/<numeric id> (edit).
 *
 * v1 simplifications:
 *   - Ingredients only support pantry-linked rows with quantity in
 *     grams. Free-text ingredients live in the meal log drawer's
 *     one-off path; library meals are pantry-only.
 *   - Macro rollup multiplies `pantry.kcalPerServing` (always per-100g
 *     since the pantry editor enforces that) by `qtyGrams / 100`.
 *   - No "default slot" column on the meal — the drawer's slot picker
 *     keeps using hour-based defaults. Slot column lands later if the
 *     hour-based default proves wrong often enough.
 *
 * Storage:
 *   - Save writes a `meals` row with `eatenAt = null` (the schema
 *     went nullable in migration 0013 for exactly this case) +
 *     pre-computed roll-up macros, plus N `meal_items` rows.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Glyph, SubHeader } from '@/components/design';
import {
  addMeal,
  getMealById,
  replaceMealItems,
  updateMeal,
  type MealItemInput,
} from '@/src/db/queries/meals';
import type { PantryItem } from '@/src/db/schema';
import { usePantryItems, useRecentPantryItems } from '@/src/hooks/use-pantry';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const NAME_MAX = 48;
const QTY_MAX = 10_000; // grams cap — silly upper bound to keep input sane

type IngredientDraft = {
  /** Stable client id for keying when the row's pantry assignment changes. */
  tempId: string;
  pantryItemId: number | null;
  /** Grams. */
  quantity: number;
};

export default function MealComposerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isCreate = id === 'new';
  const numericId = !isCreate && typeof id === 'string' ? Number(id) : null;
  const mode: 'create' | 'edit' = isCreate ? 'create' : 'edit';

  const pantry = usePantryItems();
  const recent = useRecentPantryItems(6);
  const pantryById = useMemo(() => {
    const map = new Map<number, PantryItem>();
    for (const p of pantry) map.set(p.id, p);
    return map;
  }, [pantry]);

  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [pickerStepId, setPickerStepId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate on mount. Create mode seeds one empty ingredient row so the
  // user sees the layout immediately.
  useEffect(() => {
    if (hydrated) return;
    if (isCreate) {
      setIngredients([
        { tempId: freshTempId(), pantryItemId: null, quantity: 100 },
      ]);
      setHydrated(true);
      return;
    }
    if (numericId === null || !Number.isFinite(numericId)) {
      router.back();
      return;
    }
    getMealById(numericId)
      .then((row) => {
        if (!row) {
          Alert.alert('Meal not found', 'It may have been deleted.');
          router.back();
          return;
        }
        setName(row.meal.name ?? '');
        setIngredients(
          row.items.map((it, i) => ({
            tempId: `i-${i}-${it.id}`,
            pantryItemId: it.pantryItemId ?? null,
            quantity: it.quantity,
          })),
        );
        setHydrated(true);
      })
      .catch((err) => {
        Alert.alert(
          'Could not load',
          err instanceof Error ? err.message : String(err),
        );
        router.back();
      });
  }, [isCreate, numericId, hydrated, router]);

  // ─── Computed roll-up ────────────────────────────────────────────────────

  const rollup = useMemo(() => {
    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    for (const ing of ingredients) {
      if (ing.pantryItemId === null) continue;
      const p = pantryById.get(ing.pantryItemId);
      if (!p) continue;
      // Pantry stores per-100g. Multiply qty/100 to get this ingredient's
      // contribution. Mirrors the math in the meal log drawer's library
      // copy path.
      const factor = ing.quantity / 100;
      kcal += p.kcalPerServing * factor;
      proteinG += p.proteinG * factor;
      carbsG += p.carbsG * factor;
      fatG += p.fatG * factor;
    }
    return { kcal, proteinG, carbsG, fatG };
  }, [ingredients, pantryById]);

  const trimmedName = name.trim();
  // Valid when name set + at least one ingredient with a pantry link.
  // Empty pantry-less rows are tolerated until save (they're filtered).
  const validIngredients = ingredients.filter(
    (i) => i.pantryItemId !== null && i.quantity > 0,
  );
  const valid = trimmedName.length > 0 && validIngredients.length > 0;

  // ─── Ingredient editing ──────────────────────────────────────────────────

  const updateIngredient = (tempId: string, patch: Partial<IngredientDraft>) =>
    setIngredients((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)),
    );

  const removeIngredient = (tempId: string) =>
    setIngredients((prev) => prev.filter((i) => i.tempId !== tempId));

  const addIngredient = () =>
    setIngredients((prev) => [
      ...prev,
      { tempId: freshTempId(), pantryItemId: null, quantity: 100 },
    ]);

  const togglePicker = (tempId: string) => {
    setPickerStepId((cur) => (cur === tempId ? null : tempId));
    setPickerSearch('');
  };
  const selectPantryItem = (tempId: string, pantryItemId: number) => {
    updateIngredient(tempId, { pantryItemId });
    setPickerStepId(null);
    setPickerSearch('');
  };

  // Filter for the picker — uses the live list (alphabetical).
  const filteredPantry = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (q === '') return pantry;
    return pantry.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand !== null && p.brand.toLowerCase().includes(q)),
    );
  }, [pantry, pickerSearch]);

  // ─── Save / Delete ───────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);

    const items: ReadonlyArray<MealItemInput> = validIngredients.map((ing) => {
      const p = pantryById.get(ing.pantryItemId!)!;
      const factor = ing.quantity / 100;
      return {
        pantryItemId: p.id,
        quantity: ing.quantity,
        unit: 'g',
        kcal: p.kcalPerServing * factor,
        proteinG: p.proteinG * factor,
        carbsG: p.carbsG * factor,
        fatG: p.fatG * factor,
      };
    });

    const parent = {
      eatenAt: null,
      name: trimmedName,
      kcal: rollup.kcal,
      proteinG: rollup.proteinG,
      carbsG: rollup.carbsG,
      fatG: rollup.fatG,
      notes: null,
    };

    const op =
      mode === 'edit' && numericId !== null
        ? (async () => {
            await updateMeal(numericId, parent);
            await replaceMealItems(numericId, items);
          })()
        : addMeal(parent, items);

    op
      .then(() => router.back())
      .catch((err) => {
        Alert.alert(
          mode === 'edit' ? 'Could not save meal' : 'Could not create meal',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [
    valid,
    saving,
    mode,
    numericId,
    validIngredients,
    pantryById,
    trimmedName,
    rollup,
    router,
  ]);

  if (mode === 'edit' && !hydrated) {
    return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title={mode === 'edit' ? 'Edit meal' : 'New meal'}
          back="Meals"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={handleSave}
              disabled={!valid || saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save meal"
              style={({ pressed }) => [
                styles.saveBtn,
                (!valid || saving) && { opacity: 0.35 },
                pressed && valid && !saving && { opacity: 0.7 },
              ]}>
              <Text style={[styles.saveBtnText, textStyles.cap]}>
                {saving ? 'saving' : 'save'}
              </Text>
            </Pressable>
          }
        />

        {/* NAME */}
        <Section label="name" marginTop={12}>
          <View style={styles.textRow}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
              placeholder="e.g. Greek yoghurt + berries"
              placeholderTextColor={tokens.ink4}
              style={styles.textInput}
            />
          </View>
        </Section>

        {/* INGREDIENTS */}
        <Section
          label="ingredients"
          sub={pantry.length === 0 ? 'pantry is empty — add items first' : undefined}>
          <View style={styles.ingredientList}>
            {ingredients.map((ing) => (
              <IngredientRow
                key={ing.tempId}
                ingredient={ing}
                pantryItem={
                  ing.pantryItemId !== null
                    ? pantryById.get(ing.pantryItemId) ?? null
                    : null
                }
                pickerOpen={pickerStepId === ing.tempId}
                pantryEmpty={pantry.length === 0}
                searchValue={pickerStepId === ing.tempId ? pickerSearch : ''}
                filteredPantry={
                  pickerStepId === ing.tempId ? filteredPantry : []
                }
                recent={recent}
                onTogglePicker={() => togglePicker(ing.tempId)}
                onSearchChange={setPickerSearch}
                onSelectPantry={(pid) => selectPantryItem(ing.tempId, pid)}
                onChangeQty={(q) => updateIngredient(ing.tempId, { quantity: q })}
                onRemove={() => removeIngredient(ing.tempId)}
              />
            ))}
          </View>
          {pantry.length > 0 && (
            <Pressable
              onPress={addIngredient}
              style={({ pressed }) => [
                styles.addIngredientBtn,
                pressed && { opacity: 0.55 },
              ]}>
              <Glyph name="plus" color={tokens.ink3} size={11} />
              <Text style={[styles.addIngredientText, textStyles.cap]}>
                add ingredient
              </Text>
            </Pressable>
          )}
          {pantry.length === 0 && (
            <Pressable
              onPress={() => router.push('/pantry/new' as never)}
              style={({ pressed }) => [
                styles.addIngredientBtn,
                pressed && { opacity: 0.55 },
              ]}>
              <Glyph name="plus" color={tokens.ink3} size={11} />
              <Text style={[styles.addIngredientText, textStyles.cap]}>
                add pantry item
              </Text>
            </Pressable>
          )}
        </Section>

        {/* ROLL-UP */}
        <Section label="rollup" sub="live · sum of ingredients">
          <View style={styles.rollupCard}>
            <View style={styles.rollupKcalRow}>
              <Text style={[styles.rollupKcal, textStyles.tnum]}>
                {Math.round(rollup.kcal)}
              </Text>
              <Text style={styles.rollupKcalUnit}>kcal</Text>
            </View>
            <View style={styles.rollupMacros}>
              <MacroLeg label="P" value={rollup.proteinG} />
              <MacroLeg label="C" value={rollup.carbsG} />
              <MacroLeg label="F" value={rollup.fatG} />
            </View>
          </View>
        </Section>

        {!valid && (
          <Text style={styles.bottomHint}>
            {trimmedName.length === 0
              ? 'name required'
              : 'pick a pantry item for at least one ingredient'}
          </Text>
        )}

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IngredientRow — pantry chip + grams input + remove. Tap chip expands
// an inline picker below: recent first, full filtered list after.
// ─────────────────────────────────────────────────────────────────────────────
function IngredientRow({
  ingredient,
  pantryItem,
  pickerOpen,
  pantryEmpty,
  searchValue,
  filteredPantry,
  recent,
  onTogglePicker,
  onSearchChange,
  onSelectPantry,
  onChangeQty,
  onRemove,
}: {
  ingredient: IngredientDraft;
  pantryItem: PantryItem | null;
  pickerOpen: boolean;
  pantryEmpty: boolean;
  searchValue: string;
  filteredPantry: ReadonlyArray<PantryItem>;
  recent: ReadonlyArray<PantryItem>;
  onTogglePicker: () => void;
  onSearchChange: (s: string) => void;
  onSelectPantry: (pantryItemId: number) => void;
  onChangeQty: (q: number) => void;
  onRemove: () => void;
}) {
  const [qtyText, setQtyText] = useState(ingredient.quantity.toString());
  useEffect(() => {
    // Re-sync if the parent changes qty externally (rare; mostly the
    // first paint after hydration). Avoids the input drifting from
    // state when the value comes in async.
    setQtyText(ingredient.quantity.toString());
  }, [ingredient.quantity]);

  const commitQty = (s: string) => {
    const cleaned = sanitizeQty(s);
    setQtyText(cleaned);
    const n = parseQty(cleaned);
    if (n !== null) onChangeQty(n);
  };

  return (
    <View style={styles.ingredientRow}>
      <View style={styles.ingredientHeadRow}>
        <Pressable
          onPress={onTogglePicker}
          disabled={pantryEmpty}
          accessibilityRole="button"
          accessibilityLabel="Pick a pantry item"
          style={({ pressed }) => [
            styles.pantryChip,
            pickerOpen && styles.pantryChipOpen,
            pantryEmpty && { opacity: 0.35 },
            pressed && !pantryEmpty && { opacity: 0.7 },
          ]}>
          <Text
            numberOfLines={1}
            style={[
              styles.pantryChipLabel,
              pickerOpen && { color: tokens.bg },
            ]}>
            {pantryItem !== null
              ? pantryItem.name
              : pantryEmpty
              ? 'no pantry items'
              : 'pick a pantry item'}
          </Text>
          <Glyph name="chev" color={pickerOpen ? tokens.bg : tokens.ink3} />
        </Pressable>
        <View style={styles.qtyCell}>
          <TextInput
            value={qtyText}
            onChangeText={commitQty}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={5}
            placeholder="0"
            placeholderTextColor={tokens.ink4}
            style={[styles.qtyInput, textStyles.tnum]}
          />
          <Text style={styles.qtyUnit}>g</Text>
        </View>
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Remove ingredient"
          style={({ pressed }) => [
            styles.removeBtn,
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

      {pickerOpen && (
        <View style={styles.picker}>
          <View style={styles.searchRow}>
            <TextInput
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder="search pantry"
              placeholderTextColor={tokens.ink4}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
          {searchValue.trim() === '' && recent.length > 0 && (
            <View style={styles.pickerSection}>
              <Text style={[styles.pickerSectionLabel, textStyles.cap]}>
                recent
              </Text>
              <View style={styles.pickerGrid}>
                {recent.map((p) => (
                  <PickerChip
                    key={`r-${p.id}`}
                    label={p.name}
                    active={ingredient.pantryItemId === p.id}
                    onPress={() => onSelectPantry(p.id)}
                  />
                ))}
              </View>
            </View>
          )}
          <View style={styles.pickerSection}>
            <Text style={[styles.pickerSectionLabel, textStyles.cap]}>
              all · {filteredPantry.length}
            </Text>
            {filteredPantry.length === 0 ? (
              <Text style={styles.pickerEmpty}>no match</Text>
            ) : (
              <View style={styles.pickerList}>
                {filteredPantry.map((p, i) => {
                  const active = ingredient.pantryItemId === p.id;
                  const isLast = i === filteredPantry.length - 1;
                  return (
                    <Pressable
                      key={`a-${p.id}`}
                      onPress={() => onSelectPantry(p.id)}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        !isLast && styles.pickerRowBorder,
                        active && { backgroundColor: tokens.bg2 },
                        pressed && !active && { opacity: 0.7 },
                      ]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.pickerRowName}>{p.name}</Text>
                        {p.brand !== null && p.brand !== '' && (
                          <Text style={styles.pickerRowBrand}>{p.brand}</Text>
                        )}
                      </View>
                      <Text style={[styles.pickerRowKcal, textStyles.tnum]}>
                        {Math.round(p.kcalPerServing)} kcal/100g
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function PickerChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.recentChip,
        active && styles.recentChipActive,
        pressed && !active && { opacity: 0.7 },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.recentChipLabel,
          active && { color: tokens.bg },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MacroLeg({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.macroLeg}>
      <Text style={styles.macroLegLetter}>{label}</Text>
      <Text style={[styles.macroLegValue, textStyles.tnum]}>
        {formatMacro(value)}
      </Text>
    </View>
  );
}

// ─── Section helper ────────────────────────────────────────────────────────
function Section({
  label,
  sub,
  marginTop = 18,
  children,
}: {
  label: string;
  sub?: string;
  marginTop?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 22, marginTop }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, textStyles.cap]}>{label}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function freshTempId(): string {
  return `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeQty(s: string): string {
  const digits = s.replace(/[^0-9]/g, '');
  return digits.slice(0, 5);
}

function parseQty(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > QTY_MAX) return null;
  return n;
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
    paddingBottom: 80,
  },

  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: tokens.ink,
  },
  saveBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.bg,
    letterSpacing: 1.92,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    gap: 12,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  textRow: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  textInput: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
    paddingVertical: 0,
  },

  ingredientList: {
    gap: 8,
  },
  ingredientRow: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  ingredientHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pantryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bg2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  pantryChipOpen: {
    backgroundColor: tokens.ink,
  },
  pantryChipLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  qtyCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: tokens.bg2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  qtyInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    paddingVertical: 0,
    minWidth: 38,
    textAlign: 'right',
  },
  qtyUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  picker: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    gap: 12,
  },
  searchRow: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink,
    paddingVertical: 0,
  },
  pickerSection: {
    gap: 8,
  },
  pickerSectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.8,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  recentChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    maxWidth: 180,
  },
  recentChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  recentChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.44,
    textTransform: 'lowercase',
  },
  pickerList: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 10,
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  pickerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  pickerRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  pickerRowBrand: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
  },
  pickerRowKcal: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  pickerEmpty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 14,
  },

  addIngredientBtn: {
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addIngredientText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },

  rollupCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  rollupKcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  rollupKcal: {
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.48,
  },
  rollupKcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  rollupMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroLeg: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  macroLegLetter: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink4,
    letterSpacing: 1.92,
  },
  macroLegValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
    color: tokens.ink,
  },

  bottomHint: {
    marginTop: 16,
    marginHorizontal: 22,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});
