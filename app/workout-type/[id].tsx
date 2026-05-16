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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

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

/**
 * Approximate height of a collapsed step row including the inter-row gap.
 * Used by the drag-reorder math to compute how many slots a drag has
 * crossed. Doesn't need to be exact — `Math.round` rounds away small
 * mismatches, and rows snap into place on release.
 */
const ROW_HEIGHT = 116;

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
  /**
   * Key is always derived from the name — the user doesn't manage it.
   * Computed at save time via `slugifyKey(trimmedName)`. Edit mode keeps
   * the existing key stable unless the user changes the name; this
   * avoids breaking links from workout_preferences if a key change isn't
   * intentional.
   */
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

  const trimmedName = name.trim();
  // In create mode the key derives from the typed name. In edit mode the
  // existing key stays unless the name actually changed — protects
  // workout_preferences references from accidental rename.
  const derivedKey = useMemo(() => {
    if (!isCreate && type && type.label === trimmedName) return type.key;
    return slugifyKey(trimmedName);
  }, [isCreate, type, trimmedName]);
  const keyConflict = useMemo(() => {
    if (derivedKey === '') return false;
    return types.some((t) => t.key === derivedKey && t.id !== type?.id);
  }, [derivedKey, types, type?.id]);
  const totalMin = useMemo(
    () => steps.reduce((a, s) => a + s.durationMin, 0),
    [steps],
  );
  const valid =
    trimmedName.length > 0 &&
    derivedKey.length > 0 &&
    !keyConflict &&
    steps.length > 0;

  // ─── Step editing ────────────────────────────────────────────────────────

  const updateStep = (stepId: string, patch: Partial<StepDraft>) =>
    setSteps((prev) =>
      prev.map((s) => (s.tempId === stepId ? { ...s, ...patch } : s)),
    );

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

  // ─── Drag reorder ────────────────────────────────────────────────────────
  // Hand-rolled with Reanimated worklets — no extra dep, no nested
  // scrollable conflict with the page's outer ScrollView.
  //
  // Per-frame state lives in two shared values: which row index is being
  // dragged (-1 when idle) and how far the finger has moved. Each row's
  // `useAnimatedStyle` derives its own transform from those two values:
  // the active row tracks the finger; other rows shift by ROW_HEIGHT
  // when the active row crosses their position.
  const draggingIndex = useSharedValue<number>(-1);
  const dragTranslateY = useSharedValue<number>(0);

  const commitReorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    setSteps((prev) => {
      if (from < 0 || from >= prev.length) return prev;
      const clamped = Math.max(0, Math.min(prev.length - 1, to));
      if (from === clamped) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(clamped, 0, moved);
      return copy;
    });
  }, []);

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
              key: derivedKey,
              label: trimmedName,
              tone,
              icon,
            });
            await replaceWorkoutTypeSteps(type.id, stepInputs);
          })()
        : createWorkoutType({
            key: derivedKey,
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
  }, [valid, saving, type, derivedKey, trimmedName, tone, icon, steps, router]);

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
        automaticallyAdjustsScrollIndicatorInsets
        showsVerticalScrollIndicator={false}>
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

        {/* NAME */}
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
          {keyConflict && (
            <Text style={styles.errorText}>
              a type with that name already exists
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
                draggingIndex={draggingIndex}
                dragTranslateY={dragTranslateY}
                onChangeDuration={(d) => updateStep(s.tempId, { durationMin: d })}
                onTogglePicker={() => togglePicker(s.tempId)}
                onSearchChange={setPickerSearch}
                onSelectActivity={(key) => onSelectActivity(s.tempId, key)}
                onDelete={() => deleteStep(s.tempId)}
                onCommitReorder={commitReorder}
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
  draggingIndex,
  dragTranslateY,
  onChangeDuration,
  onTogglePicker,
  onSearchChange,
  onSelectActivity,
  onDelete,
  onCommitReorder,
}: {
  index: number;
  total: number;
  step: StepDraft;
  pickerOpen: boolean;
  searchValue: string;
  filteredActivities: ReadonlyArray<string>;
  draggingIndex: SharedValue<number>;
  dragTranslateY: SharedValue<number>;
  onChangeDuration: (d: number) => void;
  onTogglePicker: () => void;
  onSearchChange: (s: string) => void;
  onSelectActivity: (key: string) => void;
  onDelete: () => void;
  onCommitReorder: (from: number, to: number) => void;
}) {
  const decrement = () =>
    onChangeDuration(Math.max(DURATION_MIN, step.durationMin - DURATION_STEP));
  const increment = () =>
    onChangeDuration(Math.min(DURATION_MAX, step.durationMin + DURATION_STEP));
  const canDelete = total > 1;
  const canDrag = total > 1 && !pickerOpen;

  /**
   * Row's animated transform. Two cases:
   *  - This row IS the active drag → translate by the finger delta + lift
   *    visually (scale + elevated z-index so it floats over neighbours).
   *  - Another row IS active → if the active row has crossed this row's
   *    position, shift this row up/down by ROW_HEIGHT to make room.
   *
   * Runs on the UI thread (worklet) so it doesn't bounce through JS on
   * every frame.
   */
  const animatedStyle = useAnimatedStyle(() => {
    const from = draggingIndex.value;
    if (from === index) {
      return {
        transform: [{ translateY: dragTranslateY.value }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 6,
        shadowOpacity: 0.18,
      };
    }
    if (from < 0) {
      return { transform: [{ translateY: 0 }], zIndex: 1 };
    }
    // Number of slots the active row has displaced.
    const shifted = Math.round(dragTranslateY.value / ROW_HEIGHT);
    if (shifted > 0 && index > from && index <= from + shifted) {
      return { transform: [{ translateY: -ROW_HEIGHT }], zIndex: 1 };
    }
    if (shifted < 0 && index < from && index >= from + shifted) {
      return { transform: [{ translateY: ROW_HEIGHT }], zIndex: 1 };
    }
    return { transform: [{ translateY: 0 }], zIndex: 1 };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canDrag)
        .activateAfterLongPress(220)
        .onStart(() => {
          draggingIndex.value = index;
          dragTranslateY.value = 0;
        })
        .onUpdate((e) => {
          dragTranslateY.value = e.translationY;
        })
        .onEnd(() => {
          const shifted = Math.round(dragTranslateY.value / ROW_HEIGHT);
          const target = index + shifted;
          // Reset visuals first so the new order doesn't render with a
          // stale offset still applied to the moved row.
          draggingIndex.value = -1;
          dragTranslateY.value = withSpring(0, { damping: 22, stiffness: 220 });
          if (shifted !== 0) runOnJS(onCommitReorder)(index, target);
        })
        .onFinalize(() => {
          // Covers the cancellation case (interrupted gesture, app blur).
          if (draggingIndex.value === index) {
            draggingIndex.value = -1;
            dragTranslateY.value = 0;
          }
        }),
    // index changes on reorder; the gesture needs to know its current row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, canDrag, onCommitReorder],
  );

  return (
    <Animated.View style={[styles.stepRow, animatedStyle]}>
      <View style={styles.stepHeadRow}>
        <GestureDetector gesture={pan}>
          <View
            accessibilityLabel="Drag to reorder"
            style={[
              styles.dragHandle,
              !canDrag && { opacity: 0.25 },
            ]}>
            <DragGripIcon />
          </View>
        </GestureDetector>
        <Pressable
          onPress={onTogglePicker}
          accessibilityRole="button"
          accessibilityLabel="Pick activity"
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
      </View>

      <View style={styles.stepFootRow}>
        <View style={styles.durRow}>
          <Pressable
            onPress={decrement}
            disabled={step.durationMin <= DURATION_MIN}
            hitSlop={6}
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
            hitSlop={6}
            style={({ pressed }) => [
              styles.durStepBtn,
              step.durationMin >= DURATION_MAX && { opacity: 0.35 },
              pressed && { opacity: 0.6 },
            ]}>
            <Text style={styles.durStepLabel}>+</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={onDelete}
          disabled={!canDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove step"
          style={({ pressed }) => [
            styles.delLink,
            !canDelete && { opacity: 0.3 },
            pressed && canDelete && { opacity: 0.55 },
          ]}>
          <Text style={[styles.delLinkText, textStyles.cap]}>remove</Text>
        </Pressable>
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
    </Animated.View>
  );
}

// ─── Drag grip icon — 6-dot vertical handle, classic reorder affordance. ─────
function DragGripIcon() {
  const dot = (cx: number, cy: number) => (
    <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} fill={tokens.ink4} />
  );
  return (
    <Svg width={12} height={18} viewBox="0 0 12 18">
      {dot(4, 4)}
      {dot(8, 4)}
      {dot(4, 9)}
      {dot(8, 9)}
      {dot(4, 14)}
      {dot(8, 14)}
    </Svg>
  );
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
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    fontStyle: 'italic',
    textAlign: 'right',
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
  errorText: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.warn,
    fontStyle: 'italic',
    letterSpacing: 0.48,
  },

  // Tone + icon chips
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    paddingVertical: 11,
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
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 0.48,
  },
  toneSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },

  iconGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  iconTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 7,
  },
  iconTileActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  iconLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 0.48,
  },

  // Steps
  stepList: {
    gap: 8,
  },
  stepRow: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
    gap: 12,
    // Shadow values that the animated style nudges up while dragging so
    // the lifted card visually separates from neighbours.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0,
  },
  stepHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dragHandle: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  activityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bg2,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 6,
  },
  activityBtnOpen: {
    backgroundColor: tokens.ink,
  },
  activityLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  stepFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durStepBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durStepLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
  },
  durValue: {
    minWidth: 48,
    textAlign: 'center',
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.07,
  },
  delLink: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  delLinkText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  addStepBtn: {
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
  addStepText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },

  // Inline picker
  inlinePicker: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
  },
  searchRow: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  searchInput: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink,
    paddingVertical: 0,
  },
  searchEmpty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pickerChip: {
    flexGrow: 1,
    flexBasis: '48%',
    paddingVertical: 11,
    paddingHorizontal: 10,
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
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: 0.26,
    textTransform: 'lowercase',
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
  bottomHint: {
    marginTop: 16,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.38,
  },
});
