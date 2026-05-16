/**
 * Bottom drawer for logging a sip of water / tea / coffee.
 *
 * Dual-mode:
 *   • create (default) — invokes `addWaterLog` on the queries layer.
 *   • edit — pass `sip`; the drawer pre-fills its fields and the CTA
 *     becomes `save changes`, with a destructive `delete sip` action.
 *
 * Re-seeds its internal state every time it opens so prior interactions
 * don't leak between sessions. The drawer doesn't store the result — the
 * live query in `useWaterToday` picks up the new / updated / deleted row
 * and the host screen re-renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { WaterKind, WaterLog, WaterPreferences } from '@/src/db/schema';
import { addWaterLog, deleteWaterLog, updateWaterLog } from '@/src/db/queries/water';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimeField } from './datetime-field';
import { Drawer, DrawerSection } from './drawer';
import { PrimaryButton } from './primary-button';

type QuickAmount = { ml: number; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Drives the four amount chips + their labels. */
  prefs: WaterPreferences;
  /**
   * When set, the drawer enters edit mode: pre-fills its fields from the
   * sip, swaps the CTA label, and reveals the delete action. When null /
   * omitted, the drawer creates a new sip.
   */
  sip?: WaterLog | null;
};

// Custom-slider range. Smaller than the smallest expected glass (sip), big
// enough for a 1L bottle without forcing the user into a numeric input.
const CUSTOM_MIN_ML = 100;
const CUSTOM_MAX_ML = 1000;
const CUSTOM_SNAP_ML = 50;
const CUSTOM_DEFAULT_ML = 500;
// Tick stops shown beneath the slider — visual reference points only.
const CUSTOM_TICKS = [100, 250, 500, 750, 1000];

