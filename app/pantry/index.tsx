/**
 * Pantry library — flat alphabetical list of nutrition references
 * keyed by name. Used as the lookup source for meal ingredients
 * (#85 meal-log drawer, #87 new-meal composer).
 *
 * Stock tracking + shopping list live in #90; this v1 screen is
 * just a macro reference book.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Glyph, SubHeader, TabBar } from '@/components/design';
import { usePantryItems } from '@/src/hooks/use-pantry';
import type { PantryItem } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

export default function PantryScreen() {
  const router = useRouter();
  const items = usePantryItems();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.brand !== null && it.brand.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <SubHeader
          title="Pantry · library"
          back="Home"
          onBack={() => router.back()}
        />

        <View style={styles.searchOuter}>
          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="search by name or brand"
              placeholderTextColor={tokens.ink4}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyOuter}>
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? 'Pantry is empty' : 'No matches'}
            </Text>
            <Text style={styles.emptyHint}>
              {items.length === 0
                ? 'Add foods you eat often so logging meals is one tap.'
                : `Nothing matches "${search.trim()}". Try a different name or brand.`}
            </Text>
          </View>
        ) : (
          <View style={styles.listOuter}>
            <View style={styles.cardList}>
              {filtered.map((it, i) => (
                <PantryRow
                  key={it.id}
                  item={it}
                  isLast={i === filtered.length - 1}
                  onPress={() => router.push(`/pantry/${it.id}` as never)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.newOuter}>
          <Pressable
            onPress={() => router.push('/pantry/new' as never)}
            accessibilityRole="button"
            accessibilityLabel="Add a new pantry item"
            style={({ pressed }) => [
              styles.newBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Glyph name="plus" color={tokens.ink3} size={11} />
            <Text style={[styles.newBtnText, textStyles.cap]}>
              new pantry item
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PantryRow — one item line in the library list.
// ─────────────────────────────────────────────────────────────────────────────
function PantryRow({
  item,
  isLast,
  onPress,
}: {
  item: PantryItem;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowBorder,
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {formatRowSub(item)}
        </Text>
      </View>
      <View style={styles.rowKcalCol}>
        <Text style={[styles.rowKcal, textStyles.tnum]}>
          {Math.round(item.kcalPerServing)}
        </Text>
        <Text style={styles.rowKcalUnit}>kcal / 100g</Text>
      </View>
      <Glyph name="chev" color={tokens.ink3} />
    </Pressable>
  );
}

function formatRowSub(item: PantryItem): string {
  // All macros are per 100g (the editor enforces that). We show brand
  // first when set, then non-zero macros as P/C/F. Always-100g serving
  // is implicit on the right column (`kcal / 100g`).
  const parts: string[] = [];
  if (item.brand !== null && item.brand.trim() !== '') {
    parts.push(item.brand);
  }
  const macroParts: string[] = [];
  if (item.proteinG > 0) macroParts.push(`P ${formatMacro(item.proteinG)}`);
  if (item.carbsG > 0) macroParts.push(`C ${formatMacro(item.carbsG)}`);
  if (item.fatG > 0) macroParts.push(`F ${formatMacro(item.fatG)}`);
  if (macroParts.length > 0) parts.push(macroParts.join(' · '));
  return parts.length === 0 ? '—' : parts.join(' · ');
}

function formatMacro(g: number): string {
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 130,
  },

  searchOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  searchRow: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  searchInput: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink,
    paddingVertical: 0,
  },

  emptyOuter: {
    paddingTop: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.15,
  },
  emptyHint: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
    maxWidth: 280,
  },

  listOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  cardList: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokens.ink,
  },
  rowSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  rowKcalCol: {
    alignItems: 'flex-end',
  },
  rowKcal: {
    fontFamily: fonts.monoSemibold,
    fontSize: 15,
    color: tokens.ink,
  },
  rowKcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
  },

  newOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  newBtn: {
    paddingVertical: 12,
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
  newBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },
});
