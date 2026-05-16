/**
 * Bottom drawer for logging or editing a workout. Dual-mode like the
 * weight + water drawers — pass an `entry` to enter edit mode with a
 * destructive delete action.
 *
 * Sections:
 *   1. type   — 5 chips (push / pull / legs / tennis / cardio)
 *   2. when   — start + end datetime fields, derived duration
 *   3. kcal   — optional decimal input
 *   4. notes  — optional multiline, ≤200 chars
 *
 * Create calls `logWorkout` (HK push opportunistic + UUID backfill).
 * Edit calls `updateWorkoutEntry` — no HK propagation in v1 per the
 * same precedent we set with weight (#59).
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

import {
  deleteWorkoutEntry,
  updateWorkoutEntry,
} from '@/src/db/queries/workouts';
import type { WorkoutEntry } from '@/src/db/schema';
import { logWorkout } from '@/src/lib/healthkit/workouts';
import {
  WORKOUT_TYPES,
  workoutTypeById,
  type WorkoutTypeId,
} from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimeField } from './datetime-field';
import { Drawer, DrawerSection } from './drawer';
import { PrimaryButton } from './primary-button';

const NOTES_MAX = 200;
const DEFAULT_DURATION_MIN = 45;

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, drawer enters edit mode pre-filled from this entry. */
  entry?: WorkoutEntry | null;
};

