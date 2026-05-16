/**
 * Water settings — port of designs/screen-water.jsx WaterSettings.
 *
 * Auto-commit pattern: every interaction immediately writes to
 * `water_preferences`. No save button. Mirrors `app/fasting-settings.tsx`.
 *
 * Out of scope for v1 (called out in issue #42):
 *   - Reminders section → deferred to #44 once notifications infra lands.
 *   - "auto-log from smart bottle" → dropped.
 *   - Tea/coffee percent — partial-counting was removed entirely (see #75).
 *
 * Quick-add amounts are editable via a bottom sheet (tap a row).
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BottomSheet, Glyph, SubHeader, TabBar } from '@/components/design';
import { updatePreferences } from '@/src/db/queries/water-preferences';
import type { WaterPreferences } from '@/src/db/schema';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─── Target slider config ────────────────────────────────────────────────────
const TARGET_MIN_ML = 1000;
const TARGET_MAX_ML = 5000;
const TARGET_STEP_ML = 250;
const RECOMMENDED_MIN_ML = 2500;
const RECOMMENDED_MAX_ML = 3500;

// ─── Quick-add edit bounds ───────────────────────────────────────────────────
const QUICK_ADD_MIN_ML = 50;
const QUICK_ADD_MAX_ML = 1500;
const QUICK_ADD_STEP_ML = 50;
const QUICK_ADD_LABEL_MAX = 16;

type QuickAddSlot = 1 | 2 | 3 | 4;

const slotMlKey = (slot: QuickAddSlot) =>
  (`quickAdd${slot}Ml` as const) as
    | 'quickAdd1Ml'
    | 'quickAdd2Ml'
    | 'quickAdd3Ml'
    | 'quickAdd4Ml';

const slotLabelKey = (slot: QuickAddSlot) =>
  (`quickAdd${slot}Label` as const) as
    | 'quickAdd1Label'
    | 'quickAdd2Label'
    | 'quickAdd3Label'
    | 'quickAdd4Label';

const WEEKDAYS: { label: string; bit: number }[] = [
  { label: 'M', bit: 0 },
  { label: 'T', bit: 1 },
  { label: 'W', bit: 2 },
  { label: 'T', bit: 3 },
  { label: 'F', bit: 4 },
  { label: 'S', bit: 5 },
  { label: 'S', bit: 6 },
];

export default function WaterSettingsScreen() {
  const router = useRouter();
  const prefs = useWaterPreferences();
  // Hooks must run unconditionally — declare before the early-out below.
  const [editingSlot, setEditingSlot] = useState<QuickAddSlot | null>(null);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const writeFail = (err: unknown) =>
    console.warn('Failed to update water preferences:', err);
  const write = (patch: Partial<WaterPreferences>) =>
    updatePreferences(patch).catch(writeFail);

  const clampTarget = (ml: number) =>
    Math.min(Math.max(ml, TARGET_MIN_ML), TARGET_MAX_ML);

  const onAdjustTarget = (deltaMl: number) => {
    const next = clampTarget(prefs.targetMl + deltaMl);
    if (next !== prefs.targetMl) write({ targetMl: next });
  };

  const onToggleWeekday = (bit: number) => {
    write({ weekdayBitmask: prefs.weekdayBitmask ^ (1 << bit) });
  };

  /** Commit edits and close. Empty label falls back to 'sip' so the row never
   *  renders an empty string. */
  const onCloseQuickAddEdit = (patch: { slot: QuickAddSlot; ml: number; label: string } | null) => {
    if (patch) {
      const cleanLabel = patch.label.trim() || 'sip';
      write({
        [slotMlKey(patch.slot)]: patch.ml,
        [slotLabelKey(patch.slot)]: cleanLabel,
      } as Partial<WaterPreferences>);
    }
    setEditingSlot(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SubHeader title="Water · settings" back="Water" onBack={() => router.back()} />

        {/* DAILY TARGET */}
        <Section
          label="daily target"
          sub={`${(prefs.targetMl / 1000).toFixed(1)} L · per day`}>
          <View style={styles.targetCard}>
            <View style={styles.targetRow}>
              <View style={styles.targetValueRow}>
                <Text style={[styles.targetValue, textStyles.tnum]}>
                  {(prefs.targetMl / 1000).toFixed(2)}
                </Text>
                <Text style={styles.targetUnit}>L</Text>
              </View>
              <View style={styles.targetSteppers}>
                <StepperButton
                  label="−0.25"
                  disabled={prefs.targetMl <= TARGET_MIN_ML}
                  onPress={() => onAdjustTarget(-TARGET_STEP_ML)}
                />
                <StepperButton
                  label="+0.25"
                  disabled={prefs.targetMl >= TARGET_MAX_ML}
                  onPress={() => onAdjustTarget(TARGET_STEP_ML)}
                />
              </View>
            </View>

            <Slider
              value={prefs.targetMl}
              onChange={(ml) => write({ targetMl: ml })}
              min={TARGET_MIN_ML}
              max={TARGET_MAX_ML}
              step={TARGET_STEP_ML}
              recommended={{ min: RECOMMENDED_MIN_ML, max: RECOMMENDED_MAX_ML }}
              style={{ marginTop: 6 }}
            />

            <View style={styles.targetEndLabels}>
              <Text style={styles.targetEndLabel}>{TARGET_MIN_ML / 1000} L</Text>
              <Text style={styles.targetCenterLabel}>recommended</Text>
              <Text style={styles.targetEndLabel}>{TARGET_MAX_ML / 1000} L</Text>
            </View>
          </View>
        </Section>

        {/* UNITS section removed — pref isn't consumed yet. Re-add when #45 ships. */}

        {/* QUICK-ADD AMOUNTS */}
        <Section label="quick-add amounts" sub="tap to edit">
          <View style={styles.cardList}>
            {(
              [
                { slot: 1 as QuickAddSlot, ml: prefs.quickAdd1Ml, label: prefs.quickAdd1Label },
                { slot: 2 as QuickAddSlot, ml: prefs.quickAdd2Ml, label: prefs.quickAdd2Label },
                { slot: 3 as QuickAddSlot, ml: prefs.quickAdd3Ml, label: prefs.quickAdd3Label },
                { slot: 4 as QuickAddSlot, ml: prefs.quickAdd4Ml, label: prefs.quickAdd4Label },
              ] as const
            ).map((row, i, arr) => (
              <Pressable
                key={row.slot}
                onPress={() => setEditingSlot(row.slot)}
                style={({ pressed }) => [
                  styles.cardRow,
                  i < arr.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: tokens.line,
                  },
                  pressed && { opacity: 0.6 },
                ]}>
                <View style={styles.quickAddValueRow}>
                  <Text style={[styles.quickAddValue, textStyles.tnum]}>{row.ml}</Text>
                  <Text style={styles.quickAddUnit}>ml</Text>
                </View>
                <View style={styles.quickAddRowEnd}>
                  <Text style={[styles.quickAddLabel, textStyles.cap]}>{row.label}</Text>
                  <Glyph name="chev" color={tokens.ink4} size={9} />
                </View>
              </Pressable>
            ))}
          </View>
        </Section>

        {/* WEEKLY SCHEDULE */}
        <Section label="weekly schedule" sub="apply on these days">
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((d, i) => {
              const on = (prefs.weekdayBitmask & (1 << d.bit)) !== 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => onToggleWeekday(d.bit)}
                  style={[
                    styles.dayCircle,
                    on ? styles.dayCircleOn : styles.dayCircleOff,
                  ]}>
                  <Text style={[styles.dayCircleText, on && { color: tokens.bg }]}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.weeklySummary}>{summarizeWeekdays(prefs.weekdayBitmask)}</Text>
        </Section>

        {/* ADJUSTMENTS section removed — needs Slice 4 (workouts) to wire. Re-add when #46 ships. */}
      </ScrollView>

      <TabBar active="home" />

      <QuickAddEditSheet
        slot={editingSlot}
        prefs={prefs}
        onClose={onCloseQuickAddEdit}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add edit sheet — bottom sheet with ml stepper + label TextInput.
//
// State is local to the sheet (re-seeded each open) and commits on close via
// onClose's patch arg. Empty label gets defaulted to 'sip' in the parent.
// ─────────────────────────────────────────────────────────────────────────────
function QuickAddEditSheet({
  slot,
  prefs,
  onClose,
}: {
  slot: QuickAddSlot | null;
  prefs: WaterPreferences;
  onClose: (patch: { slot: QuickAddSlot; ml: number; label: string } | null) => void;
}) {
  // Initial values are derived from the current slot when it opens. Local
  // state during edit avoids re-rendering on every keystroke through SQLite.
  const [ml, setMl] = useState<number>(0);
  const [label, setLabel] = useState<string>('');

  useEffect(() => {
    if (slot === null) return;
    setMl(prefs[slotMlKey(slot)]);
    setLabel(prefs[slotLabelKey(slot)]);
  }, [slot, prefs]);

  const clampMl = (next: number) =>
    Math.min(Math.max(next, QUICK_ADD_MIN_ML), QUICK_ADD_MAX_ML);

  const handleClose = (commit: boolean) => {
    if (commit && slot !== null) {
      onClose({ slot, ml, label });
    } else {
      onClose(null);
    }
  };

  return (
    <BottomSheet
      open={slot !== null}
      onClose={() => handleClose(true)}
      sheetStyle={editSheetStyles.sheet}>
      <View style={editSheetStyles.handle} />
      <View style={editSheetStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[editSheetStyles.kicker, textStyles.cap]}>QUICK-ADD</Text>
          <Text style={editSheetStyles.title}>Edit slot {slot ?? ''}</Text>
        </View>
        <Pressable
          onPress={() => handleClose(true)}
          hitSlop={10}
          style={editSheetStyles.closeBtn}>
          <Text style={editSheetStyles.closeBtnText}>done</Text>
        </Pressable>
      </View>

      <View style={editSheetStyles.body}>
        {/* Amount */}
        <Text style={[styles.sectionLabel, textStyles.cap, { marginBottom: 8 }]}>amount</Text>
        <View style={styles.targetCard}>
          <View style={styles.targetRow}>
            <View style={styles.targetValueRow}>
              <Text style={[styles.targetValue, textStyles.tnum]}>{ml}</Text>
              <Text style={styles.targetUnit}>ml</Text>
            </View>
            <View style={styles.targetSteppers}>
              <StepperButton
                label={`−${QUICK_ADD_STEP_ML}`}
                disabled={ml <= QUICK_ADD_MIN_ML}
                onPress={() => setMl(clampMl(ml - QUICK_ADD_STEP_ML))}
              />
              <StepperButton
                label={`+${QUICK_ADD_STEP_ML}`}
                disabled={ml >= QUICK_ADD_MAX_ML}
                onPress={() => setMl(clampMl(ml + QUICK_ADD_STEP_ML))}
              />
            </View>
          </View>
          <Slider
            value={ml}
            onChange={setMl}
            min={QUICK_ADD_MIN_ML}
            max={QUICK_ADD_MAX_ML}
            step={QUICK_ADD_STEP_ML}
            style={{ marginTop: 4 }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 0 }}>
            <Text style={styles.targetEndLabel}>{QUICK_ADD_MIN_ML} ml</Text>
            <Text style={styles.targetEndLabel}>{QUICK_ADD_MAX_ML} ml</Text>
          </View>
        </View>

        {/* Label */}
        <Text
          style={[styles.sectionLabel, textStyles.cap, { marginTop: 18, marginBottom: 8 }]}>
          label
        </Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. glass"
          placeholderTextColor={tokens.ink4}
          maxLength={QUICK_ADD_LABEL_MAX}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => handleClose(true)}
          style={editSheetStyles.input}
        />
        <Text style={editSheetStyles.inputHint}>
          {label.length}/{QUICK_ADD_LABEL_MAX} · shown under the ml on the water screen
        </Text>
      </View>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — header (label + sub) + body slot. Same shape as fasting-settings.
// ─────────────────────────────────────────────────────────────────────────────
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

function StepperButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.stepperBtn,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.6 },
      ]}>
      <Text style={styles.stepperLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Tap or drag a horizontal slider to set a value. Snaps to `step` and
 * stays inside [min, max]. The optional `recommended` band paints a
 * faint accent fill on the track so the user knows the sane range.
 *
 * Hit area is taller than the visible track so the gesture is comfortable
 * with a thumb — the bar itself stays a thin 4px line.
 */
function Slider({
  value,
  onChange,
  min,
  max,
  step,
  recommended,
  style,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  recommended?: { min: number; max: number };
  style?: import('react-native').ViewStyle;
}) {
  const widthRef = useRef(0);
  const range = max - min;
  const pct = range > 0 ? (value - min) / range : 0;

  const clamp = (n: number) => Math.min(Math.max(n, min), max);
  const snap = (n: number) => Math.round(n / step) * step;
  const positionToValue = (x: number) => {
    if (widthRef.current === 0) return value;
    const p = Math.min(Math.max(x / widthRef.current, 0), 1);
    return clamp(snap(min + p * range));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  // Pan = drag the handle around. We use the absolute finger x rather than
  // accumulating translation, so tap-down anywhere on the track jumps the
  // handle to that spot and dragging follows the finger 1:1.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-3, 3])
        .failOffsetY([-12, 12])
        .shouldCancelWhenOutside(false)
        .onUpdate((e) => {
          const next = positionToValue(e.x);
          if (next !== value) onChange(next);
        })
        .runOnJS(true),
    // positionToValue closes over `value`; including it would re-create
    // the gesture every render. value is read fresh in onUpdate so that's
    // fine. min/max/step are config and stable for our use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, min, max, step],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .onEnd((e) => {
          const next = positionToValue(e.x);
          if (next !== value) onChange(next);
        })
        .runOnJS(true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, min, max, step],
  );

  const composed = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const recoStart = recommended ? (recommended.min - min) / range : 0;
  const recoEnd = recommended ? (recommended.max - min) / range : 0;

  return (
    <GestureDetector gesture={composed}>
      <View style={[sliderStyles.hitArea, style]} onLayout={onLayout}>
        <View style={sliderStyles.track}>
          {recommended && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${recoStart * 100}%`,
                width: `${(recoEnd - recoStart) * 100}%`,
                backgroundColor: tokens.accent,
                opacity: 0.35,
                borderRadius: 4,
              }}
            />
          )}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct * 100}%`,
              backgroundColor: tokens.ink,
              borderRadius: 4,
            }}
          />
          <View
            pointerEvents="none"
            style={[sliderStyles.handle, { left: `${pct * 100}%` }]}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

