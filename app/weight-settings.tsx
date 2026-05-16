/**
 * Weight settings — port of designs/screen-weight.jsx WeightSettings,
 * trimmed to what we can fully wire today.
 *
 * Auto-commit pattern: every interaction immediately writes to
 * `weight_preferences`. No save button. Mirrors fasting + water settings.
 *
 * Rate preset chips were intentionally removed: the rate is fully derived
 * from `(target − current) / (date − today) × 7`, so a stored "intent"
 * value added nothing. Target + date are both editable directly; the
 * displayed rate is whatever those imply.
 *
 * Out of scope for v1:
 *   - Units chips (kg/lb/st) — follow-up; the formatter swap touches
 *     every display site, same pattern as water #45.
 *   - Reminders section — issue #57.
 *   - Auto-import from non-HK scales (Withings/Renpho/BLE) — issue #58.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheet, DateTimePickerSheet, SubHeader, TabBar } from '@/components/design';
import { updatePreferences } from '@/src/db/queries/weight-preferences';
import type { WeightPreferences } from '@/src/db/schema';
import { useLatestWeight } from '@/src/hooks/use-weight';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useLastWeightSyncAt } from '@/src/hooks/use-weight-sync';
import {
  ensureHkAuthorization,
  useHkAuthState,
  type HkAuthState,
} from '@/src/lib/healthkit/auth';
import { BODY_MASS_PERMISSIONS } from '@/src/lib/healthkit/weight';
import { addDays, startOfDay } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const DAY_MS = 24 * 3_600_000;
const SAFE_RATE_KG_PER_WEEK = 1.0;
/**
 * Pace assumed for the very first goal seed, when the user sets target
 * before date. 0.25 kg/wk is the "gentle" end of the spectrum — much
 * safer than the previous 28-day default (which was ≥1 kg/wk for a 4 kg
 * cut). Once the date exists, this constant isn't read again.
 */
const COLD_START_RATE_KG_PER_WEEK = 0.25;

const CHART_TOGGLES: {
  key: 'showOptimal' | 'showMovingAvg' | 'showProjected' | 'snapToGoalRange';
  name: string;
  sub: string;
}[] = [
  {
    key: 'showOptimal',
    name: 'show optimal trajectory',
    sub: 'dashed accent line · start → goal',
  },
  {
    key: 'showMovingAvg',
    name: 'show 7-day average',
    sub: 'smoothed actual trend',
  },
  {
    key: 'showProjected',
    name: 'show projected eta',
    sub: 'extrapolates current rate',
  },
  {
    key: 'snapToGoalRange',
    name: 'snap chart to goal range',
    sub: 'narrow y-axis to ±5 kg',
  },
];

const MONTH_DAY = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

