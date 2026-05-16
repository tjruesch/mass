/**
 * Meals · settings (#92). Follows `designs/screen-meals-settings.jsx`.
 *
 * Sections, top-to-bottom:
 *   1. Kcal goal hero — daily budget + deficit + the TDEE−deficit=budget
 *      equation strip.
 *   2. "set by" — radio rows: `rate` (auto, computed from goal) vs
 *      `manual` (fixed kcal/day).
 *   3. Weight rate — 5 preset chips (gentle/steady/aggressive/maintain/
 *      gain). Surfaces only when `goalMode === 'deficit'`.
 *   4. Manual budget input — surfaces only when `goalMode === 'budget'`.
 *   5. TDEE card — current TDEE + activity chips (1.2/1.4/1.55/1.7).
 *      Auto-derives TDEE = weight × 22 × activityMultiplier on the
 *      activity-chip tap. Manual override input also.
 *   6. Macro split — preview bar + P/C/F %/g cells + preset chips.
 *   7. Reminders — toggle list. Notification scheduling lands in a
 *      follow-up; toggles only persist the user's preference.
 *
 * SubHeader trailing "save" persists all changes at once. Edits stay
 * local until the user taps save so the budget on /meals + home don't
 * flicker during config.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SubHeader, TabBar } from '@/components/design';
import { getPreferences, updatePreferences } from '@/src/db/queries/meal-preferences';
import type {
  ActivityLevel,
  MacroPreset,
  MealGoalMode,
  MealPreferences,
  WeightRate,
} from '@/src/db/schema';
import { useLatestWeight } from '@/src/hooks/use-weight';
import {
  ACTIVITY_LABELS,
  ACTIVITY_MULTIPLIERS,
  MACRO_PRESETS,
  WEIGHT_RATE_DEFICIT,
  WEIGHT_RATE_LABELS,
  computeBudget,
  computeMacroTargets,
  computeTdee,
  effectiveDeficit,
} from '@/src/lib/meal-budget';
import { fonts, textStyles, tokens } from '@/theme/tokens';

type Draft = {
  goalMode: MealGoalMode;
  manualBudgetKcal: number;
  weightRate: WeightRate;
  activityLevel: ActivityLevel;
  tdeeKcal: number;
  macroPctProtein: number;
  macroPctCarbs: number;
  macroPctFat: number;
  macroPreset: MacroPreset;
  remOverBudget: boolean;
  remEveningSummary: boolean;
  remLowProtein: boolean;
};

export default function MealsSettingsScreen() {
  const router = useRouter();
  const latestWeight = useLatestWeight();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [budgetText, setBudgetText] = useState('');
  const [tdeeText, setTdeeText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setDraft(fromPrefs(prefs));
        setBudgetText(prefs.manualBudgetKcal.toString());
        setTdeeText(prefs.tdeeKcal.toString());
      })
      .catch((err) => {
        Alert.alert(
          'Could not load settings',
          err instanceof Error ? err.message : String(err),
        );
        router.back();
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const derivedBudget = useMemo(() => {
    if (draft === null) return 0;
    return computeBudget(toPrefsView(draft));
  }, [draft]);
  const derivedDeficit = useMemo(() => {
    if (draft === null) return 0;
    return effectiveDeficit(toPrefsView(draft));
  }, [draft]);
  const macroTargets = useMemo(() => {
    if (draft === null) return { proteinG: 0, carbsG: 0, fatG: 0 };
    return computeMacroTargets(toPrefsView(draft), derivedBudget);
  }, [draft, derivedBudget]);

  const setActivity = (a: ActivityLevel) => {
    setDraft((d) =>
      d === null
        ? null
        : (() => {
            const nextTdee = computeTdee(latestWeight?.kg ?? null, a);
            setTdeeText(nextTdee.toString());
            return { ...d, activityLevel: a, tdeeKcal: nextTdee };
          })(),
    );
  };

  const setMacroPreset = (k: Exclude<MacroPreset, 'custom'>) => {
    const split = MACRO_PRESETS[k];
    setDraft((d) =>
      d === null
        ? null
        : {
            ...d,
            macroPctProtein: split.protein,
            macroPctCarbs: split.carbs,
            macroPctFat: split.fat,
            macroPreset: k,
          },
    );
  };

  const handleSave = () => {
    if (draft === null || saving) return;
    setSaving(true);
    // Re-parse manual fields back into the draft on save.
    const manualBudgetKcal = parseIntOrFallback(
      budgetText,
      draft.manualBudgetKcal,
    );
    const tdeeKcal = parseIntOrFallback(tdeeText, draft.tdeeKcal);
    const next = { ...draft, manualBudgetKcal, tdeeKcal };
    updatePreferences(next)
      .then(() => router.back())
      .catch((err) => {
        Alert.alert(
          'Could not save',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  };

  if (draft === null) {
    return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title="Meals · settings"
          back="Meals"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={handleSave}
              disabled={saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save settings"
              style={({ pressed }) => [
                saving && { opacity: 0.35 },
                pressed && !saving && { opacity: 0.7 },
              ]}>
              <Text style={[styles.saveLink, textStyles.cap]}>
                {saving ? 'saving' : 'save'}
              </Text>
            </Pressable>
          }
        />

        {/* ── Goal hero ──────────────────────────────────────────── */}
        <Section label="kcal goal" sub="how the budget is set">
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View>
                <Text style={[styles.heroKicker, textStyles.cap]}>
                  daily budget
                </Text>
                <View style={styles.heroNumberRow}>
                  <Text style={[styles.heroNumber, textStyles.tnum]}>
                    {derivedBudget}
                  </Text>
                  <Text style={styles.heroNumberUnit}>kcal</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.heroKicker, textStyles.cap]}>
                  deficit
                </Text>
                <Text style={[styles.deficitValue, textStyles.tnum]}>
                  {formatSignedKcal(derivedDeficit)}
                </Text>
                <Text style={styles.deficitHint}>
                  ≈ {formatRateHint(derivedDeficit)}
                </Text>
              </View>
            </View>
            <View style={styles.equationStrip}>
              <EquationCell label="tdee" value={draft.tdeeKcal} />
              <Text style={styles.equationOp}>−</Text>
              <EquationCell
                label="deficit"
                value={derivedDeficit}
                color={derivedDeficit > 0 ? '#1F7A3A' : tokens.ink}
              />
              <Text style={styles.equationOp}>=</Text>
              <EquationCell label="budget" value={derivedBudget} />
            </View>
          </View>
        </Section>

        {/* ── set by ─────────────────────────────────────────────── */}
        <Section label="set by">
          <View style={styles.modeRow}>
            <ModeRadio
              label="rate"
              sub="auto · from goal"
              active={draft.goalMode === 'deficit'}
              onPress={() =>
                setDraft({ ...draft, goalMode: 'deficit' })
              }
            />
            <ModeRadio
              label="manual"
              sub="fixed kcal/day"
              active={draft.goalMode === 'budget'}
              onPress={() => setDraft({ ...draft, goalMode: 'budget' })}
            />
          </View>
        </Section>

        {draft.goalMode === 'deficit' && (
          <Section
            label="weight rate"
            sub={`${WEIGHT_RATE_LABELS[draft.weightRate].value} kg/wk · ${WEIGHT_RATE_DEFICIT[draft.weightRate]} kcal/day`}>
            <View style={styles.rateRow}>
              {(
                ['gentle', 'steady', 'aggressive', 'maintain', 'gain'] as const
              ).map((r) => (
                <RateChip
                  key={r}
                  rate={r}
                  active={draft.weightRate === r}
                  onPress={() =>
                    setDraft({ ...draft, weightRate: r })
                  }
                />
              ))}
            </View>
            <Text style={styles.rateNote}>
              syncs with weight · settings → goal
            </Text>
          </Section>
        )}

        {draft.goalMode === 'budget' && (
          <Section
            label="manual budget"
            sub="kcal/day target">
            <View style={styles.inputCard}>
              <TextInput
                value={budgetText}
                onChangeText={(t) =>
                  setBudgetText(t.replace(/[^0-9]/g, '').slice(0, 5))
                }
                keyboardType="number-pad"
                returnKeyType="done"
                style={[styles.inputBig, textStyles.tnum]}
              />
              <Text style={styles.inputUnit}>kcal</Text>
            </View>
          </Section>
        )}

        {/* ── TDEE ───────────────────────────────────────────────── */}
        <Section
          label="tdee"
          sub={`${formatWeightKg(latestWeight?.kg)} · ${ACTIVITY_LABELS[draft.activityLevel]} activity`}>
          <View style={styles.tdeeCard}>
            <View style={styles.tdeeTopRow}>
              <View style={styles.tdeeNumberRow}>
                <Text style={[styles.tdeeNumber, textStyles.tnum]}>
                  {draft.tdeeKcal}
                </Text>
                <Text style={styles.tdeeUnit}>kcal</Text>
              </View>
              <View style={styles.autoChip}>
                <Text style={[styles.autoChipText, textStyles.cap]}>
                  auto
                </Text>
              </View>
            </View>
            <Text style={styles.tdeeFormula}>
              mifflin · weight × {ACTIVITY_MULTIPLIERS[draft.activityLevel]}
            </Text>
            <Text style={[styles.subKicker, textStyles.cap]}>activity</Text>
            <View style={styles.activityRow}>
              {(['sedentary', 'light', 'moderate', 'active'] as const).map(
                (a) => (
                  <ActivityChip
                    key={a}
                    level={a}
                    active={draft.activityLevel === a}
                    onPress={() => setActivity(a)}
                  />
                ),
              )}
            </View>
            <View style={styles.tdeeManualRow}>
              <Text style={[styles.subKicker, textStyles.cap]}>
                manual override
              </Text>
              <View style={styles.tdeeManualInputRow}>
                <TextInput
                  value={tdeeText}
                  onChangeText={(t) =>
                    setTdeeText(t.replace(/[^0-9]/g, '').slice(0, 5))
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={[styles.tdeeManualInput, textStyles.tnum]}
                />
                <Text style={styles.inputUnit}>kcal</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* ── Macros ─────────────────────────────────────────────── */}
        <Section label="macros" sub="how to split the budget">
          <View style={styles.macrosCard}>
            <View style={styles.macroSplitBar}>
              <View
                style={{
                  flex: draft.macroPctProtein,
                  backgroundColor: tokens.ink,
                }}
              />
              <View
                style={{
                  flex: draft.macroPctCarbs,
                  backgroundColor: tokens.cool,
                }}
              />
              <View
                style={{
                  flex: draft.macroPctFat,
                  backgroundColor: tokens.accentInk,
                }}
              />
            </View>
            <View style={styles.macroCellsRow}>
              <MacroCell
                k="P"
                label="protein"
                pct={draft.macroPctProtein}
                grams={macroTargets.proteinG}
                color={tokens.ink}
              />
              <MacroCell
                k="C"
                label="carbs"
                pct={draft.macroPctCarbs}
                grams={macroTargets.carbsG}
                color={tokens.cool}
              />
              <MacroCell
                k="F"
                label="fat"
                pct={draft.macroPctFat}
                grams={macroTargets.fatG}
                color={tokens.accentInk}
              />
            </View>
            <View style={styles.macroPresetRow}>
              {(['balanced', 'protein', 'endurance'] as const).map((k) => {
                const split = MACRO_PRESETS[k];
                const active = draft.macroPreset === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setMacroPreset(k)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preset ${k}`}
                    style={({ pressed }) => [
                      styles.presetChip,
                      active && styles.presetChipActive,
                      pressed && !active && { opacity: 0.65 },
                    ]}>
                    <Text
                      style={[
                        styles.presetChipValue,
                        active && { color: tokens.bg },
                        textStyles.tnum,
                      ]}>
                      {split.protein}/{split.carbs}/{split.fat}
                    </Text>
                    <Text
                      style={[
                        styles.presetChipSub,
                        active && { color: tokens.bg, opacity: 0.6 },
                        textStyles.cap,
                      ]}>
                      {k}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        {/* ── Reminders ─────────────────────────────────────────── */}
        <Section label="reminders">
          <View style={styles.reminderCard}>
            <ReminderRow
              name="over-budget alert"
              sub="pings at 90% consumed"
              on={draft.remOverBudget}
              onToggle={() =>
                setDraft({ ...draft, remOverBudget: !draft.remOverBudget })
              }
              border
            />
            <ReminderRow
              name="evening summary"
              sub="21:00 · today’s totals"
              on={draft.remEveningSummary}
              onToggle={() =>
                setDraft({
                  ...draft,
                  remEveningSummary: !draft.remEveningSummary,
                })
              }
              border
            />
            <ReminderRow
              name="low-protein nudge"
              sub="when P < 50% by 18:00"
              on={draft.remLowProtein}
              onToggle={() =>
                setDraft({ ...draft, remLowProtein: !draft.remLowProtein })
              }
            />
          </View>
          <Text style={styles.reminderHint}>
            scheduling lands with the notifications slice
          </Text>
        </Section>

        <View style={{ height: 36 }} />
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionOuter}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, textStyles.cap]}>{label}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function EquationCell({
  label,
  value,
  color = tokens.ink,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={[styles.equationLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.equationValue, textStyles.tnum, { color }]}>
        {value}
      </Text>
    </View>
  );
}

function ModeRadio({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.modeCell,
        active && styles.modeCellActive,
        pressed && !active && { opacity: 0.65 },
      ]}>
      <View style={[styles.radioRing, active && styles.radioRingActive]}>
        {active && <View style={styles.radioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modeLabel, active && { fontFamily: fonts.sansSemibold }]}>
          {label}
        </Text>
        <Text style={styles.modeSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function RateChip({
  rate,
  active,
  onPress,
}: {
  rate: WeightRate;
  active: boolean;
  onPress: () => void;
}) {
  const info = WEIGHT_RATE_LABELS[rate];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Weight rate ${rate}`}
      style={({ pressed }) => [
        styles.rateChip,
        active && styles.rateChipActive,
        pressed && !active && { opacity: 0.65 },
      ]}>
      <Text
        style={[
          styles.rateChipValue,
          textStyles.tnum,
          active && { color: tokens.bg },
        ]}>
        {info.value}
      </Text>
      <Text
        style={[
          styles.rateChipLabel,
          textStyles.cap,
          active && { color: tokens.bg, opacity: 0.6 },
        ]}>
        {info.label}
      </Text>
    </Pressable>
  );
}