export function WaterLogDrawer({ open, onClose, prefs, sip }: Props) {
  const mode: 'create' | 'edit' = sip ? 'edit' : 'create';

  const quickAmounts = useMemo<QuickAmount[]>(
    () => [
      { ml: prefs.quickAdd1Ml, label: prefs.quickAdd1Label },
      { ml: prefs.quickAdd2Ml, label: prefs.quickAdd2Label },
      { ml: prefs.quickAdd3Ml, label: prefs.quickAdd3Label },
      { ml: prefs.quickAdd4Ml, label: prefs.quickAdd4Label },
    ],
    [prefs],
  );

  // The drawer represents "what will be logged" as a single ml value. Tapping
  // a chip overwrites it; dragging the slider also overwrites it. We track
  // which mode the user landed on for chip highlighting.
  const [ml, setMl] = useState<number>(CUSTOM_DEFAULT_ML);
  const [kind, setKind] = useState<WaterKind>('water');
  const [at, setAt] = useState<Date>(() => new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (sip) {
      // Edit: pre-fill from the existing row.
      setMl(sip.ml);
      setKind(sip.kind);
      setAt(sip.at);
    } else {
      // Create: default to the 500ml chip (most common pour) so the slider
      // has a sane starting point even before the user taps.
      setMl(prefs.quickAdd3Ml || CUSTOM_DEFAULT_ML);
      setKind('water');
      setAt(new Date());
    }
    // sip identity is captured by `sip?.id` in the dep array — the same
    // row reopening (id unchanged) shouldn't re-seed and stomp user edits.
  }, [open, sip?.id, prefs.quickAdd3Ml]);

  const handleSave = useCallback(() => {
    if (saving || ml <= 0) return;
    setSaving(true);
    const op =
      sip != null
        ? updateWaterLog(sip.id, { ml, kind, at })
        : addWaterLog({ at, ml, kind });
    op
      .then(() => onClose())
      .catch((err) => {
        Alert.alert(
          sip ? 'Could not save changes' : 'Could not log sip',
          err instanceof Error ? err.message : String(err),
        );
        setSaving(false);
      });
  }, [saving, ml, kind, at, sip, onClose]);

  const handleDelete = useCallback(() => {
    if (saving || !sip) return;
    Alert.alert(
      'Delete sip?',
      `Remove the ${sip.ml} ml ${sip.kind} log? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            deleteWaterLog(sip.id)
              .then(() => onClose())
              .catch((err) => {
                Alert.alert(
                  'Could not delete sip',
                  err instanceof Error ? err.message : String(err),
                );
                setSaving(false);
              });
          },
        },
      ],
    );
  }, [saving, sip, onClose]);

  // Active chip = the one whose ml exactly matches current state. If the user
  // dragged the slider away from any chip's value, none is highlighted.
  const activeChipMl = quickAmounts.find((a) => a.ml === ml)?.ml ?? null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker={mode === 'edit' ? 'WATER · EDIT' : 'WATER · LOG'}
      title={mode === 'edit' ? 'Edit sip' : 'Log water'}
      cta={
        <PrimaryButton
          label={saving ? 'saving…' : mode === 'edit' ? 'save changes' : `add ${ml} ml`}
          onPress={handleSave}
          disabled={saving || ml <= 0}
        />
      }>
      <DrawerSection label="amount" marginTop={8}>
        <View style={styles.chipRow}>
          {quickAmounts.map((amt) => {
            const active = activeChipMl === amt.ml;
            return (
              <Pressable
                key={`${amt.ml}-${amt.label}`}
                onPress={() => setMl(amt.ml)}
                style={({ pressed }) => [
                  styles.amountChip,
                  active && styles.amountChipActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <View style={styles.amountChipValueRow}>
                  <Text
                    style={[
                      styles.amountChipValue,
                      textStyles.tnum,
                      active && styles.amountChipValueActive,
                    ]}>
                    {amt.ml}
                  </Text>
                  <Text style={[styles.amountChipUnit, active && styles.amountChipUnitActive]}>
                    ml
                  </Text>
                </View>
                <Text style={[styles.amountChipSub, textStyles.cap, active && styles.amountChipSubActive]}>
                  {amt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <CustomSlider value={ml} onChange={setMl} />
      </DrawerSection>

      <DrawerSection label="kind">
        <View style={styles.kindRow}>
          {(['water', 'tea', 'coffee'] as const).map((id) => {
            const active = kind === id;
            return (
              <Pressable
                key={id}
                onPress={() => setKind(id)}
                style={({ pressed }) => [
                  styles.kindChip,
                  active && styles.kindChipActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[styles.kindChipLabel, active && styles.kindChipLabelActive]}>
                  {id}
                </Text>
              </Pressable>
            );
          })}
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
          accessibilityLabel="Delete this sip"
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && { opacity: 0.55 },
          ]}>
          <Text style={[styles.deleteText, textStyles.cap]}>delete sip</Text>
        </Pressable>
      )}

      <View style={{ height: 12 }} />
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomSlider — drag a horizontal handle, snaps to 50ml increments.
// ─────────────────────────────────────────────────────────────────────────────
function CustomSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const widthRef = useRef(0);
  const startValueRef = useRef(value);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const clamp = (v: number) => Math.min(Math.max(v, CUSTOM_MIN_ML), CUSTOM_MAX_ML);
  const snap = (v: number) => Math.round(v / CUSTOM_SNAP_ML) * CUSTOM_SNAP_ML;

  const pan = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-3, 3])
      .failOffsetY([-12, 12])
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        startValueRef.current = value;
      })
      .onUpdate((e) => {
        if (widthRef.current === 0) return;
        const range = CUSTOM_MAX_ML - CUSTOM_MIN_ML;
        const deltaMl = (e.translationX / widthRef.current) * range;
        const next = clamp(snap(startValueRef.current + deltaMl));
        if (next !== value) onChange(next);
      })
      .runOnJS(true);
  }, [value, onChange]);

  // Tap-anywhere-on-track: also handy on devices where the handle is small.
  const tap = useMemo(() => {
    return Gesture.Tap().onEnd((e) => {
      if (widthRef.current === 0) return;
      const range = CUSTOM_MAX_ML - CUSTOM_MIN_ML;
      const pct = Math.min(Math.max(e.x / widthRef.current, 0), 1);
      const next = clamp(snap(CUSTOM_MIN_ML + pct * range));
      onChange(next);
    }).runOnJS(true);
  }, [onChange]);

  const composed = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  const pct = (value - CUSTOM_MIN_ML) / (CUSTOM_MAX_ML - CUSTOM_MIN_ML);

  return (
    <View style={styles.customCard}>
      <View style={styles.customHeader}>
        <Text style={[styles.customLabel, textStyles.cap]}>custom</Text>
        <View style={styles.customValueRow}>
          <Text style={[styles.customValue, textStyles.tnum]}>{value}</Text>
          <Text style={styles.customUnit}>ml</Text>
        </View>
      </View>

      <GestureDetector gesture={composed}>
        <View style={styles.trackHitArea}>
          <View style={styles.track} onLayout={onLayout}>
            <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
            <View
              pointerEvents="none"
              style={[styles.trackHandle, { left: `${pct * 100}%` }]}
            />
          </View>
        </View>
      </GestureDetector>

      <View style={styles.tickRow}>
        {CUSTOM_TICKS.map((t) => (
          <Text
            key={t}
            style={[
              styles.tickText,
              t === value && styles.tickTextActive,
            ]}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Amount ───────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  amountChip: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 3,
  },
  amountChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.1,
  },
  amountChipValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  amountChipValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 17,
    color: tokens.ink,
    letterSpacing: -0.17,
  },
  amountChipValueActive: {
    color: tokens.bg,
  },
  amountChipUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
  },
  amountChipUnitActive: {
    color: tokens.bg,
    opacity: 0.7,
  },
  amountChipSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  amountChipSubActive: {
    color: tokens.bg,
    opacity: 0.6,
  },

  // ── Custom slider ────────────────────────────────────────────────
  customCard: {
    marginTop: 10,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  customHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  customLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },
  customValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  customValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 15,
    color: tokens.ink,
  },
  customUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
  },
  // Larger vertical hit area than the visible track so dragging stays usable
  // with thumb-sized fingers; the visible track is still only 4px tall.
  trackHitArea: {
    paddingVertical: 10,
  },
  track: {
    position: 'relative',
    height: 4,
    backgroundColor: tokens.bg2,
    borderRadius: 4,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: tokens.ink,
    borderRadius: 4,
  },
  trackHandle: {
    position: 'absolute',
    top: -5,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: tokens.card,
    borderWidth: 2,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.1,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tickText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 0.44,
  },
  tickTextActive: {
    color: tokens.ink,
    fontFamily: fonts.monoSemibold,
  },

  // ── Kind ─────────────────────────────────────────────────────────
  kindRow: {
    flexDirection: 'row',
    gap: 6,
  },
  kindChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 2,
  },
  kindChipActive: {
    backgroundColor: tokens.bg2,
    borderColor: tokens.line2,
  },
  kindChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
    textTransform: 'lowercase',
  },
  kindChipLabelActive: {
    color: tokens.ink,
  },

  // ── Delete (edit mode only) ──────────────────────────────────────
  deleteBtn: {
    marginTop: 22,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  deleteText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.accentInk,
    letterSpacing: 1.92,
  },
});
