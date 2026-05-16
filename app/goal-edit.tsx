/**
 * Goal editor (Slice 6).
 *
 * Route: /goal-edit (create new active goal) or /goal-edit?id=N
 * (edit existing). Only one goal is `isActive` at a time — saving
 * here clears the active flag on every other row.
 *
 * Sections:
 *   1. Kind — cut / maintain / bulk chips.
 *   2. Target weight (optional, kg).
 *   3. Start date (defaults to today).
 *   4. End date (optional — open-ended goal when blank).
 *   5. Notes (optional).
 *
 * Save → upsert + mark active. The 'end goal' affordance lives at
 * the bottom in edit mode.
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

import { DateTimeField, SubHeader } from '@/components/design';
import {
  addGoal,
  endGoal,
  getGoalById,
  updateGoal,
  type GoalKind,
} from '@/src/db/queries/goals';
import type { Goal } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const NOTES_MAX = 200;
const KINDS: ReadonlyArray<GoalKind> = ['cut', 'maintain', 'bulk'];
const KIND_LABEL: Record<GoalKind, string> = {
  cut: 'cut',
  maintain: 'maintain',
  bulk: 'bulk',
};
const KIND_SUB: Record<GoalKind, string> = {
  cut: 'lose weight',
  maintain: 'hold steady',
  bulk: 'gain weight',
};

export default function GoalEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const numericId =
    typeof id === 'string' && id !== '' ? Number(id) : null;
  const mode: 'create' | 'edit' =
    numericId !== null && Number.isFinite(numericId) ? 'edit' : 'create';

  const [kind, setKind] = useState<GoalKind>('cut');
  const [targetKgText, setTargetKgText] = useState('');
  const [startedAt, setStartedAt] = useState<Date>(() => new Date());
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (mode === 'create') {
      setHydrated(true);
      return;
    }
    getGoalById(numericId!)
      .then((row) => {
        if (!row) {
          Alert.alert('Goal not found', 'It may have been deleted.');
          router.back();
          return;
        }
        hydrateFrom(row);
        setHydrated(true);
      })
      .catch((err) => {
        Alert.alert(
          'Could not load',
          err instanceof Error ? err.message : String(err),
        );
        router.back();
      });

    function hydrateFrom(g: Goal) {
      setKind(g.kind);
      setTargetKgText(g.targetKg === null ? '' : formatKg(g.targetKg));
      setStartedAt(g.startedAt);
      setEndsAt(g.endsAt);
      setNotes(g.notes ?? '');
    }
  }, [mode, numericId, hydrated, router]);

  const targetKg = useMemo(() => parseKg(targetKgText), [targetKgText]);
  const datesValid = endsAt === null || endsAt.getTime() > startedAt.getTime();
  const valid = datesValid && hydrated;

  const handleSave = useCallback(() => {
    if (!valid || saving) return;
    setSaving(true);
    const trimmedNotes = notes.trim();
    const payload = {
      kind,
      targetKg,
      startedAt,
      endsAt,
      notes: trimmedNotes === '' ? null : trimmedNotes,
      isActive: true,
    };
    const op =
      mode === 'edit' && numericId !== null
        ? updateGoal(numericId, payload)
        : addGoal(payload);
    op
      .then(() => router.back())
      .catch((err) => {
        Alert.alert(
          mode === 'edit' ? 'Could not save goal' : 'Could not create goal',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [
    valid,
    saving,
    mode,
    numericId,
    kind,
    targetKg,
    startedAt,
    endsAt,
    notes,
    router,
  ]);

  const handleEnd = useCallback(() => {
    if (mode !== 'edit' || numericId === null) return;
    Alert.alert(
      'End this goal?',
      "Stops tracking it as the active goal. The row stays in your history.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End goal',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            endGoal(numericId)
              .then(() => router.back())
              .catch((err) => {
                Alert.alert(
                  'Could not end goal',
                  err instanceof Error ? err.message : String(err),
                );
                setSaving(false);
              });
          },
        },
      ],
    );
  }, [mode, numericId, router]);

  if (mode === 'edit' && !hydrated) {
    return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <SubHeader
          title={mode === 'edit' ? 'Edit goal' : 'New goal'}
          back="Home"
          onBack={() => router.back()}
          trailing={
            <Pressable
              onPress={handleSave}
              disabled={!valid || saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save goal"
              style={({ pressed }) => [
                (!valid || saving) && { opacity: 0.35 },
                pressed && valid && !saving && { opacity: 0.7 },
              ]}>
              <Text style={[styles.saveLink, textStyles.cap]}>
                {saving ? 'saving' : 'save'}
              </Text>
            </Pressable>
          }
        />

        {/* KIND */}
        <Section label="kind">
          <View style={styles.kindRow}>
            {KINDS.map((k) => {
              const active = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  accessibilityRole="button"
                  accessibilityLabel={`Goal kind ${k}`}
                  style={({ pressed }) => [
                    styles.kindChip,
                    active && styles.kindChipActive,
                    pressed && !active && { opacity: 0.65 },
                  ]}>
                  <Text
                    style={[
                      styles.kindLabel,
                      textStyles.cap,
                      active && { color: tokens.bg },
                    ]}>
                    {KIND_LABEL[k]}
                  </Text>
                  <Text
                    style={[
                      styles.kindSub,
                      active && { color: tokens.bg, opacity: 0.6 },
                    ]}>
                    {KIND_SUB[k]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* TARGET WEIGHT */}
        <Section
          label="target weight"
          sub={kind === 'maintain' ? 'optional' : 'optional · kg'}>
          <View style={styles.inputCard}>
            <TextInput
              value={targetKgText}
              onChangeText={(t) => setTargetKgText(sanitizeDecimal(t))}
              keyboardType="decimal-pad"
              placeholder="e.g. 75"
              placeholderTextColor={tokens.ink4}
              maxLength={5}
              style={[styles.inputBig, textStyles.tnum]}
            />
            <Text style={styles.inputUnit}>kg</Text>
          </View>
        </Section>

        {/* DATES */}
        <Section label="start date">
          <DateTimeField
            value={startedAt}
            onChange={setStartedAt}
            mode="date"
            label="started"
            title="Goal start"
            maximumDate={new Date()}
          />
        </Section>

        <Section
          label="end date"
          sub={endsAt === null ? 'open-ended' : undefined}>
          {endsAt === null ? (
            <Pressable
              onPress={() => {
                // Default to ~28 days out — a typical cut / mini-bulk.
                const def = new Date(startedAt);
                def.setDate(def.getDate() + 28);
                setEndsAt(def);
              }}
              accessibilityRole="button"
              accessibilityLabel="Set end date"
              style={({ pressed }) => [
                styles.endDashed,
                pressed && { opacity: 0.55 },
              ]}>
              <Text style={[styles.endDashedText, textStyles.cap]}>
                + set end date
              </Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              <DateTimeField
                value={endsAt}
                onChange={setEndsAt}
                mode="date"
                label="ends"
                title="Goal end"
                minimumDate={startedAt}
              />
              <Pressable
                onPress={() => setEndsAt(null)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Make goal open-ended"
                style={({ pressed }) => [
                  styles.openEndedBtn,
                  pressed && { opacity: 0.55 },
                ]}>
                <Text style={[styles.openEndedText, textStyles.cap]}>
                  make open-ended
                </Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* NOTES */}
        <Section label="notes · optional">
          <TextInput
            value={notes}
            onChangeText={(t) => setNotes(t.slice(0, NOTES_MAX))}
            multiline
            placeholder="e.g. cut for summer, dad-bod retreat"
            placeholderTextColor={tokens.ink4}
            style={styles.notesInput}
          />
          <Text style={styles.notesHint}>
            {notes.length}/{NOTES_MAX}
          </Text>
        </Section>

        {!datesValid && (
          <Text style={styles.errHint}>end date must be after start</Text>
        )}

        {mode === 'edit' && (
          <Pressable
            onPress={handleEnd}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="End this goal"
            style={({ pressed }) => [
              styles.endBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Text style={[styles.endText, textStyles.cap]}>end goal</Text>
          </Pressable>
        )}

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

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
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function sanitizeDecimal(s: string): string {
  const normalised = s.replace(',', '.');
  let seenDot = false;
  let out = '';
  for (const ch of normalised) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenDot) {
      out += '.';
      seenDot = true;
    }
  }
  return out;
}
function parseKg(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
function formatKg(kg: number): string {
  if (Number.isInteger(kg)) return kg.toString();
  return (Math.round(kg * 10) / 10).toString();
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 80,
  },
  saveLink: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 2.2,
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
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  kindRow: {
    flexDirection: 'row',
    gap: 6,
  },
  kindChip: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 4,
  },
  kindChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  kindLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 1.92,
  },
  kindSub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

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
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.44,
    paddingVertical: 0,
  },
  inputUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },

  endDashed: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.line2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  endDashedText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },
  openEndedBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  openEndedText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.accentInk,
    letterSpacing: 1.8,
  },

  notesInput: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
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
    fontSize: 10,
    color: tokens.ink4,
    marginTop: 4,
    textAlign: 'right',
    letterSpacing: 0.4,
  },

  errHint: {
    marginTop: 16,
    marginHorizontal: 22,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.warn,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },

  endBtn: {
    marginTop: 28,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  endText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 1.92,
  },
});
