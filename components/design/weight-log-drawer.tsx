/**
 * Bottom drawer for logging or editing a weigh-in.
 *
 * Dual-mode:
 *   • create — invokes `logWeight` (which addWeightEntry + pushes to HK
 *     opportunistically per #50).
 *   • edit — pass `entry`; pre-fills + swaps the CTA to "save changes"
 *     with a destructive delete. Edits don't propagate back to HK in v1;
 *     see #59 for the follow-up.
 *
 * Weight input: text field (decimal-pad keyboard) flanked by ±0.1 kg
 * steppers. Range 30–300 kg. The text state is the source of truth;
 * `kg` parses on the fly, and the CTA disables while invalid.
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
  deleteWeightEntry,
  updateWeightEntry,
} from '@/src/db/queries/weight';
import type { WeightEntry } from '@/src/db/schema';
import { logWeight } from '@/src/lib/healthkit/weight';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimeField } from './datetime-field';
import { Drawer, DrawerSection } from './drawer';
import { PrimaryButton } from './primary-button';

const KG_MIN = 30;
const KG_MAX = 300;
const KG_STEP = 0.1;
const KG_DEFAULT_FALLBACK = 70;

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, drawer enters edit mode pre-filled from this entry. */
  entry?: WeightEntry | null;
  /**
   * Seed value when there's no existing entry yet — usually the most
   * recent weigh-in's kg. Drives the create-mode default so the user
   * starts near where they were last time.
   */
  seedKg?: number | null;
};

export function WeightLogDrawer({ open, onClose, entry, seedKg }: Props) {
  const mode: 'create' | 'edit' = entry ? 'edit' : 'create';

  const [kgText, setKgText] = useState<string>('');
  const [at, setAt] = useState<Date>(() => new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (entry) {
      setKgText(entry.kg.toFixed(1));
      setAt(entry.at);
    } else {
      const seed = seedKg ?? KG_DEFAULT_FALLBACK;
      setKgText(seed.toFixed(1));
      setAt(new Date());
    }
    // re-seed when the slot (entry id) or open transition changes
  }, [open, entry?.id, seedKg]);

  const parsedKg = useMemo(() => parseFloat(kgText), [kgText]);
  const kgValid =
    Number.isFinite(parsedKg) && parsedKg >= KG_MIN && parsedKg <= KG_MAX;

  const clamp = (n: number) =>
    Math.min(KG_MAX, Math.max(KG_MIN, Math.round(n * 10) / 10));

  const onStep = useCallback(
    (delta: number) => {
      const base = Number.isFinite(parsedKg) ? parsedKg : KG_DEFAULT_FALLBACK;
      const next = clamp(base + delta);
      setKgText(next.toFixed(1));
    },
    [parsedKg],
  );

  const handleSave = useCallback(() => {
    if (!kgValid || saving) return;
    setSaving(true);
    const kg = clamp(parsedKg);

    const op =
      entry != null
        ? updateWeightEntry(entry.id, { kg, at })
        : // logWeight = addWeightEntry + opportunistic HK push.
          logWeight({ kg, at });
    op
      .then(() => onClose())
      .catch((err) => {
        Alert.alert(
          entry ? 'Could not save changes' : 'Could not log weigh-in',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [kgValid, saving, parsedKg, entry, at, onClose]);

  const handleDelete = useCallback(() => {
    if (saving || !entry) return;
    Alert.alert(
      'Delete weigh-in?',
      `Remove the ${entry.kg.toFixed(1)} kg entry from ${formatRowDate(entry.at)}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteWeightEntry(entry.id)
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
  }, [saving, entry, onClose]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker={mode === 'edit' ? 'WEIGHT · EDIT' : 'WEIGHT · LOG'}
      title={mode === 'edit' ? 'Edit weigh-in' : 'Weigh-in'}
      cta={
        <PrimaryButton
          label={
            saving
              ? 'saving…'
              : mode === 'edit'
              ? 'save changes'
              : kgValid
              ? `save ${parsedKg.toFixed(1)} kg`
              : 'enter a weight'
          }
          onPress={handleSave}
          disabled={!kgValid || saving}
        />
      }>
      <DrawerSection label="weight" marginTop={8}>
        <View style={styles.weightCard}>
          <StepperButton label="−" onPress={() => onStep(-KG_STEP)} disabled={!kgValid} />
          <View style={styles.weightCenter}>
            <View style={styles.weightValueRow}>
              <TextInput
                value={kgText}
                onChangeText={(t) => setKgText(sanitize(t))}
                onEndEditing={() => {
                  if (!Number.isFinite(parsedKg)) {
                    // Invalid input — restore last known good value.
                    setKgText((seedKg ?? KG_DEFAULT_FALLBACK).toFixed(1));
                    return;
                  }
                  setKgText(clamp(parsedKg).toFixed(1));
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                maxLength={5}
                style={[styles.weightValue, textStyles.tnum]}
              />
              <Text style={styles.weightUnit}>kg</Text>
            </View>
            <Text style={styles.weightHint}>steps of 0.1 kg</Text>
          </View>
          <StepperButton label="+" onPress={() => onStep(KG_STEP)} disabled={!kgValid} />
        </View>
      </DrawerSection>

      <DrawerSection label="when">
        <DateTimeField
          value={at}
          onChange={setAt}
          title="When"
          maximumDate={new Date()}
        />
      </DrawerSection>

      {mode === 'edit' && (
        <Pressable
          onPress={handleDelete}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Delete this weigh-in"
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

// ─── Pieces ────────────────────────────────────────────────────────────────

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
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepperBtn,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.6 },
      ]}>
      <Text style={styles.stepperLabel}>{label}</Text>
    </Pressable>
  );
}

/** Strip everything that isn't a digit or a decimal point. */
function sanitize(s: string): string {
  let kept = '';
  let sawDot = false;
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      kept += ch;
    } else if ((ch === '.' || ch === ',') && !sawDot) {
      // Accept both comma and dot (European keyboard) — normalize to dot.
      kept += '.';
      sawDot = true;
    }
  }
  return kept;
}

function formatRowDate(d: Date): string {
  return d.toLocaleDateString('en', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).toLowerCase();
}

const styles = StyleSheet.create({
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
    minWidth: 88,
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
