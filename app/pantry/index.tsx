/**
 * Pantry · stock + shopping list (#90).
 *
 * Three sections, top-to-bottom, matching designs/screen-pantry.jsx:
 *   1. Stock summary chips — out / short / low / ok counts. `short`
 *      is now driven by the week's planned-but-not-yet-logged demand
 *      (sourced from #95's meal_plan).
 *   2. Auto shopping list — items currently `out`, `short`, or `low`,
 *      with a footer link to export to iOS Reminders (placeholder for
 *      the share flow).
 *   3. Pantry grouped by category (fresh / protein / dairy / pantry),
 *      sorted within each section so problems surface first. Each
 *      row shows "need X this week" when the plan demands the item.
 *
 * Untracked items (currentQty === null) skip the summary counts and
 * render without a status pip, but still appear under their category
 * so users can find them.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, SubHeader, TabBar } from '@/components/design';
import type { Meal, PantryCategory, PantryItem } from '@/src/db/schema';
import { useLibraryMeals } from '@/src/hooks/use-meals';
import { usePantryItems } from '@/src/hooks/use-pantry';
import { useWeekStockNeed } from '@/src/hooks/use-week-stock-need';
import {
  PANTRY_CATEGORIES,
  PANTRY_CATEGORY_LABELS,
  compareStockStatus,
  effectiveStockUnit,
  type StockStatus,
} from '@/src/lib/pantry-stock';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// Status palette — terracotta tones for out/short, amber for low,
// forest green for ok. Background swatches keep the same hue at
// 8-10 % opacity so chips stay legible against the card surface.
const STATUS_COLORS: Record<
  Exclude<StockStatus, 'untracked'>,
  { fg: string; bg: string }
> = {
  out: { fg: tokens.warn, bg: 'rgba(180,90,30,0.10)' },
  short: { fg: tokens.warn, bg: 'rgba(180,90,30,0.08)' },
  low: { fg: '#A07A2A', bg: 'rgba(192,138,40,0.10)' },
  ok: { fg: '#1F7A3A', bg: 'rgba(31,122,58,0.10)' },
};

type TabId = 'pantry' | 'library';

export default function PantryScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('pantry');
  const items = usePantryItems();
  const library = useLibraryMeals();
  const { needByPantryId, statusByPantryId } = useWeekStockNeed();

  const statusFor = (id: number): StockStatus =>
    statusByPantryId.get(id) ?? 'untracked';

  const summary = useMemo(() => {
    let out = 0;
    let short = 0;
    let low = 0;
    let ok = 0;
    let untracked = 0;
    for (const item of items) {
      switch (statusFor(item.id)) {
        case 'out':
          out++;
          break;
        case 'short':
          short++;
          break;
        case 'low':
          low++;
          break;
        case 'ok':
          ok++;
          break;
        case 'untracked':
          untracked++;
          break;
      }
    }
    return { out, short, low, ok, untracked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, statusByPantryId]);

  // Shopping list = anything that needs restocking, week-plan-aware.
  const shoppingList = useMemo(
    () =>
      items.filter((item) => {
        const s = statusFor(item.id);
        return s === 'out' || s === 'short' || s === 'low';
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, statusByPantryId],
  );

  const grouped = useMemo(() => {
    const out: Record<PantryCategory, PantryItem[]> = {
      fresh: [],
      protein: [],
      dairy: [],
      pantry: [],
    };
    for (const item of items) {
      out[item.category].push(item);
    }
    for (const cat of PANTRY_CATEGORIES) {
      out[cat].sort((a, b) => {
        const cmp = compareStockStatus(statusFor(a.id), statusFor(b.id));
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, statusByPantryId]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title={tab === 'pantry' ? 'Pantry' : 'Library'}
          back="Meals"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={() =>
                router.push(
                  (tab === 'pantry'
                    ? '/pantry/new'
                    : '/meals/new') as never,
                )
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                tab === 'pantry' ? 'Add pantry item' : 'New meal'
              }
              style={({ pressed }) => pressed && { opacity: 0.55 }}>
              <Text style={[styles.addLink, textStyles.cap]}>+ add</Text>
            </Pressable>
          }
        />

        {/* ── Tab segmented control ───────────────────────────────── */}
        <View style={styles.tabsOuter}>
          <View style={styles.tabsBar}>
            <Pressable
              onPress={() => setTab('pantry')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'pantry' }}
              style={[
                styles.tabPill,
                tab === 'pantry' && styles.tabPillActive,
              ]}>
              <Text
                style={[
                  styles.tabLabel,
                  textStyles.cap,
                  tab === 'pantry' && styles.tabLabelActive,
                ]}>
                pantry · {items.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('library')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'library' }}
              style={[
                styles.tabPill,
                tab === 'library' && styles.tabPillActive,
              ]}>
              <Text
                style={[
                  styles.tabLabel,
                  textStyles.cap,
                  tab === 'library' && styles.tabLabelActive,
                ]}>
                library · {library.length}
              </Text>
            </Pressable>
          </View>
        </View>

        {tab === 'library' && (
          <LibraryList
            meals={library}
            onTap={(id) => router.push(`/meals/${id}` as never)}
            onCreate={() => router.push('/meals/new' as never)}
          />
        )}

        {tab === 'pantry' && (
          <>
        {/* ── Shopping list ──────────────────────────────────────── */}
        {shoppingList.length > 0 && (
          <View style={styles.sectionOuter}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.kicker, textStyles.cap]}>
                shopping list · auto
              </Text>
              <Text style={[styles.sectionStat, textStyles.tnum]}>
                <Text style={styles.sectionStatStrong}>
                  {shoppingList.length}
                </Text>
                <Text style={styles.sectionStatMute}>
                  {' '}
                  item{shoppingList.length === 1 ? '' : 's'}
                </Text>
              </Text>
            </View>
            <View style={styles.card}>
              {shoppingList.map((it, i) => {
                const isLast = i === shoppingList.length - 1;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => router.push(`/pantry/${it.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${it.name}`}
                    style={({ pressed }) => [
                      styles.shopRow,
                      !isLast && styles.rowBorder,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <View style={styles.shopBox} />
                    <View style={styles.shopBody}>
                      <Text style={styles.shopName}>{it.name}</Text>
                      <Text style={[styles.shopCat, textStyles.cap]}>
                        {PANTRY_CATEGORY_LABELS[it.category]}
                      </Text>
                    </View>
                    <Text style={[styles.shopQty, textStyles.tnum]}>
                      {formatStockQty(it)}
                    </Text>
                  </Pressable>
                );
              })}
              {/* "Export to Reminders" CTA — wiring deferred until the
                  iOS share-sheet integration lands. Renders as a hint
                  to communicate the eventual flow. */}
              <View style={styles.exportRow}>
                <Text style={[styles.exportText, textStyles.cap]}>
                  export to reminders
                </Text>
                <Text style={styles.exportSoon}>soon</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Empty state ─────────────────────────────────────────── */}
        {items.length === 0 && (
          <View style={styles.emptyOuter}>
            <Text style={styles.emptyTitle}>Pantry is empty</Text>
            <Text style={styles.emptyHint}>
              Add foods you eat often so logging meals is one tap.
            </Text>
            <Pressable
              onPress={() => router.push('/pantry/new' as never)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.emptyCta,
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.emptyCtaText, textStyles.cap]}>
                + add first item
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Pantry by category ──────────────────────────────────── */}
        {PANTRY_CATEGORIES.map((cat) => {
          const rows = grouped[cat];
          if (rows.length === 0) return null;
          return (
            <View key={cat} style={styles.sectionOuter}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.kicker, textStyles.cap]}>
                  {PANTRY_CATEGORY_LABELS[cat]}
                </Text>
                <Text style={[styles.sectionStat, textStyles.tnum]}>
                  <Text style={styles.sectionStatMute}>
                    {rows.length} item{rows.length === 1 ? '' : 's'}
                  </Text>
                </Text>
              </View>
              <View style={styles.card}>
                {rows.map((it, i) => (
                  <CategoryRow
                    key={it.id}
                    item={it}
                    status={statusFor(it.id)}
                    requiredThisWeek={needByPantryId.get(it.id) ?? 0}
                    isLast={i === rows.length - 1}
                    onPress={() => router.push(`/pantry/${it.id}` as never)}
                  />
                ))}
              </View>
            </View>
          );
        })}
          </>
        )}
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LibraryList — flat list of library meals. Tap → /meals/<id>;
// dashed CTA at the bottom → /meals/new.
// ─────────────────────────────────────────────────────────────────────────────
function LibraryList({
  meals,
  onTap,
  onCreate,
}: {
  meals: ReadonlyArray<Meal>;
  onTap: (id: number) => void;
  onCreate: () => void;
}) {
  if (meals.length === 0) {
    return (
      <View style={styles.emptyOuter}>
        <Text style={styles.emptyTitle}>No saved meals</Text>
        <Text style={styles.emptyHint}>
          Build reusable meals to plan + log faster.
        </Text>
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.emptyCta,
            pressed && { opacity: 0.7 },
          ]}>
          <Text style={[styles.emptyCtaText, textStyles.cap]}>
            + new meal
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.sectionOuter}>
      <View style={styles.card}>
        {meals.map((m, i) => {
          const isLast = i === meals.length - 1;
          return (
            <Pressable
              key={m.id}
              onPress={() => onTap(m.id)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${m.name ?? 'meal'}`}
              style={({ pressed }) => [
                styles.libraryRow,
                !isLast && styles.rowBorder,
                pressed && { opacity: 0.7 },
              ]}>
              <View style={styles.libraryBody}>
                <Text numberOfLines={1} style={styles.libraryName}>
                  {m.name ?? 'Meal'}
                </Text>
                <Text style={styles.libraryMacros} numberOfLines={1}>
                  {Math.round(m.kcal ?? 0)} kcal
                  {m.proteinG !== null && m.proteinG > 0 && (
                    <> · P {formatMacroG(m.proteinG)}</>
                  )}
                  {m.carbsG !== null && m.carbsG > 0 && (
                    <> · C {formatMacroG(m.carbsG)}</>
                  )}
                  {m.fatG !== null && m.fatG > 0 && (
                    <> · F {formatMacroG(m.fatG)}</>
                  )}
                </Text>
              </View>
              <Glyph name="chev" color={tokens.ink3} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.newMealBtn,
          pressed && { opacity: 0.55 },
        ]}>
        <Glyph name="plus" color={tokens.ink3} size={11} />
        <Text style={[styles.newMealBtnText, textStyles.cap]}>new meal</Text>
      </Pressable>
    </View>
  );
}

function formatMacroG(g: number): string {
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryChip — top-of-page status tile. `untracked` uses neutral inks
// so it doesn't compete with the warn / amber / green status hierarchy.
// ─────────────────────────────────────────────────────────────────────────────
function SummaryChip({
  kind,
  count,
  label,
}: {
  kind: StockStatus;
  count: number;
  label?: string;
}) {
  const palette =
    kind === 'untracked'
      ? { fg: tokens.ink4, bg: 'rgba(0,0,0,0.02)' }
      : STATUS_COLORS[kind];
  return (
    <View style={[styles.summaryChip, { backgroundColor: palette.bg }]}>
      <Text
        style={[
          styles.summaryChipLabel,
          textStyles.cap,
          { color: palette.fg },
        ]}>
        {label ?? kind}
      </Text>
      <Text style={[styles.summaryChipCount, textStyles.tnum]}>{count}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryRow — single line within a category card. Tappable to edit.
// Renders a status pip (or none for untracked) + name + current qty.
// ─────────────────────────────────────────────────────────────────────────────
function CategoryRow({
  item,
  status,
  requiredThisWeek,
  isLast,
  onPress,
}: {
  item: PantryItem;
  status: StockStatus;
  requiredThisWeek: number;
  isLast: boolean;
  onPress: () => void;
}) {
  const struckOut = status === 'out';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
      style={({ pressed }) => [
        styles.catRow,
        !isLast && styles.rowBorder,
        struckOut && { opacity: 0.85 },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.catBody}>
        <Text
          numberOfLines={1}
          style={[
            styles.catName,
            struckOut && {
              textDecorationLine: 'line-through',
              textDecorationColor: tokens.ink4,
            },
          ]}>
          {item.name}
        </Text>
        <Text style={styles.catSub} numberOfLines={1}>
          {formatCatSub(item, requiredThisWeek)}
        </Text>
      </View>
      {status !== 'untracked' && <StatusPip status={status} />}
      <Text
        style={[
          styles.catQty,
          textStyles.tnum,
          item.currentQty === 0 && { color: tokens.ink4 },
        ]}>
        {formatStockQty(item)}
      </Text>
    </Pressable>
  );
}

function StatusPip({ status }: { status: Exclude<StockStatus, 'untracked'> }) {
  const palette = STATUS_COLORS[status];
  return (
    <View style={[styles.statusPip, { backgroundColor: palette.bg }]}>
      <Text
        style={[
          styles.statusPipText,
          textStyles.cap,
          { color: palette.fg },
        ]}>
        {status}
      </Text>
    </View>
  );
}

// ─── Formatters ────────────────────────────────────────────────────────────
function formatStockQty(item: PantryItem): string {
  if (item.currentQty === null) return '—';
  const unit = effectiveStockUnit(item);
  return `${formatNum(item.currentQty)} ${unit}`;
}

function formatCatSub(item: PantryItem, requiredThisWeek: number): string {
  // Need-this-week takes priority — most actionable info. Falls back
  // to brand, then to per-100g kcal so the row isn't empty.
  if (requiredThisWeek > 0) {
    const unit = effectiveStockUnit(item);
    return `need ${formatNum(requiredThisWeek)} ${unit} this week`;
  }
  if (item.brand !== null && item.brand.trim() !== '') return item.brand;
  return `${Math.round(item.kcalPerServing)} kcal / 100g`;
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return (Math.round(n * 10) / 10).toString();
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 120,
  },
  addLink: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 2.2,
  },

  // Tab bar (pantry / library segmented control)
  tabsOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
    marginBottom: 6,
  },
  tabsBar: {
    flexDirection: 'row',
    backgroundColor: tokens.bg2,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: tokens.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.06,
  },
  tabLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 1.76,
  },
  tabLabelActive: {
    color: tokens.ink,
  },

  // Library tab rows
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  libraryBody: {
    flex: 1,
    minWidth: 0,
  },
  libraryName: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  libraryMacros: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 0.4,
  },
  newMealBtn: {
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
  newMealBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },

  // Summary
  summaryOuter: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  summaryGrid: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 6,
  },
  summaryChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.line,
    gap: 2,
  },
  summaryChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  summaryChipCount: {
    fontFamily: fonts.monoSemibold,
    fontSize: 20,
    color: tokens.ink,
    letterSpacing: -0.6,
  },

  // Section
  sectionOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionStat: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  sectionStatStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoSemibold,
  },
  sectionStatMute: {
    color: tokens.ink4,
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
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },

  // Shopping list row
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  shopBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: tokens.line2,
    backgroundColor: 'transparent',
  },
  shopBody: {
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  shopCat: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.62,
  },
  shopQty: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
  },
  exportRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    backgroundColor: 'rgba(0,0,0,0.012)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9.5,
    color: tokens.ink3,
    letterSpacing: 1.71,
  },
  exportSoon: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  // Category row
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  catBody: {
    flex: 1,
    minWidth: 0,
  },
  catName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  catSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  statusPip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  statusPipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  catQty: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    minWidth: 50,
    textAlign: 'right',
  },

  // Empty state
  emptyOuter: {
    paddingTop: 30,
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
  emptyCta: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
  },
  emptyCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },
});