export default function WeightSettingsScreen() {
  const router = useRouter();
  const prefs = useWeightPreferences();
  const latest = useLatestWeight();
  const lastSyncAt = useLastWeightSyncAt();
  const auth = useHkAuthState(BODY_MASS_PERMISSIONS);
  // Tap-to-edit sheets for target kg + target date. Booleans declared above
  // the early return so hook order stays stable across renders.
  const [editingDate, setEditingDate] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const currentKg = latest?.kg ?? null;
  const writeFail = (err: unknown) =>
    console.warn('Failed to update weight preferences:', err);
  const write = (patch: Partial<WeightPreferences>) =>
    updatePreferences(patch).catch(writeFail);

  // Rate is fully derived from (target, date, current). Everything else
  // on this screen reacts to whatever those three values imply.
  const derivedRate = computeDerivedRate(currentKg, prefs.targetKg, prefs.targetDate);

  const onPickDate = (next: Date) => {
    write({ targetDate: startOfDay(next) });
    setEditingDate(false);
  };

  const onToggleChart = (key: typeof CHART_TOGGLES[number]['key']) => {
    write({ [key]: !prefs[key] });
  };

  const onToggleAutoImport = () => {
    write({ autoImportHealthKit: !prefs.autoImportHealthKit });
  };

  const startHint =
    prefs.startKg !== null && prefs.targetKg !== null
      ? `${formatDeltaKg(prefs.targetKg - prefs.startKg)} from start (${prefs.startKg.toFixed(1)})`
      : prefs.targetKg !== null && currentKg !== null
      ? `${formatDeltaKg(prefs.targetKg - currentKg)} from current`
      : 'set a preset to start';

  const dateHint =
    prefs.startKg !== null && prefs.targetDate !== null
      ? `${daysBetween(startOfDay(new Date()), prefs.targetDate)} days from today`
      : prefs.targetDate !== null
      ? `${daysBetween(startOfDay(new Date()), prefs.targetDate)} days away`
      : '—';

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Weight · settings" back="Weight" onBack={() => router.back()} />

        {/* GOAL */}
        <Section label="goal" sub="target & date">
          <View style={styles.goalCard}>
            <View style={styles.goalRow}>
              {/* Target column — tap to edit. */}
              <Pressable
                onPress={() => setEditingTarget(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit target weight"
                style={({ pressed }) => [styles.goalCol, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.colKicker, textStyles.cap]}>target</Text>
                <View style={styles.goalValueRow}>
                  <Text
                    style={[
                      styles.goalValue,
                      textStyles.tnum,
                      {
                        textDecorationLine: 'underline',
                        textDecorationColor: tokens.line2,
                      },
                    ]}>
                    {prefs.targetKg === null ? '—' : prefs.targetKg.toFixed(1)}
                  </Text>
                  <Text style={styles.goalValueUnit}>kg</Text>
                </View>
                <Text style={styles.goalHint}>{startHint}</Text>
              </Pressable>

              {/* Date column */}
              <View style={[styles.goalCol, styles.goalColRight]}>
                <Text style={[styles.colKicker, textStyles.cap]}>date</Text>
                <Pressable
                  onPress={() => prefs.targetDate !== null && setEditingDate(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit target date"
                  style={({ pressed }) => [
                    styles.goalDateTap,
                    pressed && prefs.targetDate !== null && { opacity: 0.6 },
                  ]}>
                  <Text
                    style={[
                      styles.goalValue,
                      textStyles.tnum,
                      prefs.targetDate !== null && {
                        textDecorationLine: 'underline',
                        textDecorationColor: tokens.line2,
                      },
                    ]}>
                    {prefs.targetDate === null
                      ? '—'
                      : MONTH_DAY.format(prefs.targetDate).toLowerCase()}
                  </Text>
                </Pressable>
                <Text style={styles.goalHint}>{dateHint}</Text>
              </View>
            </View>

            <View style={styles.goalDivider} />
            <View style={styles.goalRateRow}>
              <Text style={[styles.colKicker, textStyles.cap]}>derived rate</Text>
              <View style={styles.goalRateValueWrap}>
                <Text style={[styles.goalRateValue, textStyles.tnum]}>
                  {derivedRate === null
                    ? '—'
                    : `${derivedRate < 0 ? '−' : derivedRate > 0 ? '+' : ''}${Math.abs(derivedRate).toFixed(1)} kg / wk`}
                </Text>
                {derivedRate !== null && (
                  <View
                    style={[
                      styles.safetyPill,
                      Math.abs(derivedRate) <= SAFE_RATE_KG_PER_WEEK
                        ? styles.safetyPillSafe
                        : styles.safetyPillFast,
                    ]}>
                    <Text
                      style={[
                        styles.safetyPillText,
                        Math.abs(derivedRate) <= SAFE_RATE_KG_PER_WEEK
                          ? styles.safetyPillTextSafe
                          : styles.safetyPillTextFast,
                      ]}>
                      {Math.abs(derivedRate) <= SAFE_RATE_KG_PER_WEEK ? 'safe' : 'fast'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Section>

        {/* CHART TOGGLES */}
        <Section label="chart">
          <View style={styles.cardList}>
            {CHART_TOGGLES.map((t, i, arr) => (
              <View
                key={t.key}
                style={[
                  styles.cardRow,
                  i < arr.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: tokens.line,
                  },
                ]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardRowName}>{t.name}</Text>
                  <Text style={styles.cardRowSub}>{t.sub}</Text>
                </View>
                <Switch on={!!prefs[t.key]} onToggle={() => onToggleChart(t.key)} />
              </View>
            ))}
          </View>
        </Section>

        {/* APPLE HEALTH — state-driven: connect CTA when unprompted, hint
            when denied or unavailable, toggle when granted. */}
        <Section label="apple health">
          <AppleHealthSection
            auth={auth}
            autoImport={prefs.autoImportHealthKit}
            lastSyncAt={lastSyncAt}
            onConnect={() => ensureHkAuthorization(BODY_MASS_PERMISSIONS)}
            onToggleAutoImport={onToggleAutoImport}
          />
        </Section>
      </ScrollView>

      <TabBar active="home" />

      <DateTimePickerSheet
        open={editingDate}
        mode="date"
        title="Target date"
        value={prefs.targetDate ?? new Date()}
        minimumDate={new Date()}
        onApply={onPickDate}
        onCancel={() => setEditingDate(false)}
      />

      <TargetEditSheet
        open={editingTarget}
        prefs={prefs}
        currentKg={currentKg}
        onClose={(patch) => {
          if (patch) write(patch);
          setEditingTarget(false);
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TargetEditSheet — kg stepper + numeric TextInput. Editing target keeps
// the existing date; derived rate just updates to (target − current)/days × 7.
//
// Cold start (no target + no date yet): we seed both. Target is the user-
// entered value; date is computed to imply ~0.25 kg/wk, the gentle pace —
// landing roughly 16 weeks out for a 4 kg cut. Slow on purpose so a fresh
// account doesn't end up on a clinically-aggressive trajectory.
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_MIN_KG = 30;
const TARGET_MAX_KG = 300;
const TARGET_STEP_KG = 0.5;

function TargetEditSheet({
  open,
  prefs,
  currentKg,
  onClose,
}: {
  open: boolean;
  prefs: WeightPreferences;
  currentKg: number | null;
  /** patch === null cancels; otherwise the parent writes it. */
  onClose: (patch: Partial<WeightPreferences> | null) => void;
}) {
  const [kgText, setKgText] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    // Seed: existing target, or current minus 4 as a sensible default cut
    // anchor, or 70 if we don't even have a current reading yet.
    const initial =
      prefs.targetKg ?? (currentKg !== null ? currentKg - 4 : 70);
    setKgText(initial.toFixed(1));
  }, [open, prefs.targetKg, currentKg]);

  const parsed = useMemo(() => parseFloat(kgText), [kgText]);
  const valid =
    Number.isFinite(parsed) && parsed >= TARGET_MIN_KG && parsed <= TARGET_MAX_KG;

  const clamp = (n: number) =>
    Math.min(TARGET_MAX_KG, Math.max(TARGET_MIN_KG, Math.round(n * 10) / 10));

  /**
   * First step from an off-grid value (e.g. 87.3) snaps to the nearest 0.5
   * boundary in the step direction — 87.3 + step → 87.5, 87.3 − step → 87.0.
   * Subsequent steps move by a full 0.5. Avoids a stepper that just drifts
   * the original off-grid value (87.3 → 87.8 → 88.3 → …).
   */
  const onStep = (delta: number) => {
    const base = Number.isFinite(parsed) ? parsed : 70;
    const next =
      delta > 0
        ? Math.floor(base / TARGET_STEP_KG) * TARGET_STEP_KG + TARGET_STEP_KG
        : Math.ceil(base / TARGET_STEP_KG) * TARGET_STEP_KG - TARGET_STEP_KG;
    setKgText(clamp(next).toFixed(1));
  };

  const handleClose = (commit: boolean) => {
    if (!commit || !valid) {
      onClose(null);
      return;
    }
    const newTarget = clamp(parsed);
    const patch: Partial<WeightPreferences> = { targetKg: newTarget };

    // Cold start: target was unset before this save AND there's no
    // existing date. Compute a gentle 0.25 kg/wk trajectory so the user
    // has a working goal after a single edit. If currentKg is null
    // we fall back to today + 28 days as a placeholder.
    if (prefs.targetDate === null) {
      const today = startOfDay(new Date());
      if (currentKg !== null && newTarget !== currentKg) {
        const gap = Math.abs(newTarget - currentKg);
        const weeks = gap / COLD_START_RATE_KG_PER_WEEK;
        patch.targetDate = addDays(today, Math.max(7, Math.round(weeks * 7)));
      } else {
        patch.targetDate = addDays(today, 28);
      }
      // Also stamp startKg so the optimal trajectory has an anchor.
      if (prefs.startKg === null && currentKg !== null) {
        patch.startKg = currentKg;
      }
    }
    onClose(patch);
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => handleClose(true)}
      sheetStyle={targetSheetStyles.sheet}>
      <View style={targetSheetStyles.handle} />
      <View style={targetSheetStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[targetSheetStyles.kicker, textStyles.cap]}>WEIGHT · TARGET</Text>
          <Text style={targetSheetStyles.title}>Edit target</Text>
        </View>
        <Pressable
          onPress={() => handleClose(true)}
          disabled={!valid}
          hitSlop={10}
          style={targetSheetStyles.closeBtn}>
          <Text
            style={[
              targetSheetStyles.closeBtnText,
              !valid && { opacity: 0.4 },
            ]}>
            done
          </Text>
        </Pressable>
      </View>

      <View style={targetSheetStyles.body}>
        <View style={targetSheetStyles.weightCard}>
          <Pressable
            onPress={() => onStep(-TARGET_STEP_KG)}
            disabled={!valid}
            hitSlop={6}
            style={({ pressed }) => [
              targetSheetStyles.stepperBtn,
              !valid && { opacity: 0.35 },
              pressed && valid && { opacity: 0.6 },
            ]}>
            <Text style={targetSheetStyles.stepperLabel}>−</Text>
          </Pressable>
          <View style={targetSheetStyles.weightCenter}>
            <View style={targetSheetStyles.weightValueRow}>
              <TextInput
                value={kgText}
                onChangeText={(t) => setKgText(sanitize(t))}
                onEndEditing={() => {
                  if (!Number.isFinite(parsed)) {
                    // Reset to last good value.
                    const reset =
                      prefs.targetKg ?? (currentKg !== null ? currentKg - 4 : 70);
                    setKgText(reset.toFixed(1));
                    return;
                  }
                  setKgText(clamp(parsed).toFixed(1));
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                maxLength={5}
                style={[targetSheetStyles.weightValue, textStyles.tnum]}
              />
              <Text style={targetSheetStyles.weightUnit}>kg</Text>
            </View>
            <Text style={targetSheetStyles.weightHint}>steps of 0.5 kg</Text>
          </View>
          <Pressable
            onPress={() => onStep(TARGET_STEP_KG)}
            disabled={!valid}
            hitSlop={6}
            style={({ pressed }) => [
              targetSheetStyles.stepperBtn,
              !valid && { opacity: 0.35 },
              pressed && valid && { opacity: 0.6 },
            ]}>
            <Text style={targetSheetStyles.stepperLabel}>+</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

function sanitize(s: string): string {
  let kept = '';
  let sawDot = false;
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') kept += ch;
    else if ((ch === '.' || ch === ',') && !sawDot) {
      kept += '.';
      sawDot = true;
    }
  }
  return kept;
}

// ─── Section + Switch ───────────────────────────────────────────────────────

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
    <View style={{ paddingHorizontal: 22, marginTop: 18 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, textStyles.cap]}>{label}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

/**
 * Apple Health section body. The settings page owns the auth lifecycle
 * for body-mass now — what used to be a banner on /weight lives here as
 * a state-driven section so the user has one place to connect / disconnect
 * / inspect the integration.
 */
function AppleHealthSection({
  auth,
  autoImport,
  lastSyncAt,
  onConnect,
  onToggleAutoImport,
}: {
  auth: HkAuthState;
  autoImport: boolean;
  lastSyncAt: Date | null;
  onConnect: () => void;
  onToggleAutoImport: () => void;
}) {
  if (auth === 'checking') {
    // Brief one-frame window before the auth state lands — render nothing
    // rather than a flash of a wrong state.
    return null;
  }
  if (auth === 'unavailable') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <Text style={styles.cardRowSub}>
            Apple Health not available on this device.
          </Text>
        </View>
      </View>
    );
  }
  if (auth === 'unknown') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardRowName}>Connect to import weigh-ins</Text>
            <Text style={styles.cardRowSub}>
              Mirrors existing body-mass samples and pushes manual entries back.
            </Text>
          </View>
          <Pressable
            onPress={onConnect}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.connectCta,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={styles.connectCtaText}>connect</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (auth === 'denied') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <Text style={styles.cardRowSub}>
            Apple Health off — re-enable read + write for Body Mass in iOS
            Settings → Privacy &amp; Security → Health → Maß.
          </Text>
        </View>
      </View>
    );
  }
  // auth === 'granted'
  return (
    <View style={styles.cardList}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardRowName}>Auto-import from Apple Health</Text>
          <Text style={styles.cardRowSub}>
            {lastSyncAt
              ? `last sync ${formatClock(lastSyncAt)}`
              : 'pulls body-mass samples on app foreground'}
          </Text>
        </View>
        <Switch on={autoImport} onToggle={onToggleAutoImport} />
      </View>
    </View>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      style={[
        styles.switch,
        {
          backgroundColor: on ? tokens.accentInk : tokens.bg2,
          borderColor: on ? tokens.accentInk : tokens.line,
        },
      ]}>
      <View style={[styles.switchKnob, { left: on ? 18 : 2 }]} />
    </Pressable>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Rate in kg/week derived from the actual gap and remaining days. */
function computeDerivedRate(
  currentKg: number | null,
  targetKg: number | null,
  targetDate: Date | null,
): number | null {
  if (currentKg === null || targetKg === null || targetDate === null) return null;
  const days = (startOfDay(targetDate).getTime() - startOfDay(new Date()).getTime()) / DAY_MS;
  if (days <= 0) return null;
  return ((targetKg - currentKg) / days) * 7;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function formatDeltaKg(delta: number): string {
  if (delta === 0) return '0 kg';
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${Math.abs(delta).toFixed(1)} kg`;
}

function formatClock(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 130,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    fontStyle: 'italic',
  },

  // Goal card
  goalCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  goalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  goalCol: {
    flex: 1,
  },
  goalColRight: {
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: tokens.line,
  },
  colKicker: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
  },
  goalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  goalValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 26,
    color: tokens.ink,
    letterSpacing: -0.78,
  },
  goalValueUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },
  goalDateTap: {
    marginTop: 4,
  },
  goalHint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
  },
  goalDivider: {
    marginTop: 14,
    paddingTop: 0,
    borderTopColor: tokens.line,
    borderTopWidth: 1,
    height: 12,
  },
  goalRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  goalRateValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  goalRateValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
  },
  safetyPill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  safetyPillSafe: {
    backgroundColor: 'rgba(72, 183, 189, 0.12)',
  },
  safetyPillFast: {
    backgroundColor: 'rgba(242, 130, 59, 0.12)',
  },
  safetyPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
  },
  safetyPillTextSafe: {
    color: tokens.cool,
  },
  safetyPillTextFast: {
    color: tokens.warn,
  },

  // Toggle list
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  cardRowSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
  },

  connectCta: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: tokens.ink,
  },
  connectCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  // Switch
  switch: {
    width: 36,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    position: 'relative',
  },
  switchKnob: {
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
});

const targetSheetStyles = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -24 },
    shadowRadius: 60,
    shadowOpacity: 0.25,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.line2,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 6,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.87,
  },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 19,
    color: tokens.ink,
    letterSpacing: -0.38,
    marginTop: 4,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  closeBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.accentInk,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
  },
  weightCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.03,
  },
  weightCenter: {
    flex: 1,
    alignItems: 'center',
  },
  weightValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  weightValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 44,
    color: tokens.ink,
    letterSpacing: -1.5,
    minWidth: 100,
    textAlign: 'center',
    paddingVertical: 0,
  },
  weightUnit: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink3,
  },
  weightHint: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 6,
    fontStyle: 'italic',
    letterSpacing: 0.38,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
  },
});