const sliderStyles = StyleSheet.create({
  // Pad vertically so the gesture handler has thumb-sized hit space even
  // though the visible track is only 4px tall.
  hitArea: {
    paddingVertical: 10,
  },
  track: {
    position: 'relative',
    height: 4,
    backgroundColor: tokens.bg2,
    borderRadius: 4,
  },
  handle: {
    position: 'absolute',
    top: -4,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: tokens.card,
    borderWidth: 2,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.08,
  },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function summarizeWeekdays(bitmask: number): string {
  let count = 0;
  for (let i = 0; i < 7; i++) if (bitmask & (1 << i)) count++;
  const weekendsOff = !(bitmask & (1 << 5)) && !(bitmask & (1 << 6));
  if (count === 0) return 'no active days';
  if (count === 7) return 'every day';
  if (weekendsOff && count === 5) return '5 active days · weekends off';
  return `${count} active day${count === 1 ? '' : 's'}`;
}

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
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    fontStyle: 'italic',
  },

  // ── Target card ─────────────────────────────────────────────────
  targetCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  targetValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  targetValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 30,
    color: tokens.ink,
    letterSpacing: -0.9,
  },
  targetUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  targetSteppers: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperBtn: {
    minWidth: 50,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
  },
  targetEndLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  targetEndLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 0.44,
  },
  targetCenterLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.44,
  },

  // ── Quick-add rows ──────────────────────────────────────────────
  quickAddValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  quickAddValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
  },
  quickAddUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
  },
  quickAddLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  quickAddRowEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Weekly schedule ─────────────────────────────────────────────
  weekdayRow: {
    flexDirection: 'row',
    gap: 5,
  },
  dayCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleOn: {
    backgroundColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.1,
  },
  dayCircleOff: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  dayCircleText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink3,
    letterSpacing: 0.78,
  },
  weeklySummary: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    marginTop: 8,
  },

  // ── Card list (quick-add + adjustments) ─────────────────────────
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
    fontSize: 15,
    color: tokens.ink,
  },
  cardRowSub: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    marginTop: 3,
    fontStyle: 'italic',
  },

});

const editSheetStyles = StyleSheet.create({
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
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
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
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 1.92,
    textTransform: 'uppercase',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
  },
  input: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.32,
  },
  inputHint: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    marginTop: 6,
    fontStyle: 'italic',
    letterSpacing: 0.48,
  },
});
