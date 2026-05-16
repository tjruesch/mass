/**
 * Bottom drawer for editing one weekday's planned workout slot — port of
 * designs/screen-workouts-plan.jsx. Opens from a weekday row tap on
 * /workouts-settings.
 *
 * Sections:
 *   1. type        — 3×2 grid (push/pull/legs/tennis/cardio/rest) +
 *                    dashed "new type" CTA (stub for #72)
 *   2. type-info   — selected type card with icon, name, AH pill, subline
 *   3. time        — big HH:MM display + morning/afternoon/evening chips
 *   4. duration    — drag slider 15-120m + tap chips at 15/30/45/60/90/120
 *   5. repeats     — every <weekday> vs this week only (one-off disabled
 *                    until the data model lands)
 *
 * State is local while open; the sticky `plan <weekday>` CTA commits
 * the patch to the parent in one shot. Cancel/dismiss discards.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

import { DateTimePickerSheet } from './datetime-picker-sheet';
import { Drawer, DrawerSection } from './drawer';
import { Glyph } from './glyph';
import {
  WORKOUT_TYPES,
  workoutTypeById,
  type WorkoutTypeDef,
  type WorkoutTypeId,
  type WorkoutTypeTone,
} from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// All slots include a "rest" tile that maps to a null type.
type SlotChoice = WorkoutTypeId | 'rest';
const REST: SlotChoice = 'rest';

// Duration bounds in minutes — matches the design's chip row.
const DURATION_MIN = 15;
const DURATION_MAX = 120;
const DURATION_STEP = 5;
const DURATION_CHIPS = [15, 30, 45, 60, 90, 120] as const;
const DEFAULT_DURATION = 60;

// Time presets — morning / afternoon / evening shortcuts.
const TIME_PRESETS = [
  { key: 'morning', label: 'morning', min: 8 * 60 },
  { key: 'afternoon', label: 'afternoon', min: 12 * 60 + 30 },
  { key: 'evening', label: 'evening', min: 18 * 60 },
] as const;

export type PlanDayPatch = {
  typeId: WorkoutTypeId | null;
  timeMin: number | null;
  durationMin: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Long weekday name ("monday"...). Drives the title + CTA copy. */
  weekdayLong: string | null;
  /** Initial values for the slot when opening; ignored after open. */
  initialType: WorkoutTypeId | null;
  initialTimeMin: number | null;
  initialDurationMin: number | null;
  onCommit: (patch: PlanDayPatch) => void;
};

