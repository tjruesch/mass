/**
 * New-meal composer (#87). Builds reusable library meals from pantry
 * items so the meal log drawer's library picker has something to
 * choose from.
 *
 * Route: /meals/new (create) or /meals/<numeric id> (edit).
 *
 * Visual layout follows `designs/screen-meals-new.jsx`:
 *   1. Header — kicker "meals · library" + h1 title + circular X close.
 *   2. NAME — bold sans-serif name input with an accent bar at the right
 *      (terracotta vertical line, design flourish).
 *   3. INGREDIENTS — single card containing all ingredient rows
 *      (stock dot · name · qty · trash) plus a "+ add ingredient" footer
 *      row inside the same card. Tap the footer or any row to open the
 *      pantry picker sheet.
 *   4. MACROS (auto · from ingredients) — card with the kcal hero on
 *      the left, P/C/F mini stack on the right, and a stacked bar at
 *      the bottom whose widths are driven by each macro's kcal share.
 *   5. Bottom CTA — fixed full-width "save to library" / "save changes"
 *      button above the home indicator.
 *
 * Deliberately skipped (filed elsewhere):
 *   - "meal time" tag chips — confirmed not needed.
 *   - Prep-time slider + per-row stock dots → #94 (`prep_minutes` column,
 *     #90 owns the stock model).
 *
 * v1 simplifications:
 *   - Ingredients only support pantry-linked rows with quantity in
 *     grams. Free-text ingredients live in the meal log drawer.
 *   - Macro rollup multiplies `pantry.kcalPerServing` (per-100g) by
 *     `qtyGrams / 100`.
 *
 * Storage:
 *   - Save writes a `meals` row with `eatenAt = null` (nullable as of
 *     migration 0013) + pre-computed rollup macros, plus N
 *     `meal_items` rows.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { BottomSheet, Glyph } from '@/components/design';
import {
  addMeal,
  getMealById,
  replaceMealItems,
  updateMeal,
  type MealItemInput,
} from '@/src/db/queries/meals';
import { addPantryItemFromName } from '@/src/db/queries/pantry';
import type { PantryItem } from '@/src/db/schema';
import { usePantryItems, useRecentPantryItems } from '@/src/hooks/use-pantry';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const NAME_MAX = 48;
const QTY_MAX = 10_000; // grams cap — sane upper bound for ingredient input
/** Picked-pantry stock dot color. Becomes dynamic when #90 lands the
 *  stock model and tells us whether the pantry has enough on hand. */
const STOCK_OK_COLOR = '#1F7A3A';

type IngredientDraft = {
  /** Stable client id so React keying survives pantry / qty edits. */
  tempId: string;
  pantryItemId: number;
  /** Grams. */
  quantity: number;
};

