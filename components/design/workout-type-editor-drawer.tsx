/**
 * Drawer for creating + editing a custom workout type (#72).
 *
 * Sections:
 *   1. name     — free text, drives the auto-derived key below it
 *   2. key      — kebab-case identifier, auto unless touched
 *   3. tone     — 4 tone chips (ink / cool / accent / mute)
 *   4. icon     — 4 icon tiles matching the WorkoutGlyph set
 *   5. steps    — repeating rows: duration stepper + HK activity pick +
 *                 up/down/delete buttons; "+ add step" row at the bottom
 *   6. delete   — destructive, edit mode only, custom types only
 *
 * Save commits a single transaction via the workout-types queries:
 * `createWorkoutType` for new, `updateWorkoutType` + `replaceWorkoutTypeSteps`
 * for edits. The editor uses replace-on-save rather than diff-apply.
 *
 * Built-in types route to a read-only mode (the parent gates this — the
 * lock badge + chevron behavior live in `/workouts-settings`).
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
import Svg, { Path } from 'react-native-svg';

import {
  createWorkoutType,
  deleteWorkoutType,
  replaceWorkoutTypeSteps,
  slugifyKey,
  totalPlannedMinutes,
  updateWorkoutType,
  type WorkoutStepInput,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import {
  WorkoutActivityKey,
  type WorkoutTypeTone,
} from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { BottomSheet } from './bottom-sheet';
import { Drawer, DrawerSection } from './drawer';
import { Glyph } from './glyph';
import { PrimaryButton } from './primary-button';
import { WorkoutGlyph, toneColor } from './plan-day-drawer';

const TONES: ReadonlyArray<{ value: WorkoutTypeTone; label: string }> = [
  { value: 'ink', label: 'Default' },
  { value: 'accent', label: 'Accent' },
  { value: 'cool', label: 'Cool' },
  { value: 'mute', label: 'Mute' },
];

const ICONS: ReadonlyArray<{ value: 'lift' | 'tennis' | 'walk' | 'rest'; label: string }> = [
  { value: 'lift', label: 'Lift' },
  { value: 'tennis', label: 'Racquet' },
  { value: 'walk', label: 'Walk' },
  { value: 'rest', label: 'Calm' },
];

const HK_ACTIVITY_KEYS = Object.keys(WorkoutActivityKey) as ReadonlyArray<
  keyof typeof WorkoutActivityKey
>;

const DURATION_STEP = 5;
const DURATION_MIN = 5;
const DURATION_MAX = 180;
const NAME_MAX = 32;
const KEY_MAX = 32;

type StepDraft = {
  /** Stable client id for keying + reorder. */
  tempId: string;
  durationMin: number;
  hkActivityKey: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, drawer enters edit mode pre-filled from this type. */
  type?: WorkoutTypeDef | null;
};

