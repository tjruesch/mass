/**
 * Workouts settings — port of designs/screen-workouts.jsx WorkoutsSettings,
 * trimmed to what we wire today.
 *
 * Auto-commit pattern: every interaction immediately writes to
 * `workout_preferences`. No save button. Mirrors fasting/water/weight.
 *
 * Out of scope (deferred follow-ups):
 *   - Custom workout types — #72.
 *   - Reminders — #73.
 *   - Edit/delete propagation back to HK on row edits — same precedent
 *     as weight #59.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, DateTimePickerSheet, SubHeader, TabBar } from '@/components/design';
import { updatePreferences } from '@/src/db/queries/workout-preferences';
import type { WorkoutPreferences } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useLastWorkoutSyncAt } from '@/src/hooks/use-workout-sync';
import {
  ensureHkAuthorization,
  useHkAuthState,
  type HkAuthState,
} from '@/src/lib/healthkit/auth';
import { WORKOUT_PERMISSIONS } from '@/src/lib/healthkit/workouts';
import { WORKOUT_TYPES, workoutTypeById, type WorkoutTypeId } from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─── Weekday config ─────────────────────────────────────────────────────────

type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: ReadonlyArray<{
  key: WeekdayKey;
  short: string;
  long: string;
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
}> = [
  { key: 'mon', short: 'M', long: 'monday',    typeField: 'monType', timeField: 'monTimeMin' },
  { key: 'tue', short: 'T', long: 'tuesday',   typeField: 'tueType', timeField: 'tueTimeMin' },
  { key: 'wed', short: 'W', long: 'wednesday', typeField: 'wedType', timeField: 'wedTimeMin' },
  { key: 'thu', short: 'T', long: 'thursday',  typeField: 'thuType', timeField: 'thuTimeMin' },
  { key: 'fri', short: 'F', long: 'friday',    typeField: 'friType', timeField: 'friTimeMin' },
  { key: 'sat', short: 'S', long: 'saturday',  typeField: 'satType', timeField: 'satTimeMin' },
  { key: 'sun', short: 'S', long: 'sunday',    typeField: 'sunType', timeField: 'sunTimeMin' },
];

const LINK_WINDOW_MIN = 15;
const LINK_WINDOW_MAX = 360;
const LINK_WINDOW_STEP = 15;

export default function WorkoutsSettingsScreen() {
  const router = useRouter();
  const prefs = useWorkoutPreferences();
  const auth = useHkAuthState(WORKOUT_PERMISSIONS);
  const lastSyncAt = useLastWorkoutSyncAt();

  // Stacked sheets for type + time editing per weekday row. Mutually
  // exclusive — only one can be open at a time.
  const [typeSheetKey, setTypeSheetKey] = useState<WeekdayKey | null>(null);
  const [timeSheetKey, setTimeSheetKey] = useState<WeekdayKey | null>(null);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const writeFail = (err: unknown) =>
    console.warn('Failed to update workout preferences:', err);
  const write = (patch: Partial<WorkoutPreferences>) =>
    updatePreferences(patch).catch(writeFail);

  const onSelectType = (key: WeekdayKey, typeId: WorkoutTypeId | null) => {
    const wd = WEEKDAYS.find((w) => w.key === key)!;
    const patch: Partial<WorkoutPreferences> = { [wd.typeField]: typeId } as Partial<WorkoutPreferences>;
    // Rest day → clear any planned time. Time has no meaning without a type.
    if (typeId === null) {
      (patch as Record<string, number | null>)[wd.timeField] = null;
    }
    write(patch);
    setTypeSheetKey(null);
  };

  const onSelectTime = (key: WeekdayKey, time: Date) => {
    const wd = WEEKDAYS.find((w) => w.key === key)!;
    const min = time.getHours() * 60 + time.getMinutes();
    write({ [wd.timeField]: min } as Partial<WorkoutPreferences>);
    setTimeSheetKey(null);
  };

  const onClearTime = (key: WeekdayKey) => {
    const wd = WEEKDAYS.find((w) => w.key === key)!;
    write({ [wd.timeField]: null } as Partial<WorkoutPreferences>);
  };

  const onAdjustWindow = (delta: number) => {
    const next = Math.min(
      LINK_WINDOW_MAX,
      Math.max(LINK_WINDOW_MIN, prefs.linkWindowMinutes + delta),
    );
    if (next !== prefs.linkWindowMinutes) write({ linkWindowMinutes: next });
  };

  const onToggleAutoImport = () =>
    write({ autoImportHealthKit: !prefs.autoImportHealthKit });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Workouts · settings" back="Workouts" onBack={() => router.back()} />

        {/* WEEKLY TEMPLATE */}
        <Section label="weekly template" sub="tap to edit each day">
          <View style={styles.cardList}>
            {WEEKDAYS.map((wd, i) => {
              const typeId = prefs[wd.typeField] as WorkoutTypeId | null;
              const timeMin = prefs[wd.timeField] as number | null;
              const typeDef = typeId ? workoutTypeById(typeId) : null;
              return (
                <View
                  key={wd.key}
                  style={[
                    styles.weekdayRow,
                    i < WEEKDAYS.length - 1 && styles.weekdayRowBorder,
                  ]}>
                  <Text style={[styles.weekdayShort, textStyles.cap]}>{wd.long}</Text>

                  {/* Type chip — tappable, opens type picker */}
                  <Pressable
                    onPress={() => setTypeSheetKey(wd.key)}
                    style={({ pressed }) => [
                      styles.typeChip,
                      typeDef ? styles.typeChipFilled : styles.typeChipRest,
                      pressed && { opacity: 0.6 },
                    ]}>
                    <Text
                      style={[
                        styles.typeChipLabel,
                        typeDef ? styles.typeChipLabelFilled : styles.typeChipLabelRest,
                      ]}>
                      {typeDef ? typeDef.id : 'rest'}
                    </Text>
                  </Pressable>

                  {/* Time pressable / em-dash */}
                  {typeDef ? (
                    <View style={styles.timeWrap}>
                      <Pressable
                        onPress={() => setTimeSheetKey(wd.key)}
                        style={({ pressed }) => [
                          styles.timeBtn,
                          pressed && { opacity: 0.6 },
                        ]}>
                        <Text style={[styles.timeText, textStyles.tnum]}>
                          {timeMin !== null ? formatMin(timeMin) : 'set time'}
                        </Text>
                      </Pressable>
                      {timeMin !== null && (
                        <Pressable
                          onPress={() => onClearTime(wd.key)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Clear time"
                          style={({ pressed }) => [
                            styles.timeClear,
                            pressed && { opacity: 0.6 },
                          ]}>
                          <Text style={styles.timeClearText}>×</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.timeRestDash}>—</Text>
                  )}
                </View>
              );
            })}
          </View>
        </Section>

        {/* LINK WINDOW */}
        <Section
          label="link window"
          sub="how close an Apple Health workout has to land to count toward a planned slot">
          <View style={styles.linkCard}>
            <View style={styles.linkValueRow}>
              <Text style={[styles.linkValue, textStyles.tnum]}>
                ±{prefs.linkWindowMinutes}
              </Text>
              <Text style={styles.linkValueUnit}>min</Text>
            </View>
            <View style={styles.linkSteppers}>
              <StepperButton
                label={`−${LINK_WINDOW_STEP}`}
                disabled={prefs.linkWindowMinutes <= LINK_WINDOW_MIN}
                onPress={() => onAdjustWindow(-LINK_WINDOW_STEP)}
              />
              <StepperButton
                label={`+${LINK_WINDOW_STEP}`}
                disabled={prefs.linkWindowMinutes >= LINK_WINDOW_MAX}
                onPress={() => onAdjustWindow(LINK_WINDOW_STEP)}
              />
            </View>
          </View>
        </Section>

        {/* APPLE HEALTH */}
        <Section label="apple health">
          <AppleHealthSection
            auth={auth}
            autoImport={prefs.autoImportHealthKit}
            lastSyncAt={lastSyncAt}
            onConnect={() => ensureHkAuthorization(WORKOUT_PERMISSIONS)}
            onToggleAutoImport={onToggleAutoImport}
          />
        </Section>
      </ScrollView>

      <TabBar active="home" />

      <TypePickerSheet
        weekday={typeSheetKey ? WEEKDAYS.find((w) => w.key === typeSheetKey)! : null}
        currentTypeId={
          typeSheetKey
            ? (prefs[WEEKDAYS.find((w) => w.key === typeSheetKey)!.typeField] as WorkoutTypeId | null)
            : null
        }
        onClose={() => setTypeSheetKey(null)}
        onSelect={(typeId) => {
          if (typeSheetKey) onSelectType(typeSheetKey, typeId);
        }}
      />

      <DateTimePickerSheet
        open={timeSheetKey !== null}
        mode="time"
        title={timeSheetKey ? `${WEEKDAYS.find((w) => w.key === timeSheetKey)!.long} time` : 'Time'}
        value={
          timeSheetKey
            ? minToDateToday(
                (prefs[WEEKDAYS.find((w) => w.key === timeSheetKey)!.timeField] as number | null) ?? 1050,
              )
            : new Date()
        }
        onApply={(d) => {
          if (timeSheetKey) onSelectTime(timeSheetKey, d);
        }}
        onCancel={() => setTimeSheetKey(null)}
      />
    </View>
  );
}

