/**
 * Bottom drawer for logging or editing a workout. Dual-mode like the
 * weight + water drawers — pass an `entry` to enter edit mode with a
 * destructive delete action.
 *
 * Sections (composite model, #82):
 *   1. type   — chips per type in the live library
 *   2. start  — datetime field; end is derived from sum(steps)
 *   3. kcal   — optional, distributed across steps on save
 *   4. notes  — optional multiline, ≤200 chars (attached to first step)
 *
 * Create calls `logWorkout({ typeKey, startedAt, kcal, notes })` which
 * inserts N `workout_entries` + pushes N `saveWorkoutSample` calls.
 * Edit calls `updateWorkoutEntry` on the single tapped entry — sibling
 * steps in the same composite are untouched (same precedent as #59).
 */

import { useCallback, useEffect, useState } from 'react';
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
import { totalPlannedMinutes } from '@/src/db/queries/workout-types';
import type { WorkoutEntry } from '@/src/db/schema';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import { logWorkout } from '@/src/lib/healthkit/workouts';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimeField } from './datetime-field';
import { Drawer, DrawerSection } from './drawer';
import { PrimaryButton } from './primary-button';

const NOTES_MAX = 200;

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, drawer enters edit mode pre-filled from this entry. */
  entry?: WorkoutEntry | null;
};

export function WorkoutLogDrawer({ open, onClose, entry }: Props) {
  const mode: 'create' | 'edit' = entry ? 'edit' : 'create';
  const types = useWorkoutTypes();

  const [typeKey, setTypeKey] = useState<string>('');
  const [startedAt, setStartedAt] = useState<Date>(() => new Date());
  const [kcalText, setKcalText] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const typeDef = types.find((t) => t.key === typeKey) ?? null;
  const totalMin = typeDef ? totalPlannedMinutes(typeDef) : 0;

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (entry) {
      // Reverse-lookup: any type whose first step's HK activity matches.
      // Falls back to the first library entry — a workout from an unknown
      // sport still gets a sane default chip.
      const found = types.find((t) => t.steps.some((s) => s.hkActivityKey === entry.type));
      setTypeKey(found?.key ?? types[0]?.key ?? '');
      setStartedAt(entry.startedAt);
      setKcalText(entry.kcal != null ? Math.round(entry.kcal).toString() : '');
      setNotes(entry.notes ?? '');
    } else {
      // Default start = now − total planned duration of the seeded first
      // type. Lets a user "just finished" tap save without changing time.
      const def = types[0];
      const defaultMin = def ? totalPlannedMinutes(def) : 45;
      const start = new Date(Date.now() - defaultMin * 60_000);
      setTypeKey(def?.key ?? '');
      setStartedAt(start);
      setKcalText('');
      setNotes('');
    }
  }, [open, entry?.id, types]);

  const endedAt = new Date(startedAt.getTime() + totalMin * 60_000);
  const valid = typeDef !== null && totalMin > 0 && endedAt.getTime() <= Date.now();

  const handleSave = useCallback(() => {
    if (!valid || saving || !typeDef) return;
    setSaving(true);
    const kcalParsed = kcalText.trim() === '' ? null : Number.parseFloat(kcalText);
    const kcal = Number.isFinite(kcalParsed) ? kcalParsed : null;
    const trimmedNotes = notes.trim();

    const op =
      entry != null
        ? updateWorkoutEntry(entry.id, {
            // Edit keeps the entry's own HK activity if it matches a step;
            // otherwise we re-pin to the type's first step's activity so
            // the linker still sees a coherent type.
            type:
              typeDef.steps.find((s) => s.hkActivityKey === entry.type)?.hkActivityKey ??
              typeDef.steps[0].hkActivityKey,
            startedAt,
            endedAt,
            kcal,
            notes: trimmedNotes === '' ? null : trimmedNotes,
          })
        : logWorkout({
            typeKey,
            startedAt,
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
  }, [valid, saving, entry, typeKey, typeDef, startedAt, endedAt, kcalText, notes, onClose]);

  const handleDelete = useCallback(() => {
    if (saving || !entry || !typeDef) return;
    Alert.alert(
      'Delete workout?',
      `Remove this ${totalMin}-minute ${typeDef.label.toLowerCase()} session? This can't be undone.`,
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
  }, [saving, entry, totalMin, typeDef, onClose]);

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
              ? `save ${totalMin} min · ${typeDef!.label.toLowerCase()}`
              : 'pick a type + valid time'
          }
          onPress={handleSave}
          disabled={!valid || saving}
        />
      }>
      <DrawerSection label="type" marginTop={8}>
        <View style={styles.typeRow}>
          {types.map((t) => {
            const active = typeKey === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTypeKey(t.key)}
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
                  {t.key}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {typeDef && typeDef.steps.length > 1 && (
          <Text style={styles.stepBreakdown}>
            {typeDef.steps
              .map((s) => `${s.durationMin}m ${humanizeActivity(s.hkActivityKey)}`)
              .join(' · ')}
          </Text>
        )}
      </DrawerSection>

      <DrawerSection label="when">
        <DateTimeField
          value={startedAt}
          onChange={setStartedAt}
          label="start"
          title="Start"
          maximumDate={new Date()}
        />
        <Text
          style={[
            styles.durationLine,
            !valid && { color: tokens.warn },
          ]}>
          ends{' '}
          <Text style={[styles.durationValue, textStyles.tnum]}>
            {formatClock(endedAt)}
          </Text>
          <Text style={{ color: tokens.ink4 }}> · {formatDuration(totalMin)} total</Text>
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
        {typeDef && typeDef.steps.length > 1 && kcalText.trim() !== '' && (
          <Text style={styles.kcalSplitHint}>
            split across {typeDef.steps.length} steps proportional to duration
          </Text>
        )}
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

function formatClock(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function humanizeActivity(hkKey: string): string {
  // Drops camelCase to plain words. Keeps it short for the inline breakdown.
  return hkKey
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Type chips — flex-wrap so dynamic library size doesn't overflow.
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    flexGrow: 1,
    flexBasis: '18%',
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
  stepBreakdown: {
    marginTop: 8,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.38,
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
  kcalSplitHint: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.38,
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
