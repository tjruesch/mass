import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import {
  DateTimeField,
  DateTimePickerSheet,
  Drawer,
  DrawerSection,
  Glyph,
  HEAT_COLORS,
  HEATMAP_CELL,
  HEATMAP_GAP,
  PrimaryButton,
  StreakHeatmap,
  SubHeader,
  TabBar,
  WindowStrip,
} from '@/components/design';
import { endSession, logPastSession, startSession, updateSessionStart } from '@/src/db/queries/fasting';
import { useFasting, useFastingHistory, type FastingState } from '@/src/hooks/use-fasting';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import {
  FASTING_PHASES,
  formatHM,
  formatHMS,
  formatRelative,
  isInWindow,
  minutesUntil,
  nowMinutes,
} from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

export default function FastingScreen() {
  const router = useRouter();
  const state = useFasting(1000);
  const [logPastOpen, setLogPastOpen] = useState(false);

  const openLogPast = useCallback(() => setLogPastOpen(true), []);
  const closeLogPast = useCallback(() => setLogPastOpen(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader
          title="Fasting"
          back="Home"
          onBack={() => router.back()}
          trailing={
            <Pressable onPress={() => router.push('/fasting-settings')} hitSlop={8}>
              <View style={styles.cogBubble}>
                <Glyph name="cog" />
              </View>
            </Pressable>
          }
        />

        <FastingBody state={state} onLogPast={openLogPast} />
      </ScrollView>

      <TabBar active="home" />

      <LogPastFastDrawer open={logPastOpen} onClose={closeLogPast} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FastingBody — single surface that adapts to active OR idle.
//
// Idle vs active is purely a "filled in vs faded + START pill" treatment of
// the same layout. The streak heatmap and log-past link are present in both
// because they're history, not in-flight state. End-fast button only when
// there's something to end.
// ─────────────────────────────────────────────────────────────────────────────
function FastingBody({
  state,
  onLogPast,
}: {
  state: FastingState;
  onLogPast: () => void;
}) {
  const prefs = useFastingPreferences();
  const active = state.status === 'active' ? state : null;

  // Tap-to-edit on the hero ring opens the start-time picker sheet (active only).
  const [editingStart, setEditingStart] = useState(false);

  // Effective target hours — from session in active state, from prefs otherwise.
  const targetHours = active?.session.targetHours ?? prefs?.defaultTargetHours ?? 16;

  const handleStart = useCallback(() => {
    if (!prefs) return;
    startSession({ targetHours: prefs.defaultTargetHours }).catch((err) =>
      Alert.alert('Failed to start', err.message),
    );
  }, [prefs]);

  const handleEndFast = useCallback(() => {
    if (!active) return;
    Alert.alert(
      'End fast?',
      `You're ${(active.progress * 100).toFixed(0)}% to your ${active.session.targetHours}h target.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            endSession().catch((err) => Alert.alert('Failed to end', err.message));
          },
        },
      ],
    );
  }, [active]);

  const handleStartTimeApply = useCallback(
    (newStartedAt: Date) => {
      if (!active) return;
      updateSessionStart(active.session.id, newStartedAt)
        .then(() => setEditingStart(false))
        .catch((err) => Alert.alert('Failed to update', err.message));
    },
    [active],
  );

  // 72h cap matches updateSessionStart's validation; iOS spinner enforces visually.
  const minStart = new Date(Date.now() - 72 * 3_600_000);
  const maxStart = new Date();

  // ── Hero ring ──────────────────────────────────────────────────────────
  // When active, the whole ring is tappable to edit start time.
  // When idle, the START FAST pill inside the ring is the tap target.
  const heroRing = (
    <HeroRing
      size={236}
      targetHours={targetHours}
      active={
        active
          ? {
              elapsedHours: active.elapsedHours,
              elapsedMs: active.elapsedMs,
            }
          : undefined
      }
      onStartFast={handleStart}
      startDisabled={!prefs}
      onEndFast={handleEndFast}
    />
  );

  // ── Stat strip values ──────────────────────────────────────────────────
  const startedValue = active ? formatTime(active.session.startedAt) : '—';
  const startedSub = active ? formatWeekday(active.session.startedAt) : '';
  const projectedValue = active
    ? formatTime(new Date(active.session.startedAt.getTime() + active.session.targetHours * 3_600_000))
    : '—';
  const projectedSub = active
    ? active.msToTarget > 0
      ? `in ${formatRelative(active.msToTarget)}`
      : `${formatRelative(-active.msToTarget)} over`
    : '';
  const targetValue = `${targetHours.toString().padStart(2, '0')}:00`;
  const targetSub = active
    ? active.msToTarget < 0
      ? `+${formatRelative(-active.msToTarget)} over`
      : `${(active.progress * 100).toFixed(1)}%`
    : 'ready';
  const overTone: 'normal' | 'over' = active && active.msToTarget < 0 ? 'over' : 'normal';
  const idleTone: 'normal' | 'muted' = active ? 'normal' : 'muted';

  return (
    <>
      <View style={styles.heroWrap}>
        {active ? (
          <Pressable
            onPress={() => setEditingStart(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit start time"
            style={({ pressed }) => pressed && { opacity: 0.85 }}>
            {heroRing}
          </Pressable>
        ) : (
          heroRing
        )}
      </View>

      <View style={styles.statStripWrap}>
        <View style={styles.statStrip}>
          <StatCell
            label="started"
            value={startedValue}
            sub={startedSub}
            withDivider={false}
            tone={idleTone}
          />
          <StatCell
            label="projected"
            value={projectedValue}
            sub={projectedSub}
            subTone={overTone}
            tone={idleTone}
          />
          <StatCell
            label="target"
            value={targetValue}
            sub={targetSub}
            subTone={overTone}
            tone={idleTone}
          />
        </View>
      </View>

      <View style={styles.phaseCardWrap}>
        <View style={styles.phaseCard}>
          {active ? (
            <FastingPhaseBar
              active={{
                elapsedHours: active.elapsedHours,
                msToNextPhase: active.msToNextPhase,
                phaseLabel: active.currentPhase.label,
              }}
            />
          ) : (
            <EatingDayBar />
          )}
        </View>
      </View>

      <StreakSection />

      <View style={styles.actionWrap}>
        <LogPastFastLink onPress={onLogPast} />
      </View>

      <DateTimePickerSheet
        open={editingStart}
        value={active?.session.startedAt ?? new Date()}
        mode="datetime"
        title="Edit start time"
        minimumDate={minStart}
        maximumDate={maxStart}
        onApply={handleStartTimeApply}
        onCancel={() => setEditingStart(false)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LogPastFastLink — small text button under the primary CTA on either view.
// ─────────────────────────────────────────────────────────────────────────────
function LogPastFastLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.logPastLink, pressed && { opacity: 0.6 }]}>
      <Text style={styles.logPastLinkText}>+ log past fast</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LogPastFastDrawer — bottom-drawer form for retroactively logging a fast.
// ─────────────────────────────────────────────────────────────────────────────
const PAST_FAST_MAX_BACKDATE_MS = 30 * 24 * 3_600_000;

function LogPastFastDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = useFastingPreferences();
  const [startedAt, setStartedAt] = useState<Date>(() => new Date(Date.now() - 16 * 3_600_000));
  const [endedAt, setEndedAt] = useState<Date>(() => new Date());
  const [saving, setSaving] = useState(false);

  // Re-seed each open so prior drawer state doesn't leak between sessions.
  // Default start = now - prefs.defaultTargetHours so the form opens
  // matching the user's protocol; they edit from there.
  useEffect(() => {
    if (open && prefs) {
      const now = new Date();
      setEndedAt(now);
      setStartedAt(new Date(now.getTime() - prefs.defaultTargetHours * 3_600_000));
      setSaving(false);
    }
  }, [open, prefs]);

  const minStart = new Date(Date.now() - PAST_FAST_MAX_BACKDATE_MS);
  const maxEnd = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const valid = durationMs > 0 && endedAt.getTime() <= Date.now() && prefs !== null;

  const handleSave = useCallback(() => {
    if (!valid || !prefs || saving) return;
    setSaving(true);
    logPastSession({
      startedAt,
      endedAt,
      // Snapshot the user's current global target onto the past session.
      targetHours: prefs.defaultTargetHours,
    })
      .then(() => onClose())
      .catch((err) => {
        Alert.alert('Could not log fast', err.message);
        setSaving(false);
      });
  }, [valid, prefs, saving, startedAt, endedAt, onClose]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      kicker="FASTING"
      title="Log past fast"
      cta={<PrimaryButton label={saving ? 'saving…' : 'save'} onPress={handleSave} disabled={!valid || saving} />}>
      <DrawerSection label="start" marginTop={8}>
        <DateTimeField
          value={startedAt}
          onChange={setStartedAt}
          title="Start time"
          minimumDate={minStart}
          maximumDate={endedAt}
        />
      </DrawerSection>

      <DrawerSection label="end">
        <DateTimeField
          value={endedAt}
          onChange={setEndedAt}
          title="End time"
          minimumDate={startedAt}
          maximumDate={maxEnd}
        />
      </DrawerSection>

      <DrawerSection label="duration" sub={!valid && durationMs <= 0 ? 'invalid' : undefined}>
        <View style={styles.drawerDurationRow}>
          <Text
            style={[
              styles.drawerDurationValue,
              textStyles.tnum,
              !valid && { color: tokens.warn },
            ]}>
            {formatDurationFull(durationMs)}
          </Text>
          {prefs && (
            <Text style={styles.drawerTargetHint}>
              vs {prefs.defaultTargetHours}h target
            </Text>
          )}
        </View>
        {!valid && durationMs <= 0 && (
          <Text style={styles.drawerValidationMsg}>End time must come after start time.</Text>
        )}
        {!valid && endedAt.getTime() > Date.now() && (
          <Text style={styles.drawerValidationMsg}>End time can&apos;t be in the future.</Text>
        )}
      </DrawerSection>
    </Drawer>
  );
}

function formatDurationFull(ms: number): string {
  if (ms <= 0) return '—';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// StreakSection — heatmap card with current/best streak + legend.
//
// We pick `weeks` to fill the available horizontal space at the design's
// fixed 14×14 cell size rather than stretching cells. onLayout on the
// section measures the inner width (after streakWrap's horizontal padding),
// then we subtract the day-labels column + its 6px gap and solve for how
// many weeks fit. Minimum 14 so the heatmap stays a sensible read on a
// narrow device.
// ─────────────────────────────────────────────────────────────────────────────
const STREAK_DAY_LABELS_WIDTH = 14; // M / W / F / S column, minWidth: 10 + slack
const STREAK_LABEL_GAP = 6;
const MIN_WEEKS = 14;

function StreakSection() {
  const [weeks, setWeeks] = useState(MIN_WEEKS);
  const prefs = useFastingPreferences();

  const onSectionLayout = (e: LayoutChangeEvent) => {
    const innerWidth = e.nativeEvent.layout.width - 22 * 2; // streakWrap paddingHorizontal
    const gridWidth = innerWidth - STREAK_DAY_LABELS_WIDTH - STREAK_LABEL_GAP;
    // weeks * CELL + (weeks - 1) * GAP ≤ gridWidth
    //   → weeks ≤ (gridWidth + GAP) / (CELL + GAP)
    const fits = Math.floor((gridWidth + HEATMAP_GAP) / (HEATMAP_CELL + HEATMAP_GAP));
    const next = Math.max(MIN_WEEKS, fits);
    if (next !== weeks) setWeeks(next);
  };

  const history = useFastingHistory(weeks);
  const today = new Date();
  const startDate = new Date(today.getTime() - (weeks * 7 - 1) * 86_400_000);
  const fmtDayMonth = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });
  const startLabel = fmtDayMonth.format(startDate).toLowerCase();
  const endLabel = fmtDayMonth.format(today).toLowerCase();

  return (
    <View style={styles.streakWrap} onLayout={onSectionLayout}>
      <View style={styles.streakHeader}>
        <Text style={[styles.cardLabel, textStyles.cap]}>streak · last {weeks} weeks</Text>
        <Text style={[styles.streakMeta, textStyles.tnum]}>
          current <Text style={styles.streakMetaStrong}>{history.currentStreak}d</Text>
          <Text style={styles.streakMetaDot}>{'  ·  '}</Text>
          best <Text style={styles.streakMetaStrong}>{history.bestStreak}d</Text>
        </Text>
      </View>

      <StreakHeatmap
        cells={history.cells}
        weeks={weeks}
        today={today}
        weekdayBitmask={prefs?.weekdayBitmask}
      />

      <View style={styles.streakLegend}>
        <Text style={styles.streakLegendEdge}>{startLabel}</Text>
        <View style={styles.streakLegendKey}>
          <Text style={styles.streakLegendWord}>less</Text>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <View
              key={l}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: HEAT_COLORS[l],
                borderWidth: l === 0 ? 1 : 0,
                borderColor: tokens.line2,
              }}
            />
          ))}
          <Text style={styles.streakLegendWord}>more</Text>
        </View>
        <Text style={styles.streakLegendEdge}>{endLabel}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroRing — 236px radial, 24 hour ticks, target + elapsed arcs, head dot.
// Center content mirrors between states: idle = READY + START FAST pill +
// target hint; active = ELAPSED + HH:MM:SS counter + END FAST pill.
// ─────────────────────────────────────────────────────────────────────────────
type HeroRingProps = {
  size: number;
  targetHours: number;
  active?: {
    elapsedHours: number;
    elapsedMs: number;
  };
  /** Tap handler for the START pill rendered when there's no active session. */
  onStartFast?: () => void;
  /** Disables the START pill (e.g. while preferences are still loading). */
  startDisabled?: boolean;
  /** Tap handler for the END pill rendered when a session is active. */
  onEndFast?: () => void;
};

function HeroRing({ size, targetHours, active, onStartFast, startDisabled, onEndFast }: HeroRingProps) {
  const sw = 9;
  const r = (size - sw) / 2 - 6;
  const c = 2 * Math.PI * r;
  const elapsedHours = active?.elapsedHours ?? 0;
  const elapsedMs = active?.elapsedMs ?? 0;
  const elapsedFrac = Math.min(1, elapsedHours / 24);
  const targetFrac = Math.min(1, targetHours / 24);
  // Overrun: portion of the elapsed arc past `targetHours`, clamped to a full
  // sweep so a 48h+ fast doesn't double-wrap visually. Drawn in accent on top
  // of the elapsed arc to recolor the overage segment.
  const overrunFrac =
    elapsedHours > targetHours ? Math.min(1 - targetFrac, (elapsedHours - targetHours) / 24) : 0;
  const overrunStartDeg = targetFrac * 360 - 90;

  // current head dot position
  const ang = elapsedFrac * Math.PI * 2 - Math.PI / 2;
  const headX = size / 2 + Math.cos(ang) * r;
  const headY = size / 2 + Math.sin(ang) * r;
  const headInOverrun = overrunFrac > 0;

  // Split the live counter — main HH:MM in big mono, :SS in muted tail
  const counter = formatHMS(elapsedMs);
  const main = counter.slice(0, 5);
  const tail = counter.slice(5); // ":SS"

  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* hour ticks */}
        <G>
          {Array.from({ length: 24 }).map((_, i) => {
            const tickAng = (i / 24) * Math.PI * 2 - Math.PI / 2;
            const rO = r + 9;
            const rI = r + (i % 6 === 0 ? 3 : 5);
            const x1 = size / 2 + Math.cos(tickAng) * rI;
            const y1 = size / 2 + Math.sin(tickAng) * rI;
            const x2 = size / 2 + Math.cos(tickAng) * rO;
            const y2 = size / 2 + Math.sin(tickAng) * rO;
            const major = i % 6 === 0;
            return (
              <Line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? tokens.ink3 : tokens.ink4}
                strokeWidth={major ? 1 : 0.6}
                opacity={major ? 0.6 : 0.35}
              />
            );
          })}
        </G>
        {/* track */}
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tokens.bg2} strokeWidth={sw} />
        {/* target arc — sweep equal to target/24 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tokens.line2}
          strokeWidth={sw}
          strokeDasharray={`${c * targetFrac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="butt"
          opacity={0.7}
        />
        {active && (
          <>
            {/* elapsed arc */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={tokens.ink}
              strokeWidth={sw}
              strokeDasharray={`${c * elapsedFrac} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="round"
            />
            {/* overrun arc — accent-colored overlay from target → elapsed,
                drawn after the elapsed arc so it recolors the overage segment. */}
            {overrunFrac > 0 && (
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={tokens.accent}
                strokeWidth={sw}
                strokeDasharray={`${c * overrunFrac} ${c}`}
                transform={`rotate(${overrunStartDeg} ${size / 2} ${size / 2})`}
                strokeLinecap="round"
              />
            )}
            {/* current head dot — accent fill when riding the overrun segment
                so it reads as a single continuous motion past target. */}
            <Circle
              cx={headX}
              cy={headY}
              r={5}
              fill={tokens.card}
              stroke={headInOverrun ? tokens.accent : tokens.accentInk}
              strokeWidth={2}
            />
            <Circle
              cx={headX}
              cy={headY}
              r={1.6}
              fill={headInOverrun ? tokens.accent : tokens.accentInk}
            />
          </>
        )}
      </Svg>

      <View
        style={StyleSheet.absoluteFill}
        // Idle: allow taps to reach the START pill. Active: let pressables on
        // the wrapping Pressable handle "edit start time" — children are
        // Active: the END FAST pill is the only Pressable inside. Taps in
        // any other inner area fall through to the outer ring Pressable
        // (which handles "edit start time").
        // Idle: the START FAST pill is the only interactive element.
        pointerEvents="box-none">
        <View style={styles.heroCenter}>
          {active ? (
            <>
              <Text style={[styles.heroElapsedLabel, textStyles.cap]}>elapsed</Text>
              <Text style={[styles.heroElapsedTime, textStyles.tnum]}>
                {main}
                <Text style={styles.heroElapsedSeconds}>{tail}</Text>
              </Text>
              <Pressable
                onPress={onEndFast}
                accessibilityRole="button"
                accessibilityLabel="End fast"
                style={({ pressed }) => [
                  styles.heroPrimaryPill,
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={styles.heroPrimaryPillText}>end fast</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.heroIdleLabel, textStyles.cap]}>ready</Text>
              <Pressable
                onPress={onStartFast}
                disabled={startDisabled}
                accessibilityRole="button"
                accessibilityLabel="Start fast"
                style={({ pressed }) => [
                  styles.heroPrimaryPill,
                  startDisabled && { opacity: 0.35 },
                  pressed && !startDisabled && { opacity: 0.85 },
                ]}>
                <Text style={styles.heroPrimaryPillText}>start fast</Text>
              </Pressable>
              <Text style={styles.heroIdleTarget}>
                target {targetHours}h
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EatingDayBar — what shows in the phase-card slot when no fast is active.
// Renders the user's eating schedule (from preferences) as a 24h day strip,
// with a header showing whether they're currently *in* the eating window
// and a footer counting down to the next transition.
// ─────────────────────────────────────────────────────────────────────────────
function EatingDayBar() {
  const prefs = useFastingPreferences();
  if (!prefs) {
    // Reserve the card's visual height so the layout doesn't jump when prefs land.
    return <View style={{ height: 84 }} />;
  }

  const { eatingWindowStartMin: startMin, eatingWindowEndMin: endMin } = prefs;
  const now = nowMinutes();
  const eating = isInWindow(now, startMin, endMin);
  // When inside, the next transition is end → fast starts.
  // When outside, the next transition is start → eating opens.
  const nextEventMin = eating ? endMin : startMin;
  const minsToNext = minutesUntil(now, nextEventMin);

  const phaseLabel = eating ? 'eating window' : 'between meals';
  const footerLabel = eating ? 'fast starts in' : 'eating opens in';

  return (
    <View>
      <View style={styles.phaseHeader}>
        <Text style={[styles.phaseLabel, textStyles.cap]}>
          phase · <Text style={{ textTransform: 'lowercase' }}>{phaseLabel}</Text>
        </Text>
        <Text style={[styles.phaseEta, textStyles.tnum]}>
          {footerLabel}{' '}
          <Text style={{ color: tokens.ink, fontFamily: fonts.monoMedium }}>
            {formatRelative(minsToNext * 60_000)}
          </Text>
        </Text>
      </View>

      <WindowStrip startMin={startMin} endMin={endMin} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PhaseBar — 5 segments + ketosis-in label + bottom labels.
// (Visually distinct from home's smaller PhaseBar — taller, has its own header.)
// ─────────────────────────────────────────────────────────────────────────────
type PhaseBarProps = {
  /** Active session info. When omitted the bar renders an empty/muted state. */
  active?: {
    elapsedHours: number;
    msToNextPhase: number | null;
    phaseLabel: string;
  };
};

function FastingPhaseBar({ active }: PhaseBarProps) {
  const elapsedHours = active?.elapsedHours ?? 0;
  return (
    <View>
      <View style={styles.phaseHeader}>
        <Text style={[styles.phaseLabel, textStyles.cap]}>
          {active ? (
            <>
              phase · <Text style={{ textTransform: 'lowercase' }}>{active.phaseLabel}</Text>
            </>
          ) : (
            'phase'
          )}
        </Text>
        {active && active.msToNextPhase !== null && active.msToNextPhase > 0 && (
          <Text style={[styles.phaseEta, textStyles.tnum]}>
            next in <Text style={{ color: tokens.ink, fontFamily: fonts.monoMedium }}>{formatRelative(active.msToNextPhase)}</Text>
          </Text>
        )}
      </View>

      <View style={styles.phaseRow}>
        {FASTING_PHASES.map((p) => {
          const isPast = active ? elapsedHours >= p.end : false;
          const isCurrent = active ? elapsedHours >= p.start && elapsedHours < p.end : false;
          const isFuture = !active || elapsedHours < p.start;
          const innerPct = isCurrent ? ((elapsedHours - p.start) / (p.end - p.start)) * 100 : 0;
          return (
            <View
              key={p.id}
              style={{
                flex: p.end - p.start,
                height: '100%',
                borderRadius: 3,
                backgroundColor: isPast ? tokens.ink : tokens.bg2,
                opacity: isFuture ? 0.45 : 1,
                borderWidth: 1,
                borderColor: isCurrent ? tokens.ink : 'transparent',
                overflow: 'hidden',
              }}>
              {isCurrent && (
                <View
                  style={{
                    position: 'absolute',
                    top: 1,
                    bottom: 1,
                    left: 1,
                    width: `${innerPct}%`,
                    backgroundColor: tokens.ink,
                    borderRadius: 2,
                  }}
                />
              )}
            </View>
          );
        })}
        {/* now-marker — only when there's a live elapsed value to position from */}
        {active && (
          <View style={[styles.nowMarker, { left: `${(elapsedHours / 24) * 100}%` }]} />
        )}
      </View>

      <View style={styles.phaseLabels}>
        {FASTING_PHASES.map((p) => {
          const isCurrent = active ? elapsedHours >= p.start && elapsedHours < p.end : false;
          return (
            <Text
              key={p.id}
              style={{
                flex: p.end - p.start,
                textAlign: 'left',
                fontFamily: isCurrent ? fonts.monoSemibold : fonts.mono,
                fontSize: 8.5,
                color: isCurrent ? tokens.ink2 : tokens.ink4,
              }}>
              {p.short}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCell — one of three columns in the stat strip.
// ─────────────────────────────────────────────────────────────────────────────
function StatCell({
  label,
  value,
  sub,
  subTone = 'normal',
  tone = 'normal',
  withDivider = true,
}: {
  label: string;
  value: string;
  sub: string;
  /** 'over' switches the sub line to accent ink + medium weight, signalling an overrun. */
  subTone?: 'normal' | 'over';
  /** 'muted' dims the whole cell — used when there's no active session. */
  tone?: 'normal' | 'muted';
  withDivider?: boolean;
}) {
  const muted = tone === 'muted';
  return (
    <View
      style={[
        styles.statCell,
        withDivider && { borderLeftWidth: 1, borderLeftColor: tokens.line },
      ]}>
      <Text style={[styles.statLabel, textStyles.cap]}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          textStyles.tnum,
          muted && { color: tokens.ink4 },
        ]}>
        {value}
      </Text>
      <Text
        style={[
          styles.statSub,
          textStyles.tnum,
          subTone === 'over' && { color: tokens.accentInk, fontFamily: fonts.monoSemibold },
          muted && subTone !== 'over' && { color: tokens.ink4 },
        ]}>
        {sub}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// formatting helpers — colocated since they're only used here.
// ─────────────────────────────────────────────────────────────────────────────
function formatTime(d: Date): string {
  return formatHM(d.getHours() * 3_600_000 + d.getMinutes() * 60_000);
}
function formatWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en', { weekday: 'short' }).format(d).toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },

  cogBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  heroWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroElapsedLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  heroElapsedTime: {
    fontFamily: fonts.monoMedium,
    fontSize: 44,
    color: tokens.ink,
    marginTop: 6,
    letterSpacing: -1.1,
  },
  heroElapsedSeconds: {
    fontSize: 18,
    color: tokens.ink4,
    fontFamily: fonts.mono,
  },
  // Hero center — labels + the shared START/END pill
  heroIdleLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  // Shared by START FAST (idle) and END FAST (active) — same visual weight,
  // since they're symmetric primary actions in their respective states.
  heroPrimaryPill: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    shadowOpacity: 0.18,
  },
  heroPrimaryPillText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.bg,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
  },
  heroIdleTarget: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 0.4,
    marginTop: 12,
  },

  // Stat strip
  statStripWrap: {
    paddingTop: 6,
    paddingHorizontal: 22,
  },
  statStrip: {
    flexDirection: 'row',
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  statCell: {
    flex: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
  },
  statValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: tokens.ink,
    marginTop: 4,
    letterSpacing: -0.32,
  },
  statSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    marginTop: 2,
  },

  // Phase card
  phaseCardWrap: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  phaseCard: {
    padding: 14,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  phaseLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  phaseEta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
  },
  phaseRow: {
    position: 'relative',
    flexDirection: 'row',
    height: 28,
    gap: 2,
  },
  nowMarker: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1,
    backgroundColor: tokens.accentInk,
    borderRadius: 1,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  phaseLabels: {
    flexDirection: 'row',
    marginTop: 6,
    // Match phaseRow's gap so each label sits over its own segment.
    // Without this, the labels cumulatively drift left vs the bar segments.
    gap: 2,
  },

  // Streak section
  streakWrap: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  cardLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  streakMeta: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
  },
  streakMetaStrong: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  streakMetaDot: {
    color: tokens.ink4,
  },
  streakLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  streakLegendEdge: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
    textTransform: 'uppercase',
  },
  streakLegendKey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakLegendWord: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
  },

  // Action button
  actionWrap: {
    // Tightened now that the End Fast primary button moved into the hero
    // ring — only the log-past link lives here.
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  logPastLink: {
    alignSelf: 'center',
    // marginTop dropped — was 12 to separate from a primary button above
    // that no longer exists.
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  logPastLinkText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 0.44,
  },

  // Log-past-fast drawer
  drawerDurationRow: {
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  drawerTargetHint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
  },
  drawerDurationValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.44,
  },
  drawerValidationMsg: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.warn,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