function ActivityChip({
  level,
  active,
  onPress,
}: {
  level: ActivityLevel;
  active: boolean;
  onPress: () => void;
}) {
  const mult = ACTIVITY_MULTIPLIERS[level];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Activity ${level}`}
      style={({ pressed }) => [
        styles.activityChip,
        active && styles.activityChipActive,
        pressed && !active && { opacity: 0.65 },
      ]}>
      <Text
        style={[
          styles.rateChipValue,
          textStyles.tnum,
          active && { color: tokens.bg },
        ]}>
        {mult}
      </Text>
      <Text
        style={[
          styles.rateChipLabel,
          textStyles.cap,
          active && { color: tokens.bg, opacity: 0.6 },
        ]}>
        {ACTIVITY_LABELS[level]}
      </Text>
    </Pressable>
  );
}

function MacroCell({
  k,
  label,
  pct,
  grams,
  color,
}: {
  k: string;
  label: string;
  pct: number;
  grams: number;
  color: string;
}) {
  return (
    <View style={styles.macroCell}>
      <View style={styles.macroCellHead}>
        <Text style={[styles.macroLetter, textStyles.cap, { color }]}>
          {k}
        </Text>
        <Text style={styles.macroLabelSmall}>{label}</Text>
      </View>
      <View style={styles.macroPctRow}>
        <Text style={[styles.macroPct, textStyles.tnum]}>{pct}</Text>
        <Text style={styles.macroPctUnit}>%</Text>
      </View>
      <Text style={[styles.macroGrams, textStyles.tnum]}>
        {grams}
        <Text style={styles.macroGramsUnit}>g</Text>
      </Text>
    </View>
  );
}

function ReminderRow({
  name,
  sub,
  on,
  onToggle,
  border = false,
}: {
  name: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  border?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [
        styles.reminderRow,
        border && styles.reminderRowBorder,
        pressed && { opacity: 0.85 },
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.reminderName}>{name}</Text>
        <Text style={styles.reminderSub}>{sub}</Text>
      </View>
      <View style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff]}>
        <View
          style={[
            styles.toggleKnob,
            on ? styles.toggleKnobOn : styles.toggleKnobOff,
          ]}
        />
      </View>
    </Pressable>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fromPrefs(prefs: MealPreferences): Draft {
  return {
    goalMode: prefs.goalMode,
    manualBudgetKcal: prefs.manualBudgetKcal,
    weightRate: prefs.weightRate,
    activityLevel: prefs.activityLevel,
    tdeeKcal: prefs.tdeeKcal,
    macroPctProtein: prefs.macroPctProtein,
    macroPctCarbs: prefs.macroPctCarbs,
    macroPctFat: prefs.macroPctFat,
    macroPreset: prefs.macroPreset,
    remOverBudget: prefs.remOverBudget,
    remEveningSummary: prefs.remEveningSummary,
    remLowProtein: prefs.remLowProtein,
  };
}

/** Build a view of a `MealPreferences`-shaped value from the draft so
 *  the compute helpers can be reused without an extra branch. */
function toPrefsView(d: Draft): MealPreferences {
  return { id: 1, ...d };
}

function parseIntOrFallback(s: string, fallback: number): number {
  if (s.trim() === '') return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function formatSignedKcal(d: number): string {
  if (d > 0) return `−${d}`;
  if (d < 0) return `+${Math.abs(d)}`;
  return '0';
}

function formatRateHint(deficitKcal: number): string {
  // 7700 kcal ≈ 1 kg of body fat.
  const kgPerWk = (deficitKcal * 7) / 7700;
  const sign = kgPerWk > 0 ? '−' : kgPerWk < 0 ? '+' : '';
  return `${sign}${Math.abs(kgPerWk).toFixed(2)} kg/wk`;
}

function formatWeightKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return 'no weigh-in';
  return `${kg.toFixed(1)} kg`;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 110,
  },
  saveLink: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 2.2,
  },

  // Section frame
  sectionOuter: {
    paddingHorizontal: 22,
    marginTop: 18,
  },
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
  subKicker: {
    marginTop: 12,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 6,
  },

  // Hero
  heroCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    shadowOpacity: 0.03,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  heroKicker: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 4,
  },
  heroNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 32,
    color: tokens.ink,
    letterSpacing: -1.12,
  },
  heroNumberUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },
  deficitValue: {
    marginTop: 4,
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: '#1F7A3A',
  },
  deficitHint: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  equationStrip: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equationLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  equationValue: {
    marginTop: 2,
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
  },
  equationOp: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink4,
  },

  // Set-by radio
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.line,
    backgroundColor: 'transparent',
  },
  modeCellActive: {
    backgroundColor: tokens.bg2,
    borderColor: tokens.line2,
  },
  radioRing: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: tokens.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioRingActive: {
    borderColor: tokens.accentInk,
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  modeLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  modeSub: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  // Rate chips
  rateRow: {
    flexDirection: 'row',
    gap: 5,
  },
  rateChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 2,
  },
  rateChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  rateChipValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },
  rateChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink,
    letterSpacing: 1.44,
  },
  rateNote: {
    marginTop: 8,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  // Manual budget input
  inputCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  inputBig: {
    flex: 1,
    fontFamily: fonts.monoSemibold,
    fontSize: 26,
    color: tokens.ink,
    letterSpacing: -0.78,
    paddingVertical: 0,
  },
  inputUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },

  // TDEE card
  tdeeCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  tdeeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  tdeeNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  tdeeNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.72,
  },
  tdeeUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  autoChip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  autoChipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8,
    color: tokens.ink,
    letterSpacing: 1.6,
  },
  tdeeFormula: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 5,
  },
  activityChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 2,
  },
  activityChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  tdeeManualRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tdeeManualInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  tdeeManualInput: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    minWidth: 64,
    textAlign: 'right',
    paddingVertical: 0,
  },

  // Macros card
  macrosCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  macroSplitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: tokens.bg2,
  },
  macroCellsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  macroCell: {
    flex: 1,
  },
  macroCellHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  macroLetter: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    letterSpacing: 1.98,
  },
  macroLabelSmall: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 0.54,
  },
  macroPctRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  macroPct: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.32,
  },
  macroPctUnit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
    marginLeft: 1,
  },
  macroGrams: {
    marginTop: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
  },
  macroGramsUnit: {
    marginLeft: 1,
  },
  macroPresetRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    gap: 5,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
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
  presetChipValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },
  presetChipSub: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink,
    letterSpacing: 1.44,
  },

  // Reminders
  reminderCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  reminderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  reminderName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  reminderSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  toggle: {
    width: 36,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    position: 'relative',
  },
  toggleOn: {
    backgroundColor: tokens.accentInk,
    borderColor: tokens.accentInk,
  },
  toggleOff: {
    backgroundColor: tokens.bg2,
    borderColor: tokens.line,
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: tokens.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.18,
  },
  toggleKnobOn: {
    left: 18,
  },
  toggleKnobOff: {
    left: 2,
  },
  reminderHint: {
    marginTop: 8,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