export function PlanDayDrawer({
  open,
  onClose,
  weekdayLong,
  initialType,
  initialTimeMin,
  initialDurationMin,
  onCommit,
}: Props) {
  const [choice, setChoice] = useState<SlotChoice>(initialType ?? REST);
  const [timeMin, setTimeMin] = useState<number>(initialTimeMin ?? TIME_PRESETS[2].min);
  const [hasTime, setHasTime] = useState<boolean>(initialTimeMin !== null);
  const [durationMin, setDurationMin] = useState<number>(initialDurationMin ?? DEFAULT_DURATION);
  const [hasDuration, setHasDuration] = useState<boolean>(initialDurationMin !== null);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);

  // Reset every time the drawer reopens for a (possibly different) slot.
  useEffect(() => {
    if (!open) return;
    setChoice(initialType ?? REST);
    setTimeMin(initialTimeMin ?? TIME_PRESETS[2].min);
    setHasTime(initialTimeMin !== null);
    setDurationMin(initialDurationMin ?? DEFAULT_DURATION);
    setHasDuration(initialDurationMin !== null);
    setTimeSheetOpen(false);
  }, [open, initialType, initialTimeMin, initialDurationMin]);

  const isRest = choice === REST;
  // Narrow the union to a real WorkoutTypeId for lookups + commit. The
  // REST sentinel is a sibling, not a member of WorkoutTypeId.
  const typeId: WorkoutTypeId | null = isRest ? null : (choice as WorkoutTypeId);
  const typeDef: WorkoutTypeDef | null = typeId ? workoutTypeById(typeId) : null;
  const weekdayCap = weekdayLong
    ? weekdayLong[0].toUpperCase() + weekdayLong.slice(1)
    : '';

  const handleCommit = () => {
    onCommit({
      typeId,
      // Rest day clears time + duration (no meaning without a planned session).
      timeMin: isRest ? null : hasTime ? timeMin : null,
      durationMin: isRest ? null : hasDuration ? durationMin : null,
    });
    onClose();
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        kicker="schedule slot"
        titleNode={
          weekdayCap ? (
            <Text>
              Plan <Text style={{ color: tokens.accentInk }}>{weekdayCap}</Text>
            </Text>
          ) : (
            <Text>Plan</Text>
          )
        }
        cta={
          <Pressable
            onPress={handleCommit}
            accessibilityRole="button"
            accessibilityLabel={`Save ${weekdayLong ?? 'plan'}`}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={[styles.ctaText, textStyles.cap]}>
              plan {weekdayLong ?? 'day'}
            </Text>
            <Glyph name="chev" color={tokens.accent} />
          </Pressable>
        }>
        {/* TYPE */}
        <DrawerSection label="type" sub="from library" marginTop={8}>
          <View style={styles.typeGrid}>
            {WORKOUT_TYPES.map((t) => (
              <TypeTile
                key={t.id}
                typeId={t.id}
                label={t.label}
                tone={t.tone}
                active={choice === t.id}
                onPress={() => setChoice(t.id)}
              />
            ))}
            <TypeTile
              typeId={null}
              label="Rest"
              tone="mute"
              active={choice === REST}
              onPress={() => setChoice(REST)}
            />
          </View>
          {/* "+ new type" — stubbed pending #72. */}
          <Pressable
            onPress={() => {
              /* deferred to #72 */
            }}
            style={({ pressed }) => [
              styles.newTypeBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Glyph name="plus" color={tokens.ink3} size={10} />
            <Text style={[styles.newTypeText, textStyles.cap]}>new type</Text>
          </Pressable>
        </DrawerSection>

        {/* SELECTED TYPE INFO */}
        {typeDef && (
          <View style={styles.infoCard}>
            <View
              style={[
                styles.infoIcon,
                { backgroundColor: tokens.bg2, borderColor: tokens.line },
              ]}>
              <WorkoutGlyph typeId={typeDef.id} color={toneColor(typeDef.tone)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.infoTitleRow}>
                <Text style={styles.infoTitle}>{typeDef.label}</Text>
                <View style={styles.ahPill}>
                  <Text style={[styles.ahPillText, textStyles.cap]}>AH</Text>
                </View>
              </View>
              <Text style={styles.infoSub}>
                {describeType(typeDef)}
              </Text>
            </View>
          </View>
        )}

        {/* TIME — hidden on rest */}
        {!isRest && (
          <DrawerSection label="time" sub="local · 24h">
            <View style={styles.timeRow}>
              <Pressable
                onPress={() => setTimeSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit time"
                style={({ pressed }) => [
                  styles.timeBig,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[styles.timeBigDigit, textStyles.tnum]}>
                  {pad2(Math.floor(timeMin / 60))}
                </Text>
                <Text style={styles.timeBigColon}>:</Text>
                <Text style={[styles.timeBigDigit, textStyles.tnum]}>
                  {pad2(timeMin % 60)}
                </Text>
              </Pressable>

              <View style={styles.timeChips}>
                {TIME_PRESETS.map((p) => {
                  const active = hasTime && timeMin === p.min;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        setTimeMin(p.min);
                        setHasTime(true);
                      }}
                      style={({ pressed }) => [
                        styles.timeChip,
                        active && styles.timeChipActive,
                        pressed && !active && { opacity: 0.6 },
                      ]}>
                      <Text
                        style={[
                          styles.timeChipLabel,
                          textStyles.cap,
                          active && { color: tokens.ink, fontFamily: fonts.monoSemibold },
                        ]}>
                        {p.label}
                      </Text>
                      <Text
                        style={[
                          styles.timeChipValue,
                          textStyles.tnum,
                          active && { color: tokens.ink },
                        ]}>
                        {pad2(Math.floor(p.min / 60))}:{pad2(p.min % 60)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {!hasTime && (
              <Text style={styles.metaHint}>
                no specific time — linking falls back to weekday + type
              </Text>
            )}
          </DrawerSection>
        )}

        {/* DURATION — hidden on rest */}
        {!isRest && (
          <DrawerSection
            label="duration"
            sub={hasDuration ? `${durationMin} min` : 'open-ended'}>
            <View style={styles.durationCard}>
              <DurationSlider
                value={durationMin}
                onChange={(v) => {
                  setDurationMin(v);
                  setHasDuration(true);
                }}
              />
              <View style={styles.durationChipRow}>
                {DURATION_CHIPS.map((m) => {
                  const active = hasDuration && m === durationMin;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setDurationMin(m);
                        setHasDuration(true);
                      }}
                      hitSlop={6}>
                      <Text
                        style={[
                          styles.durationChipText,
                          textStyles.tnum,
                          active && styles.durationChipTextActive,
                        ]}>
                        {m}m
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {hasDuration && (
                <Pressable
                  onPress={() => setHasDuration(false)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.clearLink,
                    pressed && { opacity: 0.55 },
                  ]}>
                  <Text style={[styles.clearLinkText, textStyles.cap]}>
                    clear duration
                  </Text>
                </Pressable>
              )}
            </View>
          </DrawerSection>
        )}

        {/* RECURRENCE — "this week only" disabled until the override table lands. */}
        {!isRest && (
          <DrawerSection label="repeats">
            <View style={styles.recurrenceRow}>
              <RadioCard
                active
                label={`every ${weekdayLong ?? 'day'}`}
                sub="recurring slot"
              />
              <RadioCard
                disabled
                label="this week only"
                sub="coming soon"
              />
            </View>
          </DrawerSection>
        )}

        {isRest && (
          <Text style={styles.restNote}>
            recovery day — no time or duration to plan
          </Text>
        )}

        <View style={{ height: 12 }} />
      </Drawer>

      <DateTimePickerSheet
        open={timeSheetOpen}
        mode="time"
        title={`${weekdayCap || 'Slot'} time`}
        value={minToDateToday(timeMin)}
        onApply={(d) => {
          setTimeMin(d.getHours() * 60 + d.getMinutes());
          setHasTime(true);
          setTimeSheetOpen(false);
        }}
        onCancel={() => setTimeSheetOpen(false)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeTile — one cell in the 3×2 grid. Active state mirrors the design:
// dark ink fill with bg-colored icon + label.
// ─────────────────────────────────────────────────────────────────────────────
function TypeTile({
  typeId,
  label,
  tone,
  active,
  onPress,
}: {
  typeId: WorkoutTypeId | null;
  label: string;
  tone: WorkoutTypeTone;
  active: boolean;
  onPress: () => void;
}) {
  const iconColor = active ? tokens.bg : tone === 'mute' ? tokens.ink4 : toneColor(tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.typeTile,
        active && styles.typeTileActive,
        pressed && !active && { opacity: 0.7 },
      ]}>
      <View
        style={[
          styles.typeTileIcon,
          {
            backgroundColor: active
              ? 'rgba(255,255,255,0.16)'
              : typeId === null
              ? 'transparent'
              : tokens.card,
            borderColor: active || typeId === null ? 'transparent' : tokens.line,
            borderWidth: active || typeId === null ? 0 : 1,
          },
        ]}>
        <WorkoutGlyph typeId={typeId} color={iconColor} />
      </View>
      <Text
        style={[
          styles.typeTileLabel,
          { color: active ? tokens.bg : tokens.ink },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DurationSlider — drag handle, snaps to DURATION_STEP. Lighter than the
// water-settings Slider (no recommended band) but same gesture pattern.
// ─────────────────────────────────────────────────────────────────────────────
function DurationSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const widthRef = useRef(0);
  const range = DURATION_MAX - DURATION_MIN;
  const pct = Math.min(Math.max((value - DURATION_MIN) / range, 0), 1);

  const positionToValue = (x: number) => {
    if (widthRef.current === 0) return value;
    const p = Math.min(Math.max(x / widthRef.current, 0), 1);
    const raw = DURATION_MIN + p * range;
    return Math.min(
      DURATION_MAX,
      Math.max(DURATION_MIN, Math.round(raw / DURATION_STEP) * DURATION_STEP),
    );
  };

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange],
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
    [value, onChange],
  );

  const composed = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  return (
    <GestureDetector gesture={composed}>
      <View style={sliderStyles.hitArea} onLayout={onLayout}>
        <View style={sliderStyles.track}>
          <View
            pointerEvents="none"
            style={[sliderStyles.fill, { width: `${pct * 100}%` }]}
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

// ─────────────────────────────────────────────────────────────────────────────
// RadioCard — recurring vs one-off. Disabled state used for v1 since the
// override data model is filed separately (#81).
// ─────────────────────────────────────────────────────────────────────────────
function RadioCard({
  active,
  disabled,
  label,
  sub,
  onPress,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  sub: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.radioCard,
        active && styles.radioCardActive,
        disabled && { opacity: 0.5 },
        pressed && !disabled && !active && { opacity: 0.7 },
      ]}>
      <View style={[styles.radioDot, active && styles.radioDotActive]}>
        {active && <View style={styles.radioDotInner} />}
      </View>
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text style={[styles.radioLabel, active && { fontFamily: fonts.sansSemibold }]}>
          {label}
        </Text>
        <Text style={styles.radioSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkoutGlyph — inline SVG set, same shapes used on /workouts. Duplicated
// here so the design folder stays self-contained.
// ─────────────────────────────────────────────────────────────────────────────
function WorkoutGlyph({
  typeId,
  color,
  size = 14,
}: {
  typeId: WorkoutTypeId | null;
  color: string;
  size?: number;
}) {
  if (typeId === null) {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Path d="M4 7h6" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
    );
  }
  if (typeId === 'tennis') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Ellipse cx={5.5} cy={5.5} rx={3.8} ry={4.2} fill="none" stroke={color} strokeWidth={1.2} />
        <Line x1={8} y1={8.5} x2={12} y2={12.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={2.3} y1={5.5} x2={9.3} y2={5.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
        <Line x1={5.5} y1={1.5} x2={5.5} y2={9.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
      </Svg>
    );
  }
  if (typeId === 'cardio') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Circle cx={9} cy={3} r={1.4} fill="none" stroke={color} strokeWidth={1.2} />
        <Path
          d="M8.5 5l-2 3 1.5 1.5L7 12M6.5 8L4 9.5M8 7l2 1.5"
          stroke={color}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M2 7h10M3.5 5v4M10.5 5v4M5.5 4v6M8.5 4v6"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function minToDateToday(mins: number): Date {
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function toneColor(tone: WorkoutTypeTone): string {
  if (tone === 'accent') return tokens.accentInk;
  if (tone === 'cool') return tokens.cool;
  if (tone === 'mute') return tokens.ink4;
  return tokens.ink2;
}

function describeType(def: WorkoutTypeDef): string {
  // Subline copy mirrors the design's "auto-detects · default 60m · …".
  // Generic enough to read well for any library entry — the trailing fact
  // varies by type to feel less templated.
  const tail =
    def.id === 'tennis'
      ? 'court · singles or doubles'
      : def.id === 'cardio'
      ? 'walking · running · cycling'
      : 'strength training in Apple Health';
  return `auto-detects · default ${DEFAULT_DURATION}m · ${tail}`;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // CTA — sticky bottom button.
  cta: {
    height: 50,
    borderRadius: 14,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    shadowOpacity: 0.16,
  },
  ctaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.bg,
    letterSpacing: 2.42,
    textTransform: 'uppercase',
  },

  // Type grid
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeTile: {
    width: '32%',
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 5,
  },
  typeTileActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.14,
  },
  typeTileIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTileLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    letterSpacing: -0.06,
  },

  newTypeBtn: {
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
  newTypeText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9.5,
    color: tokens.ink3,
    letterSpacing: 1.71,
  },

  // Selected-type info card
  infoCard: {
    marginTop: 12,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.06,
  },
  ahPill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(214, 61, 82, 0.10)',
  },
  ahPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: '#D63D52',
    letterSpacing: 1.36,
  },
  infoSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.38,
  },

  // Time
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeBig: {
    flex: 1.2,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  timeBigDigit: {
    fontFamily: fonts.monoSemibold,
    fontSize: 32,
    color: tokens.ink,
    letterSpacing: -0.96,
  },
  timeBigColon: {
    fontFamily: fonts.mono,
    fontSize: 28,
    color: tokens.ink3,
  },
  timeChips: {
    flex: 1,
    gap: 4,
  },
  timeChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.line,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeChipActive: {
    backgroundColor: tokens.bg2,
    borderColor: tokens.line2,
  },
  timeChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
  },
  timeChipValue: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
  },

  metaHint: {
    marginTop: 8,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.38,
  },

  // Duration
  durationCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 12,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  durationChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  durationChipText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 0.36,
  },
  durationChipTextActive: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  clearLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 2,
  },
  clearLinkText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    color: tokens.ink3,
    letterSpacing: 1.62,
  },

  // Recurrence
  recurrenceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  radioCard: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.line,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCardActive: {
    backgroundColor: tokens.bg2,
    borderColor: tokens.line2,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: tokens.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotActive: {
    borderColor: tokens.accentInk,
  },
  radioDotInner: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  radioLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: -0.06,
  },
  radioSub: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    marginTop: 1,
    fontStyle: 'italic',
    letterSpacing: 0.34,
  },

  restNote: {
    marginTop: 18,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
});

const sliderStyles = StyleSheet.create({
  hitArea: {
    paddingVertical: 10,
  },
  track: {
    position: 'relative',
    height: 4,
    backgroundColor: tokens.bg2,
    borderRadius: 4,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: tokens.ink,
    borderRadius: 4,
  },
  handle: {
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
});
