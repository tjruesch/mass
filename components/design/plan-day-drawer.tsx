/**
 * Bottom drawer for editing one weekday's planned workout slot — port of
 * designs/screen-workouts-plan.jsx. Opens from a weekday row tap on
 * /workouts-settings.
 *
 * Sections (composite-types model, #82):
 *   1. type        — N×N grid sourced from the live library + dashed
 *                    "new type" CTA (stub for #72) + a Rest tile
 *   2. type-info   — selected type card: icon, name, AH pill, step
 *                    breakdown subline ("30m cycling · 10m lift · …")
 *   3. time        — big HH:MM display + morning/afternoon/evening chips
 *   4. repeats     — every <weekday> vs this week only (one-off disabled
 *                    until the override model lands in #81)
 *
 * Per-slot duration was a v1 concept (#79) and is no longer surfaced —
 * planned duration is derived from the sum of the selected type's
 * steps. State is local while open; the sticky `plan <weekday>` CTA
 * commits the patch to the parent in one shot. Cancel/dismiss discards.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

import {
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import type { WorkoutTypeTone } from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimePickerSheet } from './datetime-picker-sheet';
import { Drawer, DrawerSection } from './drawer';
import { Glyph } from './glyph';

const REST_TILE_KEY = '__rest__' as const;

// Time presets — morning / afternoon / evening shortcuts.
const TIME_PRESETS = [
  { key: 'morning', label: 'morning', min: 8 * 60 },
  { key: 'afternoon', label: 'afternoon', min: 12 * 60 + 30 },
  { key: 'evening', label: 'evening', min: 18 * 60 },
] as const;

export type PlanDayPatch = {
  /** Library key (e.g. 'push') or null for rest. */
  typeKey: string | null;
  timeMin: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Long weekday name ("monday"...). Drives the title + CTA copy. */
  weekdayLong: string | null;
  /** Initial values for the slot when opening; ignored after open. */
  initialType: string | null;
  initialTimeMin: number | null;
  onCommit: (patch: PlanDayPatch) => void;
};

export function PlanDayDrawer({
  open,
  onClose,
  weekdayLong,
  initialType,
  initialTimeMin,
  onCommit,
}: Props) {
  const types = useWorkoutTypes();

  // Local working copy. `choice === REST_TILE_KEY` means "Rest"; any other
  // string is a library type key.
  const [choice, setChoice] = useState<string>(initialType ?? REST_TILE_KEY);
  const [timeMin, setTimeMin] = useState<number>(initialTimeMin ?? TIME_PRESETS[2].min);
  const [hasTime, setHasTime] = useState<boolean>(initialTimeMin !== null);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(initialType ?? REST_TILE_KEY);
    setTimeMin(initialTimeMin ?? TIME_PRESETS[2].min);
    setHasTime(initialTimeMin !== null);
    setTimeSheetOpen(false);
  }, [open, initialType, initialTimeMin]);

  const isRest = choice === REST_TILE_KEY;
  const typeDef: WorkoutTypeDef | null = isRest
    ? null
    : types.find((t) => t.key === choice) ?? null;
  const weekdayCap = weekdayLong
    ? weekdayLong[0].toUpperCase() + weekdayLong.slice(1)
    : '';

  const handleCommit = () => {
    onCommit({
      typeKey: isRest ? null : choice,
      // Rest day clears the time (no meaning without a planned session).
      timeMin: isRest ? null : hasTime ? timeMin : null,
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
            {types.map((t) => (
              <TypeTile
                key={t.key}
                icon={t.icon}
                label={t.label}
                tone={t.tone}
                active={choice === t.key}
                onPress={() => setChoice(t.key)}
              />
            ))}
            <TypeTile
              icon="rest"
              label="Rest"
              tone="mute"
              active={isRest}
              onPress={() => setChoice(REST_TILE_KEY)}
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
              <WorkoutGlyph icon={typeDef.icon} color={toneColor(typeDef.tone)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.infoTitleRow}>
                <Text style={styles.infoTitle}>{typeDef.label}</Text>
                <View style={styles.ahPill}>
                  <Text style={[styles.ahPillText, textStyles.cap]}>AH</Text>
                </View>
              </View>
              <Text style={styles.infoSub}>{describeSteps(typeDef)}</Text>
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
            recovery day — no time to plan
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
// TypeTile — one cell in the type grid. Reads `icon` from the library
// instead of switching on a hardcoded id.
// ─────────────────────────────────────────────────────────────────────────────
function TypeTile({
  icon,
  label,
  tone,
  active,
  onPress,
}: {
  icon: 'lift' | 'tennis' | 'walk' | 'rest';
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
              : icon === 'rest'
              ? 'transparent'
              : tokens.card,
            borderColor: active || icon === 'rest' ? 'transparent' : tokens.line,
            borderWidth: active || icon === 'rest' ? 0 : 1,
          },
        ]}>
        <WorkoutGlyph icon={icon} color={iconColor} />
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
// RadioCard — recurring vs one-off. Disabled state is used for v1 since
// the override data model is filed separately (#81).
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
// WorkoutGlyph — same shapes as /workouts. Switches on the library's
// `icon` field rather than a type id, so future custom types reuse this.
// ─────────────────────────────────────────────────────────────────────────────
export function WorkoutGlyph({
  icon,
  color,
  size = 14,
}: {
  icon: 'lift' | 'tennis' | 'walk' | 'rest';
  color: string;
  size?: number;
}) {
  if (icon === 'rest') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Path d="M4 7h6" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
    );
  }
  if (icon === 'tennis') {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Ellipse cx={5.5} cy={5.5} rx={3.8} ry={4.2} fill="none" stroke={color} strokeWidth={1.2} />
        <Line x1={8} y1={8.5} x2={12} y2={12.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={2.3} y1={5.5} x2={9.3} y2={5.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
        <Line x1={5.5} y1={1.5} x2={5.5} y2={9.5} stroke={color} strokeWidth={0.6} opacity={0.55} />
      </Svg>
    );
  }
  if (icon === 'walk') {
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
  // 'lift' (default)
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

export function toneColor(tone: WorkoutTypeTone): string {
  if (tone === 'accent') return tokens.accentInk;
  if (tone === 'cool') return tokens.cool;
  if (tone === 'mute') return tokens.ink4;
  return tokens.ink2;
}

function describeSteps(def: WorkoutTypeDef): string {
  const total = totalPlannedMinutes(def);
  if (def.steps.length === 1) {
    const step = def.steps[0];
    return `auto-detects · ${step.durationMin}m ${humanizeActivity(step.hkActivityKey)}`;
  }
  return (
    def.steps
      .map((s) => `${s.durationMin}m ${humanizeActivity(s.hkActivityKey)}`)
      .join(' · ') + ` · ${total}m total`
  );
}

function humanizeActivity(hkKey: string): string {
  return hkKey
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
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