// ─── Section + sub-components ──────────────────────────────────────────────

function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 22, marginTop: 18 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, textStyles.cap]}>{label}</Text>
        {sub && (
          <Text style={styles.sectionSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

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
      hitSlop={4}
      style={({ pressed }) => [
        styles.stepperBtn,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.6 },
      ]}>
      <Text style={styles.stepperLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Apple Health section — state-driven copy of weight-settings'.
 * Granted shows the toggle + last-sync; unknown shows a CONNECT CTA;
 * denied / unavailable show their muted hints.
 */
function AppleHealthSection({
  auth,
  autoImport,
  lastSyncAt,
  onConnect,
  onToggleAutoImport,
}: {
  auth: HkAuthState;
  autoImport: boolean;
  lastSyncAt: Date | null;
  onConnect: () => void;
  onToggleAutoImport: () => void;
}) {
  if (auth === 'checking') return null;
  if (auth === 'unavailable') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <Text style={styles.cardRowSub}>Apple Health not available on this device.</Text>
        </View>
      </View>
    );
  }
  if (auth === 'unknown') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardRowName}>Connect to import workouts</Text>
            <Text style={styles.cardRowSub}>
              Mirrors recent sessions and pushes manual entries back.
            </Text>
          </View>
          <Pressable
            onPress={onConnect}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.connectCta,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={styles.connectCtaText}>connect</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (auth === 'denied') {
    return (
      <View style={styles.cardList}>
        <View style={styles.cardRow}>
          <Text style={styles.cardRowSub}>
            Apple Health off — re-enable read + write for Workouts in iOS
            Settings → Privacy &amp; Security → Health → Maß.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.cardList}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardRowName}>Auto-import from Apple Health</Text>
          <Text style={styles.cardRowSub}>
            {lastSyncAt
              ? `last sync ${formatClock(lastSyncAt)}`
              : 'pulls workouts on app foreground'}
          </Text>
        </View>
        <Switch on={autoImport} onToggle={onToggleAutoImport} />
      </View>
    </View>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      style={[
        styles.switch,
        {
          backgroundColor: on ? tokens.accentInk : tokens.bg2,
          borderColor: on ? tokens.accentInk : tokens.line,
        },
      ]}>
      <View style={[styles.switchKnob, { left: on ? 18 : 2 }]} />
    </Pressable>
  );
}

