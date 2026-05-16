/**
 * Workouts settings — port of designs/screen-workouts.jsx WorkoutsSettings.
 *
 * Sections:
 *   1. weekly template  — 7 rows, tap to open PlanDayDrawer (#80)
 *   2. workout types    — library list, "+ new type" CTA stubbed for #72
 *   3. apple health     — state-driven connect/auto-import + source mapping
 *   4. linking rules    — ±N time window stepper (the only rule wired today)
 *
 * Auto-commit pattern: every interaction immediately writes to
 * `workout_preferences`. No save button. Mirrors fasting/water/weight.
 *
 * Out of scope (deferred follow-ups):
 *   - Custom workout types — #72.
 *   - Reminders — #73.
 *   - Per-source enable toggles on Apple Health — needs new schema.
 *   - Edit/delete propagation back to HK — same precedent as weight #59.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';

import {
  Glyph,
  PlanDayDrawer,
  SubHeader,
  TabBar,
  type PlanDayPatch,
} from '@/components/design';
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
import {
  WORKOUT_TYPES,
  fallbackLabelForHkActivity,
  workoutTypeById,
  type WorkoutTypeDef,
  type WorkoutTypeId,
  type WorkoutTypeTone,
} from '@/src/lib/workouts/types';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─── Weekday config ─────────────────────────────────────────────────────────

type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type WeekdayCfg = {
  key: WeekdayKey;
  short: string;
  long: string;
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
  durationField: keyof WorkoutPreferences;
};

const WEEKDAYS: ReadonlyArray<WeekdayCfg> = [
  { key: 'mon', short: 'M', long: 'monday',    typeField: 'monType', timeField: 'monTimeMin', durationField: 'monDurationMin' },
  { key: 'tue', short: 'T', long: 'tuesday',   typeField: 'tueType', timeField: 'tueTimeMin', durationField: 'tueDurationMin' },
  { key: 'wed', short: 'W', long: 'wednesday', typeField: 'wedType', timeField: 'wedTimeMin', durationField: 'wedDurationMin' },
  { key: 'thu', short: 'T', long: 'thursday',  typeField: 'thuType', timeField: 'thuTimeMin', durationField: 'thuDurationMin' },
  { key: 'fri', short: 'F', long: 'friday',    typeField: 'friType', timeField: 'friTimeMin', durationField: 'friDurationMin' },
  { key: 'sat', short: 'S', long: 'saturday',  typeField: 'satType', timeField: 'satTimeMin', durationField: 'satDurationMin' },
  { key: 'sun', short: 'S', long: 'sunday',    typeField: 'sunType', timeField: 'sunTimeMin', durationField: 'sunDurationMin' },
];

const LINK_WINDOW_MIN = 15;
const LINK_WINDOW_MAX = 360;
const LINK_WINDOW_STEP = 15;

export default function WorkoutsSettingsScreen() {
  const router = useRouter();
  const prefs = useWorkoutPreferences();
  const auth = useHkAuthState(WORKOUT_PERMISSIONS);
  const lastSyncAt = useLastWorkoutSyncAt();

  const [planKey, setPlanKey] = useState<WeekdayKey | null>(null);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const writeFail = (err: unknown) =>
    console.warn('Failed to update workout preferences:', err);
  const write = (patch: Partial<WorkoutPreferences>) =>
    updatePreferences(patch).catch(writeFail);

  const onCommitPlan = (key: WeekdayKey, patch: PlanDayPatch) => {
    const wd = WEEKDAYS.find((w) => w.key === key)!;
    write({
      [wd.typeField]: patch.typeId,
      [wd.timeField]: patch.timeMin,
      [wd.durationField]: patch.durationMin,
    } as Partial<WorkoutPreferences>);
    setPlanKey(null);
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

  // Sub-line for the weekly-template section header — counts of each type
  // family so the page summarises the template at a glance.
  const templateSummary = summarizeTemplate(prefs);

  const planWd = planKey ? WEEKDAYS.find((w) => w.key === planKey)! : null;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Workouts · settings" back="Workouts" onBack={() => router.back()} />

        {/* WEEKLY TEMPLATE */}
        <Section label="weekly template" sub={templateSummary}>
          <View style={styles.cardList}>
            {WEEKDAYS.map((wd, i) => {
              const typeId = prefs[wd.typeField] as WorkoutTypeId | null;
              const timeMin = prefs[wd.timeField] as number | null;
              const durationMin = prefs[wd.durationField] as number | null;
              const typeDef = typeId ? workoutTypeById(typeId) : null;
              return (
                <Pressable
                  key={wd.key}
                  onPress={() => setPlanKey(wd.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Plan ${wd.long}`}
                  style={({ pressed }) => [
                    styles.templateRow,
                    i < WEEKDAYS.length - 1 && styles.rowBorder,
                    pressed && { opacity: 0.75 },
                  ]}>
                  <Text style={[styles.templateDow, textStyles.cap]}>{wd.short}</Text>
                  <View style={styles.templateIcon}>
                    <WorkoutGlyph
                      typeId={typeId}
                      color={typeDef ? toneColor(typeDef.tone) : tokens.ink4}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.templateLabel,
                      !typeDef && styles.templateLabelRest,
                    ]}>
                    {typeDef ? typeDef.label : 'Rest'}
                  </Text>
                  <Text style={[styles.templateMeta, textStyles.tnum]}>
                    {formatRowMeta(timeMin, durationMin, typeDef !== null)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* WORKOUT TYPES */}
        <Section label="workout types" sub="library">
          <View style={styles.cardList}>
            {WORKOUT_TYPES.map((t, i) => (
              <View
                key={t.id}
                style={[
                  styles.typeRow,
                  i < WORKOUT_TYPES.length - 1 && styles.rowBorder,
                ]}>
                <View style={styles.typeIcon}>
                  <WorkoutGlyph typeId={t.id} color={toneColor(t.tone)} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.typeName}>{t.label}</Text>
                  <Text style={styles.typeDetail} numberOfLines={1}>
                    {typeDetail(t)}
                  </Text>
                </View>
                <Glyph name="chev" color={tokens.ink3} />
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => {
              /* deferred — #72 */
            }}
            style={({ pressed }) => [
              styles.newTypeBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Glyph name="plus" color={tokens.ink3} size={10} />
            <Text style={[styles.newTypeText, textStyles.cap]}>new type</Text>
          </Pressable>
        </Section>

        {/* APPLE HEALTH */}
        <Section label="apple health" sub="auto-import sources">
          <AppleHealthSection
            auth={auth}
            autoImport={prefs.autoImportHealthKit}
            lastSyncAt={lastSyncAt}
            onConnect={() => ensureHkAuthorization(WORKOUT_PERMISSIONS)}
            onToggleAutoImport={onToggleAutoImport}
          />
          {auth === 'granted' && (
            <View style={[styles.cardList, { marginTop: 8 }]}>
              {sourceMappings().map((row, i, arr) => (
                <View
                  key={row.ah}
                  style={[
                    styles.sourceRow,
                    i < arr.length - 1 && styles.rowBorder,
                  ]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sourceAh}>{row.ah}</Text>
                    <Text style={styles.sourceMap}>→ {row.maps}</Text>
                  </View>
                  <View style={styles.sourceOnPill}>
                    <Text style={[styles.sourceOnText, textStyles.cap]}>on</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* LINKING RULES */}
        <Section
          label="linking rules"
          sub="how detected sessions match the plan">
          <View style={styles.cardList}>
            <View style={styles.ruleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ruleName}>auto-link by time + type</Text>
                <Text style={styles.ruleSub}>
                  matches an HK session to a planned slot if within the window below
                </Text>
              </View>
              <View style={styles.ruleOnPill}>
                <Text style={[styles.ruleOnText, textStyles.cap]}>on</Text>
              </View>
            </View>
            <View style={[styles.ruleRow, styles.ruleRowBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ruleName}>time window</Text>
                <Text style={styles.ruleSub}>± minutes from planned slot</Text>
              </View>
              <View style={styles.linkValueRow}>
                <Text style={[styles.linkValue, textStyles.tnum]}>
                  ±{prefs.linkWindowMinutes}
                </Text>
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
            </View>
          </View>
        </Section>

        <Text style={styles.deferredHint}>
          reminders coming in a separate update
        </Text>
      </ScrollView>

      <TabBar active="home" />

      <PlanDayDrawer
        open={planKey !== null}
        onClose={() => setPlanKey(null)}
        weekdayLong={planWd?.long ?? null}
        initialType={
          planWd ? (prefs[planWd.typeField] as WorkoutTypeId | null) : null
        }
        initialTimeMin={
          planWd ? (prefs[planWd.timeField] as number | null) : null
        }
        initialDurationMin={
          planWd ? (prefs[planWd.durationField] as number | null) : null
        }
        onCommit={(patch) => {
          if (planKey) onCommitPlan(planKey, patch);
        }}
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
          <Text style={styles.sectionSub} numberOfLines={1}>
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
        <View style={[styles.heartIcon, { backgroundColor: '#FFE3E7' }]}>
          <HeartGlyph color="#D63D52" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardRowName}>Apple Health</Text>
          <Text style={styles.cardRowSub}>
            {lastSyncAt
              ? `connected · last sync ${formatClock(lastSyncAt)}`
              : 'connected · pulls on app foreground'}
          </Text>
        </View>
        <View style={styles.liveOrSwitch}>
          <Switch on={autoImport} onToggle={onToggleAutoImport} />
        </View>
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

// ─── Glyphs ────────────────────────────────────────────────────────────────

function HeartGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 14 14">
      <Path
        d="M7 12s-5-3-5-7a2.8 2.8 0 0 1 5-1.8A2.8 2.8 0 0 1 12 5c0 4-5 7-5 7z"
        fill={color}
      />
    </Svg>
  );
}

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

// ─── Helpers ───────────────────────────────────────────────────────────────

function toneColor(tone: WorkoutTypeTone): string {
  if (tone === 'accent') return tokens.accentInk;
  if (tone === 'cool') return tokens.cool;
  if (tone === 'mute') return tokens.ink4;
  return tokens.ink2;
}

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

/** Format the right-side meta cell. Rest → em-dash; planned → time · dur. */
function formatRowMeta(
  timeMin: number | null,
  durationMin: number | null,
  hasType: boolean,
): string {
  if (!hasType) return '—';
  const parts: string[] = [];
  if (timeMin !== null) parts.push(formatMin(timeMin));
  if (durationMin !== null) parts.push(`${durationMin}m`);
  return parts.length === 0 ? 'set time' : parts.join(' · ');
}

/** "3 lift · 2 tennis · 2 rest" — count families across the week. */
function summarizeTemplate(prefs: WorkoutPreferences): string {
  let lift = 0;
  let tennis = 0;
  let cardio = 0;
  let rest = 0;
  for (const wd of WEEKDAYS) {
    const id = prefs[wd.typeField] as WorkoutTypeId | null;
    if (id === null) rest++;
    else if (id === 'tennis') tennis++;
    else if (id === 'cardio') cardio++;
    else lift++;
  }
  const parts: string[] = [];
  if (lift) parts.push(`${lift} lift`);
  if (tennis) parts.push(`${tennis} tennis`);
  if (cardio) parts.push(`${cardio} cardio`);
  if (rest) parts.push(`${rest} rest`);
  return parts.join(' · ');
}

/** Per-type subline in the library list. */
function typeDetail(t: WorkoutTypeDef): string {
  if (t.id === 'push') return 'bench · ohp · push variations';
  if (t.id === 'pull') return 'rows · pulldowns · curls';
  if (t.id === 'legs') return 'squat · hinge · lunge';
  if (t.id === 'tennis') return 'singles or doubles';
  return 'walking · running · cycling';
}

/** Static mapping rows of HK source → our type. */
function sourceMappings() {
  // Group HK candidates by which of our types claim them.
  const grouped = new Map<string, Set<WorkoutTypeId>>();
  for (const t of WORKOUT_TYPES) {
    for (const k of t.hkCandidateKeys) {
      const set = grouped.get(k) ?? new Set<WorkoutTypeId>();
      set.add(t.id);
      grouped.set(k, set);
    }
  }
  const rows: Array<{ ah: string; maps: string }> = [];
  for (const [key, types] of grouped) {
    rows.push({
      ah: fallbackLabelForHkActivity(key).toLowerCase(),
      maps: Array.from(types).join(' · '),
    });
  }
  return rows;
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
    letterSpacing: 0.36,
  },

  // Card list (shared shell for all sections)
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
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.line,
  },

  // Weekly template
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  templateDow: {
    width: 18,
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink,
    letterSpacing: 1.6,
  },
  templateIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.06,
  },
  templateLabelRest: {
    color: tokens.ink3,
    fontStyle: 'italic',
    fontFamily: fonts.sans,
  },
  templateMeta: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink4,
    letterSpacing: 0.42,
  },

  // Workout types library
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  typeIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  typeDetail: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.38,
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

  // Apple Health header row
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
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
    letterSpacing: 0.38,
  },
  heartIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveOrSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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

  // Apple Health source mapping
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  sourceAh: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.22,
  },
  sourceMap: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    marginTop: 2,
    letterSpacing: 0.36,
  },
  sourceOnPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 122, 58, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(31, 122, 58, 0.18)',
  },
  sourceOnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: '#1F7A3A',
    letterSpacing: 1.53,
  },

  // Linking rules
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  ruleRowBorder: {
    borderTopWidth: 1,
    borderTopColor: tokens.line,
  },
  ruleName: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: tokens.ink,
  },
  ruleSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
    letterSpacing: 0.38,
  },
  ruleOnPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 122, 58, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(31, 122, 58, 0.18)',
  },
  ruleOnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: '#1F7A3A',
    letterSpacing: 1.53,
  },
  linkValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.14,
  },
  linkSteppers: {
    flexDirection: 'row',
    gap: 4,
  },
  stepperBtn: {
    minWidth: 32,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink,
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

  deferredHint: {
    marginTop: 18,
    marginHorizontal: 22,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.38,
  },
});