type PickerMode =
  | { kind: 'closed' }
  /** Append a fresh ingredient row with the user's selection. */
  | { kind: 'add' }
  /** Replace the pantry assignment on an existing draft row. */
  | { kind: 'edit'; tempId: string };

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
  const [picker, setPicker] = useState<PickerMode>({ kind: 'closed' });
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the form. Create mode starts blank; edit mode pulls the
  // meal + its items and remaps to drafts.
  useEffect(() => {
    if (hydrated) return;
    if (isCreate) {
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
          row.items
            .filter((it) => it.pantryItemId !== null)
            .map((it, i) => ({
              tempId: `i-${i}-${it.id}`,
              pantryItemId: it.pantryItemId!,
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

  // ─── Rollup (kcal + macros) ──────────────────────────────────────────────
  const rollup = useMemo(() => {
    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;
    for (const ing of ingredients) {
      const p = pantryById.get(ing.pantryItemId);
      if (!p) continue;
      const factor = ing.quantity / 100;
      kcal += p.kcalPerServing * factor;
      proteinG += p.proteinG * factor;
      carbsG += p.carbsG * factor;
      fatG += p.fatG * factor;
    }
    return { kcal, proteinG, carbsG, fatG };
  }, [ingredients, pantryById]);

  const trimmedName = name.trim();
  const valid = trimmedName.length > 0 && ingredients.length > 0;

  // ─── Ingredient editing ──────────────────────────────────────────────────

  const updateIngredient = (tempId: string, patch: Partial<IngredientDraft>) =>
    setIngredients((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)),
    );
  const removeIngredient = (tempId: string) =>
    setIngredients((prev) => prev.filter((i) => i.tempId !== tempId));

  const handlePickerSelect = (pantryItemId: number) => {
    if (picker.kind === 'add') {
      setIngredients((prev) => [
        ...prev,
        { tempId: freshTempId(), pantryItemId, quantity: 100 },
      ]);
    } else if (picker.kind === 'edit') {
      updateIngredient(picker.tempId, { pantryItemId });
    }
    setPicker({ kind: 'closed' });
  };

  /**
   * Creates a pantry item from the picker's search query and assigns
   * it to the current ingredient row. The LLM autofill runs in the
   * background — the row appears immediately at 0-macros, then the
   * rollup card updates when the inference lands (via useLiveQuery).
   */
  const handlePickerAddNew = async (name: string) => {
    try {
      const item = await addPantryItemFromName(name);
      handlePickerSelect(item.id);
    } catch (err) {
      Alert.alert(
        'Could not add pantry item',
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  // ─── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);

    const items: ReadonlyArray<MealItemInput> = ingredients.map((ing) => {
      const p = pantryById.get(ing.pantryItemId)!;
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
    ingredients,
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
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.headerOuter}>
          <View style={styles.headerCol}>
            <Text style={[styles.headerKicker, textStyles.cap]}>
              meals · library
            </Text>
            <Text style={styles.headerTitle}>
              {mode === 'edit' ? 'Edit meal' : 'New meal'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.back()}
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

        {/* ── NAME ───────────────────────────────────────────────────── */}
        <Section label="name" marginTop={18}>
          <View style={styles.nameCard}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
              placeholder="e.g. Greek yogurt + berries"
              placeholderTextColor={tokens.ink4}
              style={styles.nameInput}
            />
            <View style={styles.nameAccent} />
          </View>
        </Section>

        {/* ── INGREDIENTS ────────────────────────────────────────────── */}
        <Section
          label="ingredients"
          sub={
            ingredients.length === 0
              ? undefined
              : `${ingredients.length} item${ingredients.length === 1 ? '' : 's'}`
          }>
          <View style={styles.ingredientsCard}>
            {ingredients.map((ing, i) => {
              const p = pantryById.get(ing.pantryItemId);
              const isLast = i === ingredients.length - 1;
              return (
                <IngredientRow
                  key={ing.tempId}
                  pantryItem={p ?? null}
                  quantity={ing.quantity}
                  showBorder={!isLast}
                  onTapName={() =>
                    setPicker({ kind: 'edit', tempId: ing.tempId })
                  }
                  onChangeQty={(q) =>
                    updateIngredient(ing.tempId, { quantity: q })
                  }
                  onRemove={() => removeIngredient(ing.tempId)}
                />
              );
            })}

            {/* In-card footer — "+ add ingredient" + pantry count. */}
            <Pressable
              onPress={() => {
                if (pantry.length === 0) {
                  router.push('/pantry/new' as never);
                  return;
                }
                setPicker({ kind: 'add' });
              }}
              accessibilityRole="button"
              accessibilityLabel="Add ingredient"
              style={({ pressed }) => [
                styles.addRow,
                ingredients.length > 0 && styles.addRowBorder,
                pressed && { opacity: 0.65 },
              ]}>
              <View style={styles.addRowLeft}>
                <Glyph name="plus" color={tokens.accentInk} size={11} />
                <Text style={[styles.addRowText, textStyles.cap]}>
                  add ingredient
                </Text>
              </View>
              <Text style={styles.addRowHint}>
                {pantry.length === 0
                  ? 'pantry empty — add first'
                  : `from pantry · ${pantry.length}`}
              </Text>
            </Pressable>
          </View>
        </Section>

        {/* ── MACROS ─────────────────────────────────────────────────── */}
        <Section label="macros" sub="auto · from ingredients">
          <MacrosCard rollup={rollup} />
        </Section>

        {!valid && (
          <Text style={styles.bottomHint}>
            {trimmedName.length === 0
              ? 'name required'
              : 'add at least one ingredient'}
          </Text>
        )}

        <View style={{ height: 28 }} />
      </ScrollView>

      {/* ── Fixed bottom CTA ─────────────────────────────────────────── */}
      <View style={styles.ctaWrap} pointerEvents="box-none">
        <Pressable
          onPress={handleSave}
          disabled={!valid || saving}
          accessibilityRole="button"
          accessibilityLabel="Save meal"
          style={({ pressed }) => [
            styles.cta,
            (!valid || saving) && styles.ctaDisabled,
            pressed && valid && !saving && { opacity: 0.85 },
          ]}>
          <Text style={[styles.ctaText, textStyles.cap]}>
            {saving
              ? mode === 'edit'
                ? 'saving'
                : 'saving'
              : mode === 'edit'
              ? 'save changes'
              : 'save to library'}
          </Text>
          <Svg width={10} height={10} viewBox="0 0 10 10">
            <Path
              d="M3 2l3 3-3 3"
              stroke={tokens.accent}
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      {/* ── Pantry picker sheet ──────────────────────────────────────── */}
      <PantryPickerSheet
        open={picker.kind !== 'closed'}
        onClose={() => setPicker({ kind: 'closed' })}
        pantry={pantry}
        recent={recent}
        selectedId={
          picker.kind === 'edit'
            ? ingredients.find((i) => i.tempId === picker.tempId)
                ?.pantryItemId ?? null
            : null
        }
        onSelect={handlePickerSelect}
        onAddNew={handlePickerAddNew}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IngredientRow — single line in the ingredients card.
//   [stock dot] · [name (tap to repick)] · [qty input · g] · [trash]
// ─────────────────────────────────────────────────────────────────────────────
function IngredientRow({
  pantryItem,
  quantity,
  showBorder,
  onTapName,
  onChangeQty,
  onRemove,
}: {
  pantryItem: PantryItem | null;
  quantity: number;
  showBorder: boolean;
  onTapName: () => void;
  onChangeQty: (q: number) => void;
  onRemove: () => void;
}) {
  const [qtyText, setQtyText] = useState(quantity.toString());
  useEffect(() => {
    setQtyText(quantity.toString());
  }, [quantity]);

  const commitQty = (s: string) => {
    const cleaned = sanitizeQty(s);
    setQtyText(cleaned);
    const n = parseQty(cleaned);
    if (n !== null) onChangeQty(n);
  };

  return (
    <View style={[styles.ingRow, showBorder && styles.ingRowBorder]}>
      <View style={[styles.stockDot, { backgroundColor: STOCK_OK_COLOR }]} />
      <Pressable
        onPress={onTapName}
        accessibilityRole="button"
        accessibilityLabel="Change pantry item"
        style={({ pressed }) => [
          styles.ingNameWrap,
          pressed && { opacity: 0.65 },
        ]}>
        <Text numberOfLines={1} style={styles.ingName}>
          {pantryItem?.name ?? 'Pantry item'}
        </Text>
      </Pressable>
      <View style={styles.qtyCell}>
        <TextInput
          value={qtyText}
          onChangeText={commitQty}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={5}
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
          styles.trashBtn,
          pressed && { opacity: 0.55 },
        ]}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path
            d="M2 4h10M4 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"
            stroke={tokens.ink4}
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MacrosCard — kcal hero on the left, P/C/F mini stack on the right,
// stacked bar at the bottom. Bar widths derive from each macro's kcal
// share (P/C @ 4 kcal/g, F @ 9). Zero-ingredient case collapses to the
// bg track so the bar reads as empty rather than evenly split.
// ─────────────────────────────────────────────────────────────────────────────
function MacrosCard({
  rollup,
}: {
  rollup: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}) {
  const pKcal = rollup.proteinG * 4;
  const cKcal = rollup.carbsG * 4;
  const fKcal = rollup.fatG * 9;
  const sum = pKcal + cKcal + fKcal;
  const flexP = sum > 0 ? pKcal : 0;
  const flexC = sum > 0 ? cKcal : 0;
  const flexF = sum > 0 ? fKcal : 0;
  const flexTail = sum > 0 ? 0 : 1;

  return (
    <View style={styles.macrosCard}>
      <View style={styles.macrosTopRow}>
        <View style={styles.kcalRow}>
          <Text style={[styles.kcalNumber, textStyles.tnum]}>
            {Math.round(rollup.kcal)}
          </Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
        <View style={styles.macroLegs}>
          <MacroLeg letter="P" color={tokens.ink} value={rollup.proteinG} />
          <MacroLeg letter="C" color={tokens.cool} value={rollup.carbsG} />
          <MacroLeg
            letter="F"
            color={tokens.accentInk}
            value={rollup.fatG}
          />
        </View>
      </View>
      <View style={styles.macrosBar}>
        <View style={{ flex: flexP, backgroundColor: tokens.ink }} />
        <View style={{ flex: flexC, backgroundColor: tokens.cool }} />
        <View style={{ flex: flexF, backgroundColor: tokens.accentInk }} />
        <View style={{ flex: flexTail }} />
      </View>
    </View>
  );
}

function MacroLeg({
  letter,
  color,
  value,
}: {
  letter: string;
  color: string;
  value: number;
}) {
  return (
    <View style={styles.macroLeg}>
      <Text style={[styles.macroLegLetter, { color }]}>{letter}</Text>
      <Text style={[styles.macroLegValue, textStyles.tnum]}>
        {formatMacroNoUnit(value)}
        <Text style={styles.macroLegUnit}>g</Text>
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PantryPickerSheet — BottomSheet listing pantry items with a search
// field, a "recent" chip row, and an alphabetical full list.
// ─────────────────────────────────────────────────────────────────────────────
function PantryPickerSheet({
  open,
  onClose,
  pantry,
  recent,
  selectedId,
  onSelect,
  onAddNew,
}: {
  open: boolean;
  onClose: () => void;
  pantry: ReadonlyArray<PantryItem>;
  recent: ReadonlyArray<PantryItem>;
  selectedId: number | null;
  onSelect: (pantryItemId: number) => void;
  /** Caller creates a pantry item from the typed name + fires LLM
   *  autofill in the background, then selects the new row. */
  onAddNew: (name: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  // Clear search on each open so a stale filter from a prior pick doesn't
  // hide everything when the sheet pops up again.
  useEffect(() => {
    if (open) {
      setSearch('');
      setAddingNew(false);
    }
  }, [open]);

  // Pad the scroll content by the keyboard height so the search field's
  // matches can scroll above the keyboard. The sheet itself stays
  // anchored to the bottom — lifting the whole sheet pushed it too high
  // and felt cramped at the top.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    // `keyboardWillShow` fires earlier than `keyboardDidShow` on iOS,
    // letting us animate alongside the keyboard slide.
    const sShow = Keyboard.addListener('keyboardWillShow', (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const sHide = Keyboard.addListener('keyboardWillHide', () => {
      setKbHeight(0);
    });
    return () => {
      sShow.remove();
      sHide.remove();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return pantry;
    return pantry.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand !== null && p.brand.toLowerCase().includes(q)),
    );
  }, [pantry, search]);

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.sheetHandleWrap}>
        <View style={styles.sheetHandle} />
      </View>
      <View style={styles.sheetHeader}>
        <Text style={[styles.headerKicker, textStyles.cap]}>
          ingredient · pick
        </Text>
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
          placeholder="search pantry"
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
        {search.trim() === '' && recent.length > 0 && (
          <View style={styles.sheetSection}>
            <Text style={[styles.sheetSectionLabel, textStyles.cap]}>
              recent
            </Text>
            <View style={styles.recentGrid}>
              {recent.map((p) => (
                <Pressable
                  key={`r-${p.id}`}
                  onPress={() => onSelect(p.id)}
                  style={({ pressed }) => [
                    styles.recentChip,
                    selectedId === p.id && styles.recentChipActive,
                    pressed && { opacity: 0.65 },
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.recentChipLabel,
                      selectedId === p.id && { color: tokens.bg },
                    ]}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <View style={styles.sheetSection}>
          <Text style={[styles.sheetSectionLabel, textStyles.cap]}>
            all · {filtered.length}
          </Text>
          {filtered.length === 0 ? (
            <View>
              <Text style={styles.sheetEmpty}>no match</Text>
              {search.trim().length >= 2 && (
                <Pressable
                  onPress={async () => {
                    const name = search.trim();
                    setAddingNew(true);
                    try {
                      await onAddNew(name);
                    } finally {
                      setAddingNew(false);
                    }
                  }}
                  disabled={addingNew}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${search.trim()} to pantry`}
                  style={({ pressed }) => [
                    styles.sheetAddNewBtn,
                    addingNew && { opacity: 0.5 },
                    pressed && !addingNew && { opacity: 0.7 },
                  ]}>
                  <Glyph
                    name="plus"
                    color={tokens.accentInk}
                    size={11}
                  />
                  <Text
                    style={[styles.sheetAddNewText, textStyles.cap]}
                    numberOfLines={1}>
                    {addingNew
                      ? `adding "${search.trim()}"…`
                      : `add "${search.trim()}" to pantry`}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.sheetList}>
              {filtered.map((p, i) => {
                const isLast = i === filtered.length - 1;
                const active = selectedId === p.id;
                return (
                  <Pressable
                    key={`a-${p.id}`}
                    onPress={() => onSelect(p.id)}
                    style={({ pressed }) => [
                      styles.sheetRow,
                      !isLast && styles.sheetRowBorder,
                      active && { backgroundColor: tokens.bg2 },
                      pressed && !active && { opacity: 0.7 },
                    ]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.sheetRowName}>{p.name}</Text>
                      {p.brand !== null && p.brand !== '' && (
                        <Text style={styles.sheetRowBrand}>{p.brand}</Text>
                      )}
                    </View>
                    <Text style={[styles.sheetRowKcal, textStyles.tnum]}>
                      {Math.round(p.kcalPerServing)} kcal/100g
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Section helper ────────────────────────────────────────────────────────
function Section({
  label,
  sub,
  marginTop = 16,
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
  return s.replace(/[^0-9]/g, '').slice(0, 5);
}
function parseQty(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > QTY_MAX) return null;
  return n;
}
function formatMacroNoUnit(g: number): string {
  if (g === 0) return '0';
  if (Number.isInteger(g)) return `${g}`;
  return `${Math.round(g * 10) / 10}`;
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    // Room for the fixed bottom CTA — 50 button + 14 gap + 30 safe area.
    paddingBottom: 110,
  },

  // ── Header ───────────────────────────────────────────────────────
  headerOuter: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCol: {
    flex: 1,
    minWidth: 0,
  },
  headerKicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  headerTitle: {
    marginTop: 5,
    fontFamily: fonts.sansSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.44,
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

  // ── Section header ───────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 12,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  // ── NAME ────────────────────────────────────────────────────────
  nameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  nameInput: {
    flex: 1,
    fontFamily: fonts.sansSemibold,
    fontSize: 17,
    color: tokens.ink,
    letterSpacing: -0.26,
    paddingVertical: 0,
  },
  nameAccent: {
    width: 2,
    height: 20,
    borderRadius: 1,
    backgroundColor: tokens.accentInk,
  },

  // ── INGREDIENTS ─────────────────────────────────────────────────
  ingredientsCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  ingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  ingNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  ingName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  qtyCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  qtyInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    minWidth: 32,
    textAlign: 'right',
    paddingVertical: 0,
  },
  qtyUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
  },
  trashBtn: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.012)',
  },
  addRowBorder: {
    borderTopWidth: 1,
    borderTopColor: tokens.line,
  },
  addRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addRowText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.accentInk,
    letterSpacing: 1.8,
  },
  addRowHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  // ── MACROS ──────────────────────────────────────────────────────
  macrosCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  macrosTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  kcalNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 28,
    color: tokens.ink,
    letterSpacing: -0.84,
  },
  kcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  macroLegs: {
    flexDirection: 'row',
    gap: 12,
  },
  macroLeg: {
    alignItems: 'center',
    gap: 2,
  },
  macroLegLetter: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  macroLegValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },
  macroLegUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
  },
  macrosBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: tokens.bg2,
    marginTop: 10,
  },

  // ── Bottom CTA ──────────────────────────────────────────────────
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 30,
    backgroundColor: tokens.bg,
  },
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    shadowOpacity: 0.16,
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  ctaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.bg,
    letterSpacing: 2.42,
  },

  bottomHint: {
    marginTop: 16,
    marginHorizontal: 22,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },

  // ── Pantry picker sheet ─────────────────────────────────────────
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  sheetSection: {
    marginBottom: 14,
  },
  sheetSectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  recentGrid: {
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  sheetRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  sheetRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  sheetRowBrand: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
  },
  sheetRowKcal: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  sheetEmpty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 14,
  },
  sheetAddNewBtn: {
    marginTop: 4,
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
  sheetAddNewText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.accentInk,
    letterSpacing: 1.98,
    flexShrink: 1,
  },
});