// ─── TypePickerSheet ──────────────────────────────────────────────────────

/**
 * Bottom sheet for picking the planned type for a weekday slot. Renders
 * one chip per library entry plus a "rest" chip (null type). Tap a chip
 * → onSelect fires immediately; the parent commits to prefs + closes.
 */
function TypePickerSheet({
  weekday,
  currentTypeId,
  onClose,
  onSelect,
}: {
  weekday: { long: string } | null;
  currentTypeId: WorkoutTypeId | null;
  onClose: () => void;
  onSelect: (typeId: WorkoutTypeId | null) => void;
}) {
  return (
    <BottomSheet
      open={weekday !== null}
      onClose={onClose}
      sheetStyle={typeSheetStyles.sheet}>
      <View style={typeSheetStyles.handle} />
      <View style={typeSheetStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[typeSheetStyles.kicker, textStyles.cap]}>WORKOUTS · {weekday?.long ?? ''}</Text>
          <Text style={typeSheetStyles.title}>Pick a type</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={typeSheetStyles.closeBtn}>
          <Text style={typeSheetStyles.closeBtnText}>cancel</Text>
        </Pressable>
      </View>

      <View style={typeSheetStyles.body}>
        <View style={typeSheetStyles.chipGrid}>
          {WORKOUT_TYPES.map((t) => {
            const active = currentTypeId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => onSelect(t.id)}
                style={({ pressed }) => [
                  typeSheetStyles.chip,
                  active && typeSheetStyles.chipActive,
                  pressed && !active && { opacity: 0.65 },
                ]}>
                <Text
                  style={[
                    typeSheetStyles.chipLabel,
                    active && { color: tokens.bg },
                  ]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => onSelect(null)}
            style={({ pressed }) => [
              typeSheetStyles.chip,
              typeSheetStyles.chipRest,
              currentTypeId === null && typeSheetStyles.chipActive,
              pressed && currentTypeId !== null && { opacity: 0.65 },
            ]}>
            <Text
              style={[
                typeSheetStyles.chipLabel,
                typeSheetStyles.chipLabelRest,
                currentTypeId === null && { color: tokens.bg },
              ]}>
              Rest
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatClock(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Build a Date with today's date but the given minutes-since-midnight time. */
function minToDateToday(mins: number): Date {
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 130,
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
  },

  // Weekly template
  cardList: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  weekdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  weekdayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },
  weekdayShort: {
    width: 80,
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    color: tokens.ink,
    letterSpacing: 1.62,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  typeChipFilled: {
    backgroundColor: tokens.ink,
  },
  typeChipRest: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  typeChipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  typeChipLabelFilled: {
    color: tokens.bg,
  },
  typeChipLabelRest: {
    color: tokens.ink4,
    fontStyle: 'italic',
  },

  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
    justifyContent: 'flex-end',
  },
  timeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  timeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 0.24,
  },
  timeClear: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeClearText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    lineHeight: 14,
  },
  timeRestDash: {
    minWidth: 70,
    textAlign: 'right',
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
  },

  // Link window
  linkCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  linkValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  linkValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 26,
    color: tokens.ink,
    letterSpacing: -0.78,
  },
  linkValueUnit: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
  },
  linkSteppers: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperBtn: {
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },

  // Toggle list
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  cardRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  cardRowSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
  },
  connectCta: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: tokens.ink,
  },
  connectCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  // Switch
  switch: {
    width: 36,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    position: 'relative',
  },
  switchKnob: {
    position: 'absolute',
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: tokens.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: 0.18,
  },
});

const typeSheetStyles = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
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
    paddingTop: 10,
    paddingBottom: 16,
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.1,
  },
  chipRest: {
    // Rest chip gets a slightly subdued look so the difference from "an
    // active plan day" is visible at a glance.
  },
  chipLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.13,
  },
  chipLabelRest: {
    color: tokens.ink3,
    fontStyle: 'italic',
  },
});
