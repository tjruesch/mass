/**
 * Pantry item editor — full page (#84).
 *
 * Route: /pantry/new (create) or /pantry/<numeric id> (edit).
 *
 * Fields: name, brand (optional), macros **per 100g** (kcal +
 * protein/carbs/fat). The serving unit is always 100g — matches the
 * European nutrition-label convention so users can copy values
 * directly from packaging without per-serving math.
 *
 * Storage note: the underlying columns are still named
 * `kcalPerServing` / `defaultServingQty` etc. (schema didn't change).
 * The column semantics are reinterpreted: serving qty is always 100,
 * unit is always 'g', and the kcal/macros columns store per-100g
 * values. Meal-item calculations later normalise ingredient amounts
 * to grams and apply qty/100 × per100g.
 *
 * Delete is only available in edit mode. Cascade is SET NULL on
 * `meal_items.pantry_item_id`, so deleting an item that's referenced
 * by a logged meal_item leaves the meal intact with its copied macros.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SubHeader } from '@/components/design';
import {
  addPantryItem,
  deletePantryItem,
  getPantryItemById,
  updatePantryItem,
} from '@/src/db/queries/pantry';
import type { PantryItem } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const NAME_MAX = 48;
const BRAND_MAX = 32;

/**
 * The reference serving — fixed at 100g so macros input is always
 * per-100g. Stored on every row so the meal-calc layer has a stable
 * scaling base without checking the column for the same constant.
 */
const REFERENCE_QTY = 100;
const REFERENCE_UNIT = 'g';

export default function PantryItemEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isCreate = id === 'new';
  const numericId = !isCreate && typeof id === 'string' ? Number(id) : null;
  const mode: 'create' | 'edit' = isCreate ? 'create' : 'edit';

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbsText, setCarbsText] = useState('');
  const [fatText, setFatText] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (isCreate) {
      setHydrated(true);
      return;
    }
    if (numericId === null || !Number.isFinite(numericId)) {
      // Bad route param — bounce back.
      router.back();
      return;
    }
    getPantryItemById(numericId)
      .then((row) => {
        if (!row) {
          Alert.alert('Pantry item not found', 'It may have been deleted.');
          router.back();
          return;
        }
        hydrateFrom(row);
        setHydrated(true);
      })
      .catch((err) => {
        Alert.alert(
          'Could not load',
          err instanceof Error ? err.message : String(err),
        );
        router.back();
      });

    function hydrateFrom(row: PantryItem) {
      setName(row.name);
      setBrand(row.brand ?? '');
      setKcalText(formatMacro(row.kcalPerServing));
      setProteinText(formatMacro(row.proteinG));
      setCarbsText(formatMacro(row.carbsG));
      setFatText(formatMacro(row.fatG));
    }
  }, [isCreate, numericId, hydrated, router]);

  const trimmedName = name.trim();
  const kcal = parseDecimal(kcalText);
  const protein = parseDecimal(proteinText) ?? 0;
  const carbs = parseDecimal(carbsText) ?? 0;
  const fat = parseDecimal(fatText) ?? 0;

  const valid = trimmedName.length > 0 && kcal !== null && kcal >= 0;

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);
    const trimmedBrand = brand.trim();
    const payload = {
      name: trimmedName,
      brand: trimmedBrand === '' ? null : trimmedBrand,
      // Pantry items are always stored per-100g — the reference
      // serving doubles as the macro scaling base. Meal-item math
      // multiplies by ingredientGrams / 100.
      defaultServingQty: REFERENCE_QTY,
      defaultServingUnit: REFERENCE_UNIT,
      kcalPerServing: kcal!,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
    };

    const op =
      mode === 'edit' && numericId !== null
        ? updatePantryItem(numericId, payload)
        : addPantryItem(payload);

    op
      .then(() => router.back())
      .catch((err) => {
        Alert.alert(
          mode === 'edit' ? 'Could not save changes' : 'Could not add item',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [
    valid,
    saving,
    mode,
    numericId,
    trimmedName,
    brand,
    kcal,
    protein,
    carbs,
    fat,
    router,
  ]);

  const handleDelete = useCallback(() => {
    if (mode !== 'edit' || numericId === null || saving) return;
    Alert.alert(
      `Delete ${trimmedName || 'this item'}?`,
      "Previously-logged meals keep their nutrition copies and switch to a free-text reference. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deletePantryItem(numericId)
              .then(() => router.back())
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
  }, [mode, numericId, saving, trimmedName, router]);

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
          title={mode === 'edit' ? 'Edit item' : 'New item'}
          back="Pantry"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={handleSave}
              disabled={!valid || saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save pantry item"
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
          <TextField
            value={name}
            onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
            placeholder="e.g. Whole-milk yoghurt"
          />
        </Section>

        {/* BRAND */}
        <Section label="brand · optional">
          <TextField
            value={brand}
            onChangeText={(t) => setBrand(t.slice(0, BRAND_MAX))}
            placeholder="e.g. Müller, Aldi store-brand"
          />
        </Section>

        {/* MACROS — always per 100g, matching European nutrition labels. */}
        <Section label="macros" sub="per 100g">
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
        </Section>

        {!valid && (
          <Text style={styles.bottomHint}>
            name + kcal per 100g required
          </Text>
        )}

        {mode === 'edit' && (
          <Pressable
            onPress={handleDelete}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Delete this pantry item"
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Text style={[styles.deleteText, textStyles.cap]}>delete item</Text>
          </Pressable>
        )}

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

// ─── Section helper ─────────────────────────────────────────────────────────
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

function TextField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.textRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.ink4}
        style={styles.textInput}
      />
    </View>
  );
}

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

function formatMacro(g: number): string {
  if (g === 0) return '';
  if (Number.isInteger(g)) return g.toString();
  return (Math.round(g * 10) / 10).toString();
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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

  deleteBtn: {
    marginTop: 28,
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