export function WorkoutTypeEditorDrawer({ open, onClose, type }: Props) {
  const types = useWorkoutTypes();
  const mode: 'create' | 'edit' = type ? 'edit' : 'create';
  const isBuiltin = type?.isBuiltin === true;

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [tone, setTone] = useState<WorkoutTypeTone>('ink');
  const [icon, setIcon] = useState<'lift' | 'tennis' | 'walk' | 'rest'>('lift');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [activityPickerStepId, setActivityPickerStepId] = useState<string | null>(null);

  // Reset every time the drawer opens for a (possibly different) type.
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setActivityPickerStepId(null);
    if (type) {
      setName(type.label);
      setKey(type.key);
      setKeyTouched(true);
      setTone(type.tone);
      setIcon(type.icon);
      setSteps(
        type.steps.map((s, i) => ({
          tempId: `s-${i}-${s.position}`,
          durationMin: s.durationMin,
          hkActivityKey: s.hkActivityKey,
        })),
      );
    } else {
      setName('');
      setKey('');
      setKeyTouched(false);
      setTone('ink');
      setIcon('lift');
      setSteps([
        {
          tempId: `s-${Date.now()}`,
          durationMin: 60,
          hkActivityKey: 'functionalStrengthTraining',
        },
      ]);
    }
  }, [open, type?.id]);

  // Auto-derive key from name until the user edits the key field.
  useEffect(() => {
    if (keyTouched) return;
    setKey(slugifyKey(name));
  }, [name, keyTouched]);

  const trimmedName = name.trim();
  const trimmedKey = key.trim();
  const keyConflict = useMemo(() => {
    if (trimmedKey === '') return false;
    return types.some((t) => t.key === trimmedKey && t.id !== type?.id);
  }, [trimmedKey, types, type?.id]);
  const totalMin = useMemo(
    () => steps.reduce((a, s) => a + s.durationMin, 0),
    [steps],
  );
  const valid =
    trimmedName.length > 0 &&
    trimmedKey.length > 0 &&
    !keyConflict &&
    steps.length > 0;

  // ─── Step editing ────────────────────────────────────────────────────────

  const updateStep = (id: string, patch: Partial<StepDraft>) =>
    setSteps((prev) =>
      prev.map((s) => (s.tempId === id ? { ...s, ...patch } : s)),
    );

  const moveStep = (id: string, dir: -1 | 1) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.tempId === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });

  const deleteStep = (id: string) =>
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.tempId !== id)));

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        tempId: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        durationMin: 30,
        hkActivityKey: prev[prev.length - 1]?.hkActivityKey ?? 'functionalStrengthTraining',
      },
    ]);

  // ─── Save / Delete ───────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!valid || saving || isBuiltin) return;
    setSaving(true);
    const stepInputs: ReadonlyArray<WorkoutStepInput> = steps.map((s) => ({
      durationMin: s.durationMin,
      hkActivityKey: s.hkActivityKey,
      // v1: candidate keys = [primary]. Broader matching arrives when
      // the editor gets a multi-select chip row (follow-up).
      hkCandidateKeys: [s.hkActivityKey],
    }));

    const op =
      type != null
        ? (async () => {
            await updateWorkoutType(type.id, {
              key: trimmedKey,
              label: trimmedName,
              tone,
              icon,
            });
            await replaceWorkoutTypeSteps(type.id, stepInputs);
          })()
        : createWorkoutType({
            key: trimmedKey,
            label: trimmedName,
            tone,
            icon,
            steps: stepInputs,
          });

    op
      .then(() => onClose())
      .catch((err) => {
        Alert.alert(
          type ? 'Could not save type' : 'Could not create type',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [valid, saving, isBuiltin, type, trimmedKey, trimmedName, tone, icon, steps, onClose]);

  const handleDelete = useCallback(() => {
    if (!type || isBuiltin || saving) return;
    Alert.alert(
      `Delete ${type.label}?`,
      'Planned slots that use this type will fall back to rest. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteWorkoutType(type.id)
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
  }, [type, isBuiltin, saving, onClose]);

  const activeActivityStep =
    activityPickerStepId !== null
      ? steps.find((s) => s.tempId === activityPickerStepId) ?? null
      : null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        kicker={mode === 'edit' ? 'WORKOUT TYPE · EDIT' : 'WORKOUT TYPE · NEW'}
        title={mode === 'edit' ? 'Edit type' : 'New type'}
        cta={
          <PrimaryButton
            label={
              saving
                ? 'saving…'
                : isBuiltin
                ? 'built-in · read only'
                : valid
                ? `save · ${totalMin}m total`
                : keyConflict
                ? 'key already taken'
                : 'fill name + at least one step'
            }
            onPress={handleSave}
            disabled={!valid || saving || isBuiltin}
          />
        }>
        {/* NAME + KEY */}
        <DrawerSection label="name" marginTop={8}>
          <View style={styles.textRow}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
              editable={!isBuiltin}
              placeholder="e.g. Marathon prep"
              placeholderTextColor={tokens.ink4}
              style={styles.textInput}
            />
          </View>
        </DrawerSection>

        <DrawerSection label="key" sub="kebab-case · unique">
          <View style={styles.textRow}>
            <TextInput
              value={key}
              onChangeText={(t) => {
                setKeyTouched(true);
                setKey(t.slice(0, KEY_MAX));
              }}
              editable={!isBuiltin}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="marathon-prep"
              placeholderTextColor={tokens.ink4}
              style={[styles.textInput, { fontFamily: fonts.mono }]}
            />
          </View>
          {keyConflict && (
            <Text style={styles.errorText}>
              key already in use by another type
            </Text>
          )}
        </DrawerSection>

        {/* TONE */}
        <DrawerSection label="tone">
          <View style={styles.chipRow}>
            {TONES.map((t) => {
              const active = tone === t.value;
              return (
                <Pressable
                  key={t.value}
                  disabled={isBuiltin}
                  onPress={() => setTone(t.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && !active && { opacity: 0.7 },
                    isBuiltin && { opacity: 0.5 },
                  ]}>
                  <View
                    style={[
                      styles.toneSwatch,
                      { backgroundColor: toneColor(t.value) },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipLabel,
                      active && { color: tokens.bg },
                    ]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </DrawerSection>

        {/* ICON */}
        <DrawerSection label="icon">
          <View style={styles.iconGrid}>
            {ICONS.map((i) => {
              const active = icon === i.value;
              return (
                <Pressable
                  key={i.value}
                  disabled={isBuiltin}
                  onPress={() => setIcon(i.value)}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.iconTile,
                    active && styles.iconTileActive,
                    pressed && !active && { opacity: 0.7 },
                    isBuiltin && { opacity: 0.5 },
                  ]}>
                  <WorkoutGlyph
                    icon={i.value}
                    color={active ? tokens.bg : toneColor(tone)}
                  />
                  <Text
                    style={[
                      styles.iconLabel,
                      active && { color: tokens.bg },
                    ]}>
                    {i.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </DrawerSection>

        {/* STEPS */}
        <DrawerSection
          label="steps"
          sub={`${steps.length} · ${totalMin}m total`}>
          <View style={styles.stepList}>
            {steps.map((s, idx) => (
              <StepRow
                key={s.tempId}
                index={idx}
                total={steps.length}
                step={s}
                disabled={isBuiltin}
                onChangeDuration={(d) => updateStep(s.tempId, { durationMin: d })}
                onPickActivity={() => setActivityPickerStepId(s.tempId)}
                onMoveUp={() => moveStep(s.tempId, -1)}
                onMoveDown={() => moveStep(s.tempId, 1)}
                onDelete={() => deleteStep(s.tempId)}
              />
            ))}
          </View>
          {!isBuiltin && (
            <Pressable
              onPress={addStep}
              style={({ pressed }) => [
                styles.addStepBtn,
                pressed && { opacity: 0.55 },
              ]}>
              <Glyph name="plus" color={tokens.ink3} size={10} />
              <Text style={[styles.addStepText, textStyles.cap]}>add step</Text>
            </Pressable>
          )}
        </DrawerSection>

        {mode === 'edit' && !isBuiltin && (
          <Pressable
            onPress={handleDelete}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Delete this type"
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Text style={[styles.deleteText, textStyles.cap]}>delete type</Text>
          </Pressable>
        )}

        {isBuiltin && (
          <Text style={styles.builtinHint}>
            built-in types are read-only — duplicate to customize (coming soon)
          </Text>
        )}

        <View style={{ height: 12 }} />
      </Drawer>

      <ActivityPickerSheet
        open={activeActivityStep !== null}
        current={activeActivityStep?.hkActivityKey ?? null}
        onClose={() => setActivityPickerStepId(null)}
        onSelect={(key) => {
          if (activityPickerStepId !== null) {
            updateStep(activityPickerStepId, { hkActivityKey: key });
          }
          setActivityPickerStepId(null);
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StepRow — one row in the step builder.
// ─────────────────────────────────────────────────────────────────────────────
function StepRow({
  index,
  total,
  step,
  disabled,
  onChangeDuration,
  onPickActivity,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  total: number;
  step: StepDraft;
  disabled: boolean;
  onChangeDuration: (d: number) => void;
  onPickActivity: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const decrement = () =>
    onChangeDuration(Math.max(DURATION_MIN, step.durationMin - DURATION_STEP));
  const increment = () =>
    onChangeDuration(Math.min(DURATION_MAX, step.durationMin + DURATION_STEP));
  return (
    <View style={styles.stepRow}>
      <Text style={[styles.stepIdx, textStyles.tnum]}>{index + 1}</Text>
      <View style={styles.stepBody}>
        <Pressable
          onPress={onPickActivity}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Pick activity for step ${index + 1}`}
          style={({ pressed }) => [
            styles.activityBtn,
            pressed && !disabled && { opacity: 0.7 },
          ]}>
          <Text numberOfLines={1} style={styles.activityLabel}>
            {humanizeActivity(step.hkActivityKey)}
          </Text>
          <Glyph name="chev" color={tokens.ink3} />
        </Pressable>
        <View style={styles.durRow}>
          <Pressable
            onPress={decrement}
            disabled={disabled || step.durationMin <= DURATION_MIN}
            hitSlop={4}
            style={({ pressed }) => [
              styles.durStepBtn,
              (disabled || step.durationMin <= DURATION_MIN) && { opacity: 0.35 },
              pressed && { opacity: 0.6 },
            ]}>
            <Text style={styles.durStepLabel}>−</Text>
          </Pressable>
          <Text style={[styles.durValue, textStyles.tnum]}>
            {step.durationMin}m
          </Text>
          <Pressable
            onPress={increment}
            disabled={disabled || step.durationMin >= DURATION_MAX}
            hitSlop={4}
            style={({ pressed }) => [
              styles.durStepBtn,
              (disabled || step.durationMin >= DURATION_MAX) && { opacity: 0.35 },
              pressed && { opacity: 0.6 },
            ]}>
            <Text style={styles.durStepLabel}>+</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.stepCtrls}>
        <ArrowBtn
          dir="up"
          disabled={disabled || index === 0}
          onPress={onMoveUp}
        />
        <ArrowBtn
          dir="down"
          disabled={disabled || index === total - 1}
          onPress={onMoveDown}
        />
        <Pressable
          onPress={onDelete}
          disabled={disabled || total <= 1}
          hitSlop={4}
          style={({ pressed }) => [
            styles.delBtn,
            (disabled || total <= 1) && { opacity: 0.35 },
            pressed && { opacity: 0.6 },
          ]}>
          <Svg width={10} height={10} viewBox="0 0 12 12">
            <Path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke={tokens.ink3}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

function ArrowBtn({
  dir,
  disabled,
  onPress,
}: {
  dir: 'up' | 'down';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.arrowBtn,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.6 },
      ]}>
      <Glyph name={dir === 'up' ? 'arrUp' : 'arrDn'} color={tokens.ink3} size={9} />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityPickerSheet — bottom sheet listing the HK activity keys we
// know about. Tap one to assign it to the current step.
// ─────────────────────────────────────────────────────────────────────────────
function ActivityPickerSheet({
  open,
  current,
  onClose,
  onSelect,
}: {
  open: boolean;
  current: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={pickerStyles.sheet}>
      <View style={pickerStyles.handle} />
      <View style={pickerStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[pickerStyles.kicker, textStyles.cap]}>HK activity</Text>
          <Text style={pickerStyles.title}>Pick an activity</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={pickerStyles.closeBtn}>
          <Text style={pickerStyles.closeBtnText}>cancel</Text>
        </Pressable>
      </View>
      <View style={pickerStyles.body}>
        <View style={pickerStyles.grid}>
          {HK_ACTIVITY_KEYS.map((k) => {
            const active = current === k;
            return (
              <Pressable
                key={k}
                onPress={() => onSelect(k)}
                style={({ pressed }) => [
                  pickerStyles.gridChip,
                  active && pickerStyles.gridChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text
                  style={[
                    pickerStyles.gridChipLabel,
                    active && { color: tokens.bg },
                  ]}>
                  {humanizeActivity(k)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanizeActivity(hkKey: string): string {
  return hkKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  textRow: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  textInput: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.14,
    paddingVertical: 0,
  },
  errorText: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.warn,
    fontStyle: 'italic',
    letterSpacing: 0.38,
  },

  // Tone + icon chips
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  chipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink,
    letterSpacing: 0.4,
  },
  toneSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  iconGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  iconTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 6,
  },
  iconTileActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  iconLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9.5,
    color: tokens.ink,
    letterSpacing: 0.38,
  },

  // Steps
  stepList: {
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepIdx: {
    width: 14,
    textAlign: 'center',
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink4,
  },
  stepBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  activityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 6,
  },
  activityLabel: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.22,
  },
  durRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durStepBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durStepLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
  },
  durValue: {
    minWidth: 38,
    textAlign: 'center',
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: -0.06,
  },
  stepCtrls: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  arrowBtn: {
    width: 22,
    height: 18,
    borderRadius: 5,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  addStepBtn: {
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addStepText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9.5,
    color: tokens.ink3,
    letterSpacing: 1.71,
  },

  deleteBtn: {
    marginTop: 22,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  deleteText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.accentInk,
    letterSpacing: 1.6,
  },
  builtinHint: {
    marginTop: 18,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});

const pickerStyles = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
    maxHeight: '70%',
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
    color: tokens.ink3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridChip: {
    flexGrow: 1,
    flexBasis: '48%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  gridChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  gridChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.22,
    textTransform: 'lowercase',
  },
});