export function WorkoutLogDrawer({ open, onClose, entry }: Props) {
  const mode: 'create' | 'edit' = entry ? 'edit' : 'create';

  const [typeId, setTypeId] = useState<WorkoutTypeId>('push');
  const [startedAt, setStartedAt] = useState<Date>(() => new Date());
  const [endedAt, setEndedAt] = useState<Date>(() => new Date());
  const [kcalText, setKcalText] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (entry) {
      // Reverse-lookup the typeId from the stored HK activity key. Falls
      // back to 'push' if the HK key isn't in our library (e.g. a workout
      // imported from a sport we don't classify yet).
      const candidate = WORKOUT_TYPES.find((t) => t.hkActivityKey === entry.type);
      setTypeId(candidate?.id ?? 'push');
      setStartedAt(entry.startedAt);
      setEndedAt(entry.endedAt);
      setKcalText(entry.kcal != null ? Math.round(entry.kcal).toString() : '');
      setNotes(entry.notes ?? '');
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - DEFAULT_DURATION_MIN * 60_000);
      setTypeId('push');
      setStartedAt(start);
      setEndedAt(end);
      setKcalText('');
      setNotes('');
    }
  }, [open, entry?.id]);

  const durationMin = useMemo(() => {
    return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
  }, [startedAt, endedAt]);
  const valid = durationMin > 0 && endedAt.getTime() <= Date.now();

  const typeDef = workoutTypeById(typeId);

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);
    const kcalParsed = kcalText.trim() === '' ? null : Number.parseFloat(kcalText);
    const kcal = Number.isFinite(kcalParsed) ? kcalParsed : null;
    const trimmedNotes = notes.trim();

    const op =
      entry != null
        ? updateWorkoutEntry(entry.id, {
            type: typeDef.hkActivityKey,
            startedAt,
            endedAt,
            kcal,
            notes: trimmedNotes === '' ? null : trimmedNotes,
          })
        : logWorkout({
            typeId,
            startedAt,
            endedAt,
            kcal,
            notes: trimmedNotes === '' ? null : trimmedNotes,
          });
    op
      .then(() => onClose())
      .catch((err) => {
        Alert.alert(
          entry ? 'Could not save changes' : 'Could not log workout',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [valid, saving, entry, typeId, typeDef, startedAt, endedAt, kcalText, notes, onClose]);

  const handleDelete = useCallback(() => {
    if (saving || !entry) return;
    Alert.alert(
      'Delete workout?',
      `Remove this ${durationMin}-minute ${typeDef.label.toLowerCase()} session? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteWorkoutEntry(entry.id)
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
  }, [saving, entry, durationMin, typeDef, onClose]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker={mode === 'edit' ? 'WORKOUT · EDIT' : 'WORKOUT · LOG'}
      title={mode === 'edit' ? 'Edit workout' : 'Log workout'}
      cta={
        <PrimaryButton
          label={
            saving
              ? 'saving…'
              : mode === 'edit'
              ? 'save changes'
              : valid
              ? `save ${durationMin} min · ${typeDef.label.toLowerCase()}`
              : 'set start + end'
          }
          onPress={handleSave}
          disabled={!valid || saving}
        />
      }>
      <DrawerSection label="type" marginTop={8}>
        <View style={styles.typeRow}>
          {WORKOUT_TYPES.map((t) => {
            const active = typeId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTypeId(t.id)}
                style={({ pressed }) => [
                  styles.typeChip,
                  active && styles.typeChipActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.typeChipLabel,
                    active && { color: tokens.bg },
                  ]}>
                  {t.id}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </DrawerSection>

      <DrawerSection label="when">
        <DateTimeField
          value={startedAt}
          onChange={setStartedAt}
          label="start"
          title="Start"
          maximumDate={endedAt}
        />
        <View style={{ height: 8 }} />
        <DateTimeField
          value={endedAt}
          onChange={setEndedAt}
          label="end"
          title="End"
          minimumDate={startedAt}
          maximumDate={new Date()}
        />
        <Text
          style={[
            styles.durationLine,
            !valid && { color: tokens.warn },
          ]}>
          duration{' '}
          <Text style={[styles.durationValue, textStyles.tnum]}>
            {formatDuration(durationMin)}
          </Text>
          {!valid && endedAt.getTime() <= startedAt.getTime() && (
            <Text style={styles.durationWarn}> — end before start</Text>
          )}
          {!valid && endedAt.getTime() > Date.now() && (
            <Text style={styles.durationWarn}> — end is in the future</Text>
          )}
        </Text>
      </DrawerSection>

      <DrawerSection label="kcal · optional">
        <View style={styles.kcalRow}>
          <TextInput
            value={kcalText}
            onChangeText={(t) => setKcalText(sanitizeKcal(t))}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder="—"
            placeholderTextColor={tokens.ink4}
            maxLength={4}
            style={[styles.kcalInput, textStyles.tnum]}
          />
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>
      </DrawerSection>

      <DrawerSection label="notes · optional">
        <TextInput
          value={notes}
          onChangeText={(t) => setNotes(t.slice(0, NOTES_MAX))}
          multiline
          placeholder="e.g. heavy back squats, deload week"
          placeholderTextColor={tokens.ink4}
          style={styles.notesInput}
        />
        <Text style={styles.notesHint}>
          {notes.length}/{NOTES_MAX}
        </Text>
      </DrawerSection>

      {mode === 'edit' && (
        <Pressable
          onPress={handleDelete}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Delete this workout"
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && { opacity: 0.55 },
          ]}>
          <Text style={[styles.deleteText, textStyles.cap]}>delete</Text>
        </Pressable>
      )}

      <View style={{ height: 12 }} />
    </Drawer>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeKcal(s: string): string {
  // Whole-number kcal — strip everything non-digit. Cap by maxLength.
  return s.replace(/[^0-9]/g, '');
}

function formatDuration(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Type chips — 5 across, equal-width.
  typeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.1,
  },
  typeChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink,
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },

  durationLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    marginTop: 10,
    letterSpacing: 0.4,
  },
  durationValue: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  durationWarn: {
    color: tokens.warn,
    fontStyle: 'italic',
  },

  kcalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  kcalInput: {
    flex: 1,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.16,
    paddingVertical: 0,
  },
  kcalUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },

  notesInput: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 70,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokens.ink,
    textAlignVertical: 'top',
  },
  notesHint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 4,
    textAlign: 'right',
    letterSpacing: 0.36,
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
});
