/**
 * Workout type editor — full page (#72, post-drawer).
 *
 * Route: /workout-type/new (create) or /workout-type/<numeric id> (edit).
 *
 * Replaces the drawer-based editor. The drawer ran out of room once the
 * step-builder + HK activity picker needed search + scroll; nesting a
 * second react-native `Modal` for the picker also caused iOS touch
 * events to drop on the upper layer. A full page sidesteps both:
 *   - one navigation stack frame, no nested modal at all
 *   - room for the long HK activity list with a search field
 *   - back gesture / hardware back behaves naturally
 *
 * Sections:
 *   1. name + auto-derived kebab key (override-able, uniqueness checked)
 *   2. tone — 4 chips with color swatches
 *   3. icon — 4 tiles
 *   4. steps — repeating rows; tap activity opens an inline picker
 *              with a search input above the chip grid
 *   5. delete — destructive at the bottom (edit mode only)
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
import { WorkoutGlyph, toneColor } from '@/components/design/plan-day-drawer';
import {
  createWorkoutType,
  deleteWorkoutType,
  replaceWorkoutTypeSteps,
  slugifyKey,
  updateWorkoutType,
  type WorkoutStepInput,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import {
  HK_ACTIVITY_KEYS,
  fallbackLabelForHkActivity,
  type WorkoutTypeTone,
} from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

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

export default function WorkoutTypeEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const types = useWorkoutTypes();

  const numericId = id && id !== 'new' ? Number(id) : null;
  const isCreate = id === 'new';
  const type: WorkoutTypeDef | null = useMemo(() => {
    if (numericId === null) return null;
    return types.find((t) => t.id === numericId) ?? null;
  }, [types, numericId]);
  const mode: 'create' | 'edit' = isCreate ? 'create' : 'edit';

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [tone, setTone] = useState<WorkoutTypeTone>('ink');
  const [icon, setIcon] = useState<'lift' | 'tennis' | 'walk' | 'rest'>('lift');
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerStepId, setPickerStepId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  /** Tracks whether we've hydrated from the loaded type yet (edit only). */
  const [hydrated, setHydrated] = useState(false);

  // Initial seed: create-mode is immediate; edit-mode waits for the live
  // types query to resolve before populating fields.
  useEffect(() => {
    if (isCreate) {
      if (hydrated) return;
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
      setHydrated(true);
      return;
    }
    if (!type || hydrated) return;
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
    setHydrated(true);
  }, [isCreate, type, hydrated]);

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

  const updateStep = (stepId: string, patch: Partial<StepDraft>) =>
    setSteps((prev) =>
      prev.map((s) => (s.tempId === stepId ? { ...s, ...patch } : s)),
    );

  const moveStep = (stepId: string, dir: -1 | 1) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.tempId === stepId);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });

  const deleteStep = (stepId: string) =>
    setSteps((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.tempId !== stepId),
    );

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        tempId: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        durationMin: 30,
        hkActivityKey: prev[prev.length - 1]?.hkActivityKey ?? 'functionalStrengthTraining',
      },
    ]);

  const togglePicker = (stepId: string) => {
    setPickerStepId((cur) => (cur === stepId ? null : stepId));
    setPickerSearch('');
  };

  const onSelectActivity = (stepId: string, activityKey: string) => {
    updateStep(stepId, { hkActivityKey: activityKey });
    setPickerStepId(null);
    setPickerSearch('');
  };

  // ─── Save / Delete ───────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);
    const stepInputs: ReadonlyArray<WorkoutStepInput> = steps.map((s) => ({
      durationMin: s.durationMin,
      hkActivityKey: s.hkActivityKey,
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
      .then(() => router.back())
      .catch((err) => {
        Alert.alert(
          type ? 'Could not save type' : 'Could not create type',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [valid, saving, type, trimmedKey, trimmedName, tone, icon, steps, router]);

  const handleDelete = useCallback(() => {
    if (!type || saving) return;
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
  }, [type, saving, router]);

  // Edit mode but the type hasn't loaded yet — show a blank canvas.
  if (mode === 'edit' && !type) {
    return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
  }

  // Filter HK activity list by lowercase substring across keys + humanized.
  const filteredActivities = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (q === '') return HK_ACTIVITY_KEYS;
    return HK_ACTIVITY_KEYS.filter(
      (k) =>
        k.toLowerCase().includes(q) ||
        fallbackLabelForHkActivity(k).toLowerCase().includes(q),
    );
  }, [pickerSearch]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustsScrollIndicatorInsets>
        <SubHeader
          title={mode === 'edit' ? 'Edit type' : 'New type'}
          back="Settings"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={handleSave}
              disabled={!valid || saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save type"
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

        {/* NAME + KEY */}
        <Section label="name" marginTop={12}>
          <View style={styles.textRow}>
            <TextInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
              placeholder="e.g. Marathon prep"
              placeholderTextColor={tokens.ink4}
              style={styles.textInput}
            />
          </View>
        </Section>

        <Section label="key" sub="kebab-case · unique">
          <View style={styles.textRow}>
            <TextInput
              value={key}
              onChangeText={(t) => {
                setKeyTouched(true);
                setKey(t.slice(0, KEY_MAX));
              }}
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
        </Section>

        {/* TONE */}
        <Section label="tone">
          <View style={styles.chipRow}>
            {TONES.map((t) => {
              const active = tone === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setTone(t.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && !active && { opacity: 0.7 },
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
        </Section>

        {/* ICON */}
        <Section label="icon">
          <View style={styles.iconGrid}>
            {ICONS.map((i) => {
              const active = icon === i.value;
              return (
                <Pressable
                  key={i.value}
                  onPress={() => setIcon(i.value)}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.iconTile,
                    active && styles.iconTileActive,
                    pressed && !active && { opacity: 0.7 },
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
        </Section>

        {/* STEPS */}
        <Section label="steps" sub={`${steps.length} · ${totalMin}m total`}>
          <View style={styles.stepList}>
            {steps.map((s, idx) => (
              <StepRow
                key={s.tempId}
                index={idx}
                total={steps.length}
                step={s}
                pickerOpen={pickerStepId === s.tempId}
                searchValue={pickerStepId === s.tempId ? pickerSearch : ''}
                filteredActivities={
                  pickerStepId === s.tempId ? filteredActivities : []
                }
                onChangeDuration={(d) => updateStep(s.tempId, { durationMin: d })}
                onTogglePicker={() => togglePicker(s.tempId)}
                onSearchChange={setPickerSearch}
                onSelectActivity={(key) => onSelectActivity(s.tempId, key)}
                onMoveUp={() => moveStep(s.tempId, -1)}
                onMoveDown={() => moveStep(s.tempId, 1)}
                onDelete={() => deleteStep(s.tempId)}
              />
            ))}
          </View>
          <Pressable
            onPress={addStep}
            style={({ pressed }) => [
              styles.addStepBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Glyph name="plus" color={tokens.ink3} size={10} />
            <Text style={[styles.addStepText, textStyles.cap]}>add step</Text>
          </Pressable>
        </Section>

        {mode === 'edit' && (
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

        {!valid && (
          <Text style={styles.bottomHint}>
            {keyConflict
              ? 'pick another key to save'
              : 'name + at least one step required'}
          </Text>
        )}

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — local helper, copied from plan-day-drawer's pattern.
// ─────────────────────────────────────────────────────────────────────────────
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
        {sub && (
          <Text style={styles.sectionSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StepRow — duration controls + activity chip; inline picker expands below
// with a search input and the full HK activity catalog.
// ─────────────────────────────────────────────────────────────────────────────
function StepRow({
  index,
  total,
  step,
  pickerOpen,
  searchValue,
  filteredActivities,
  onChangeDuration,
  onTogglePicker,
  onSearchChange,
  onSelectActivity,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  total: number;
  step: StepDraft;
  pickerOpen: boolean;
  searchValue: string;
  filteredActivities: ReadonlyArray<string>;
  onChangeDuration: (d: number) => void;
  onTogglePicker: () => void;
  onSearchChange: (s: string) => void;
  onSelectActivity: (key: string) => void;
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
      <View style={styles.stepHeadRow}>
        <Text style={[styles.stepIdx, textStyles.tnum]}>{index + 1}</Text>
        <View style={styles.stepBody}>
          <Pressable
            onPress={onTogglePicker}
            accessibilityRole="button"
            accessibilityLabel={`Pick activity for step ${index + 1}`}
            style={({ pressed }) => [
              styles.activityBtn,
              pickerOpen && styles.activityBtnOpen,
              pressed && { opacity: 0.7 },
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.activityLabel,
                pickerOpen && { color: tokens.bg },
              ]}>
              {fallbackLabelForHkActivity(step.hkActivityKey).toLowerCase()}
            </Text>
            <Glyph name="chev" color={pickerOpen ? tokens.bg : tokens.ink3} />
          </Pressable>
          <View style={styles.durRow}>
            <Pressable
              onPress={decrement}
              disabled={step.durationMin <= DURATION_MIN}
              hitSlop={4}
              style={({ pressed }) => [
                styles.durStepBtn,
                step.durationMin <= DURATION_MIN && { opacity: 0.35 },
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={styles.durStepLabel}>−</Text>
            </Pressable>
            <Text style={[styles.durValue, textStyles.tnum]}>
              {step.durationMin}m
            </Text>
            <Pressable
              onPress={increment}
              disabled={step.durationMin >= DURATION_MAX}
              hitSlop={4}
              style={({ pressed }) => [
                styles.durStepBtn,
                step.durationMin >= DURATION_MAX && { opacity: 0.35 },
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={styles.durStepLabel}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.stepCtrls}>
          <ArrowBtn
            dir="up"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <ArrowBtn
            dir="down"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          <Pressable
            onPress={onDelete}
            disabled={total <= 1}
            hitSlop={4}
            style={({ pressed }) => [
              styles.delBtn,
              total <= 1 && { opacity: 0.35 },
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

      {pickerOpen && (
        <View style={styles.inlinePicker}>
          <View style={styles.searchRow}>
            <TextInput
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder="search activity"
              placeholderTextColor={tokens.ink4}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
          {filteredActivities.length === 0 ? (
            <Text style={styles.searchEmpty}>no match</Text>
          ) : (
            <View style={styles.pickerGrid}>
              {filteredActivities.map((k) => {
                const active = step.hkActivityKey === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => onSelectActivity(k)}
                    style={({ pressed }) => [
                      styles.pickerChip,
                      active && styles.pickerChipActive,
                      pressed && !active && { opacity: 0.7 },
                    ]}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.pickerChipLabel,
                        active && { color: tokens.bg },
                      ]}>
                      {fallbackLabelForHkActivity(k).toLowerCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
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

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 80,
  },

  saveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: tokens.ink,
  },
  saveBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
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
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    fontStyle: 'italic',
    textAlign: 'right',
    letterSpacing: 0.36,
  },

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
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  activityBtnOpen: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
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

  // Inline picker
  inlinePicker: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
  },
  searchRow: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink,
    paddingVertical: 0,
  },
  searchEmpty: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 14,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pickerChip: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  pickerChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  pickerChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink,
    letterSpacing: 0.21,
    textTransform: 'lowercase',
  },

  deleteBtn: {
    marginTop: 28,
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
  bottomHint: {
    marginTop: 16,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.38,
  },
});
