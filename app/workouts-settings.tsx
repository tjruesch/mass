/**
 * Workouts settings — port of designs/screen-workouts.jsx WorkoutsSettings,
 * adapted for the composite-types model (#82).
 *
 * Sections:
 *   1. weekly template  — 7 rows, tap to open PlanDayDrawer
 *   2. workout types    — DB-backed library list with step subline
 *   3. apple health     — state-driven connect/auto-import + source mapping
 *                          aggregated across all type steps
 *
 * Out of scope (deferred follow-ups):
 *   - Custom workout types editor — #72.
 *   - Reminders — #73.
 *   - One-off slot overrides — #81.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  Glyph,
  PlanDayDrawer,
  SubHeader,
  TabBar,
  type PlanDayPatch,
} from '@/components/design';
import { WorkoutGlyph, toneColor } from '@/components/design/plan-day-drawer';
import { updatePreferences } from '@/src/db/queries/workout-preferences';
import {
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import type { WorkoutPreferences } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import { useLastWorkoutSyncAt } from '@/src/hooks/use-workout-sync';
import {
  ensureHkAuthorization,
  useHkAuthState,
  type HkAuthState,
} from '@/src/lib/healthkit/auth';
import { WORKOUT_PERMISSIONS } from '@/src/lib/healthkit/workouts';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─── Weekday config ─────────────────────────────────────────────────────────

type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type WeekdayCfg = {
  key: WeekdayKey;
  short: string;
  long: string;
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
};

const WEEKDAYS: ReadonlyArray<WeekdayCfg> = [
  { key: 'mon', short: 'M', long: 'monday',    typeField: 'monType', timeField: 'monTimeMin' },
  { key: 'tue', short: 'T', long: 'tuesday',   typeField: 'tueType', timeField: 'tueTimeMin' },
  { key: 'wed', short: 'W', long: 'wednesday', typeField: 'wedType', timeField: 'wedTimeMin' },
  { key: 'thu', short: 'T', long: 'thursday',  typeField: 'thuType', timeField: 'thuTimeMin' },
  { key: 'fri', short: 'F', long: 'friday',    typeField: 'friType', timeField: 'friTimeMin' },
  { key: 'sat', short: 'S', long: 'saturday',  typeField: 'satType', timeField: 'satTimeMin' },
  { key: 'sun', short: 'S', long: 'sunday',    typeField: 'sunType', timeField: 'sunTimeMin' },
];

export default function WorkoutsSettingsScreen() {
  const router = useRouter();
  const prefs = useWorkoutPreferences();
  const types = useWorkoutTypes();
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
      [wd.typeField]: patch.typeKey,
      [wd.timeField]: patch.timeMin,
    } as Partial<WorkoutPreferences>);
    setPlanKey(null);
  };

  const onToggleAutoImport = () =>
    write({ autoImportHealthKit: !prefs.autoImportHealthKit });

  const MOVE_STEP = 50;
  const MOVE_MIN = 100;
  const MOVE_MAX = 2000;
  const onAdjustMove = (delta: number) => {
    const next = Math.min(
      MOVE_MAX,
      Math.max(MOVE_MIN, prefs.moveTargetKcal + delta),
    );
    if (next !== prefs.moveTargetKcal) write({ moveTargetKcal: next });
  };

  const typeByKey = (k: string | null): WorkoutTypeDef | null =>
    k === null ? null : types.find((t) => t.key === k) ?? null;

  // Sub-line for the weekly-template section header — counts of each
  // tone-bucket so the page summarises the template at a glance.
  const templateSummary = summarizeTemplate(prefs, types);

  const planWd = planKey ? WEEKDAYS.find((w) => w.key === planKey)! : null;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SubHeader title="Workouts · settings" back="Workouts" onBack={() => router.back()} />

        {/* WEEKLY TEMPLATE */}
        <Section label="weekly template" sub={templateSummary}>
          <View style={styles.cardList}>
            {WEEKDAYS.map((wd, i) => {
              const typeKey = prefs[wd.typeField] as string | null;
              const timeMin = prefs[wd.timeField] as number | null;
              const typeDef = typeByKey(typeKey);
              const totalMin = typeDef ? totalPlannedMinutes(typeDef) : 0;
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
                  <View
                    style={[
                      styles.templateIcon,
                      typeDef && { backgroundColor: tokens.bg2 },
                    ]}>
                    <WorkoutGlyph
                      icon={typeDef?.icon ?? 'rest'}
                      color={typeDef ? toneColor(typeDef.tone) : tokens.ink4}
                      size={20}
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
                    {formatRowMeta(timeMin, totalMin, typeDef)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* WORKOUT TYPES */}
        <Section label="workout types" sub="library">
          <View style={styles.cardList}>
            {types.map((t, i) => (
              <Pressable
                key={t.key}
                onPress={() => router.push(`/workout-type/${t.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${t.label}`}
                style={({ pressed }) => [
                  styles.typeRow,
                  i < types.length - 1 && styles.rowBorder,
                  pressed && { opacity: 0.75 },
                ]}>
                <View style={styles.typeIcon}>
                  <WorkoutGlyph icon={t.icon} color={toneColor(t.tone)} size={22} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.typeNameRow}>
                    <Text style={styles.typeName}>{t.label}</Text>
                    {t.isBuiltin && (
                      <View style={styles.builtinPill}>
                        <Text style={[styles.builtinPillText, textStyles.cap]}>
                          default
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.typeDetail} numberOfLines={1}>
                    {describeStepsForLibrary(t)}
                  </Text>
                </View>
                <Glyph name="chev" color={tokens.ink3} />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/workout-type/new' as never)}
            style={({ pressed }) => [
              styles.newTypeBtn,
              pressed && { opacity: 0.55 },
            ]}>
            <Glyph name="plus" color={tokens.ink3} size={10} />
            <Text style={[styles.newTypeText, textStyles.cap]}>new type</Text>
          </Pressable>
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

        {/* MOVE GOAL — drives the home-screen move ring fill. Stored as
            kcal/day; the value the watch reports comes from HK on its own. */}
        <Section
          label="move goal"
          sub="active kcal per day · home ring target">
          <View style={styles.moveCard}>
            <View style={styles.moveValueRow}>
              <Text style={[styles.moveValue, textStyles.tnum]}>
                {prefs.moveTargetKcal}
              </Text>
              <Text style={styles.moveValueUnit}>kcal</Text>
            </View>
            <View style={styles.moveSteppers}>
              <Pressable
                onPress={() => onAdjustMove(-MOVE_STEP)}
                disabled={prefs.moveTargetKcal <= MOVE_MIN}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.moveStepBtn,
                  prefs.moveTargetKcal <= MOVE_MIN && { opacity: 0.35 },
                  pressed && prefs.moveTargetKcal > MOVE_MIN && { opacity: 0.6 },
                ]}>
                <Text style={styles.moveStepLabel}>−{MOVE_STEP}</Text>
              </Pressable>
              <Pressable
                onPress={() => onAdjustMove(MOVE_STEP)}
                disabled={prefs.moveTargetKcal >= MOVE_MAX}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.moveStepBtn,
                  prefs.moveTargetKcal >= MOVE_MAX && { opacity: 0.35 },
                  pressed && prefs.moveTargetKcal < MOVE_MAX && { opacity: 0.6 },
                ]}>
                <Text style={styles.moveStepLabel}>+{MOVE_STEP}</Text>
              </Pressable>
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
          planWd ? (prefs[planWd.typeField] as string | null) : null
        }
        initialTimeMin={
          planWd ? (prefs[planWd.timeField] as number | null) : null
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

/** Format the right-side meta cell. Rest → em-dash; planned → time · dur. */
function formatRowMeta(
  timeMin: number | null,
  totalMin: number,
  typeDef: WorkoutTypeDef | null,
): string {
  if (!typeDef) return '—';
  const stepSuffix = typeDef.steps.length > 1 ? ` (${typeDef.steps.length})` : '';
  if (timeMin !== null) {
    return `${formatMin(timeMin)} · ${totalMin}m${stepSuffix}`;
  }
  return `${totalMin}m${stepSuffix}`;
}

/** "3 lift · 2 tennis · 2 rest" — count tone-bucket across the week. */
function summarizeTemplate(
  prefs: WorkoutPreferences,
  types: ReadonlyArray<WorkoutTypeDef>,
): string {
  const byKey = new Map(types.map((t) => [t.key, t] as const));
  let lift = 0;
  let accent = 0;
  let cool = 0;
  let rest = 0;
  for (const wd of WEEKDAYS) {
    const key = prefs[wd.typeField] as string | null;
    if (!key) {
      rest++;
      continue;
    }
    const def = byKey.get(key);
    if (!def) continue;
    if (def.tone === 'accent') accent++;
    else if (def.tone === 'cool') cool++;
    else lift++;
  }
  const parts: string[] = [];
  if (lift) parts.push(`${lift} lift`);
  if (accent) parts.push(`${accent} accent`);
  if (cool) parts.push(`${cool} cardio`);
  if (rest) parts.push(`${rest} rest`);
  return parts.join(' · ');
}

/** Per-type subline in the library list — the step breakdown. */
function describeStepsForLibrary(def: WorkoutTypeDef): string {
  return def.steps
    .map((s) => `${s.durationMin}m ${humanizeActivity(s.hkActivityKey)}`)
    .join(' · ');
}

function humanizeActivity(hkKey: string): string {
  return hkKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  templateDow: {
    width: 22,
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
    letterSpacing: 1.92,
  },
  templateIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.08,
  },
  templateLabelRest: {
    color: tokens.ink3,
    fontStyle: 'italic',
    fontFamily: fonts.sans,
  },
  templateMeta: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
    letterSpacing: 0.52,
  },

  // Workout types library
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: tokens.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokens.ink,
  },
  builtinPill: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  builtinPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.6,
  },
  typeDetail: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 3,
    letterSpacing: 0.48,
  },

  newTypeBtn: {
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
  newTypeText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.92,
  },

  // Apple Health
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  cardRowName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokens.ink,
  },
  cardRowSub: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    marginTop: 3,
    fontStyle: 'italic',
    letterSpacing: 0.48,
  },
  heartIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveOrSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectCta: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: tokens.ink,
  },
  connectCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.bg,
    letterSpacing: 1.92,
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

  deferredHint: {
    marginTop: 22,
    marginHorizontal: 22,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.48,
  },

  // Move goal stepper
  moveCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  moveValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  moveValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.48,
  },
  moveValueUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  moveSteppers: {
    flexDirection: 'row',
    gap: 6,
  },
  moveStepBtn: {
    minWidth: 50,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveStepLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: tokens.ink,
  },
});
