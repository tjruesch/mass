import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { DateTimePickerSheet, Glyph, HEAT_COLORS, StreakHeatmap, SubHeader, TabBar } from '@/components/design';
import { endSession, startSession, updateSessionStart } from '@/src/db/queries/fasting';
import { useFasting, useFastingHistory, type FastingState } from '@/src/hooks/use-fasting';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { FASTING_PHASES, formatHM, formatHMS, formatRelative } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const TARGET_OPTIONS = [13, 14, 16, 18, 20, 24] as const;

export default function FastingScreen() {
  const router = useRouter();
  const state = useFasting(1000);

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

        {state.status === 'active' ? <ActiveView state={state} /> : <IdleView />}
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE — hero ring, stat strip, phase timeline, end-fast button.
// ─────────────────────────────────────────────────────────────────────────────
function ActiveView({ state }: { state: Extract<FastingState, { status: 'active' }> }) {
  const { session, elapsedMs, elapsedHours, msToNextPhase, msToTarget, progress, currentPhase } = state;
  const startedAt = session.startedAt;
  const projectedEnd = new Date(startedAt.getTime() + session.targetHours * 3_600_000);

  // Tap-to-edit on the hero ring opens the start-time picker sheet.
  const [editingStart, setEditingStart] = useState(false);

  const handleEndFast = useCallback(() => {
    Alert.alert(
      'End fast?',
      `You're ${(progress * 100).toFixed(0)}% to your ${session.targetHours}h target.`,
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
  }, [progress, session.targetHours]);

  const handleStartTimeApply = useCallback(
    (newStartedAt: Date) => {
      updateSessionStart(session.id, newStartedAt)
        .then(() => setEditingStart(false))
        .catch((err) => Alert.alert('Failed to update', err.message));
    },
    [session.id],
  );

  // 72h cap matches updateSessionStart's validation; iOS spinner enforces visually.
  const minStart = new Date(Date.now() - 72 * 3_600_000);
  const maxStart = new Date();

  return (
    <>
      {/* HERO RING — tap to edit start time */}
      <View style={styles.heroWrap}>
        <Pressable
          onPress={() => setEditingStart(true)}
          accessibilityRole="button"
          accessibilityLabel="Edit start time"
          style={({ pressed }) => pressed && { opacity: 0.85 }}>
          <HeroRing
            size={236}
            elapsedHours={elapsedHours}
            targetHours={session.targetHours}
            elapsedMs={elapsedMs}
            phaseLabel={currentPhase.short}
          />
        </Pressable>
      </View>

      {/* STAT STRIP */}
      <View style={styles.statStripWrap}>
        <View style={styles.statStrip}>
          <StatCell
            label="started"
            value={formatTime(startedAt)}
            sub={formatWeekday(startedAt)}
            withDivider={false}
          />
          <StatCell
            label="projected"
            value={formatTime(projectedEnd)}
            sub={msToTarget > 0 ? `in ${formatRelative(msToTarget)}` : `${formatRelative(-msToTarget)} over`}
            subTone={msToTarget < 0 ? 'over' : 'normal'}
          />
          <StatCell
            label="target"
            value={`${session.targetHours.toString().padStart(2, '0')}:00`}
            sub={msToTarget < 0 ? `+${formatRelative(-msToTarget)} over` : `${(progress * 100).toFixed(1)}%`}
            subTone={msToTarget < 0 ? 'over' : 'normal'}
          />
        </View>
      </View>

      {/* PHASE TIMELINE CARD */}
      <View style={styles.phaseCardWrap}>
        <View style={styles.phaseCard}>
          <FastingPhaseBar
            elapsedHours={elapsedHours}
            msToNextPhase={msToNextPhase}
            phaseLabel={currentPhase.label}
          />
        </View>
      </View>

      {/* STREAK HEATMAP */}
      <StreakSection />

      {/* END FAST BUTTON */}
      <View style={styles.actionWrap}>
        <Pressable onPress={handleEndFast} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryBtnText}>end fast</Text>
          <Svg width={10} height={10} viewBox="0 0 10 10">
            <Path
              d="M3 2l3 3-3 3"
              stroke={tokens.accent}
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      <DateTimePickerSheet
        open={editingStart}
        value={startedAt}
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
// IDLE — choose a target and start a fast.
// ─────────────────────────────────────────────────────────────────────────────
function IdleView() {
  const prefs = useFastingPreferences();
  const [target, setTarget] = useState<number | null>(null);
  // Seed once prefs load so users land on their preferred protocol.
  useEffect(() => {
    if (target === null && prefs) setTarget(prefs.defaultTargetHours);
  }, [prefs, target]);

  const handleStart = useCallback(() => {
    if (target === null) return;
    startSession({ targetHours: target }).catch((err) => Alert.alert('Failed to start', err.message));
  }, [target]);

  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
      <Text style={[styles.idleLabel, textStyles.cap]}>no active fast</Text>
      <Text style={styles.idleHeading}>Choose a target.</Text>

      <View style={styles.targetGrid}>
        {TARGET_OPTIONS.map((h) => {
          const isActive = h === target;
          return (
            <Pressable
              key={h}
              onPress={() => setTarget(h)}
              style={[styles.targetChip, isActive && styles.targetChipActive]}>
              <Text style={[styles.targetChipText, isActive && styles.targetChipTextActive]}>{h}h</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={handleStart} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, { marginTop: 24 }]}>
        <Text style={styles.primaryBtnText}>start fast</Text>
        <Svg width={10} height={10} viewBox="0 0 10 10">
          <Path
            d="M3 2l3 3-3 3"
            stroke={tokens.accent}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StreakSection — heatmap card with current/best streak + legend.
// ─────────────────────────────────────────────────────────────────────────────
const WEEKS = 14;

function StreakSection() {
  const history = useFastingHistory(WEEKS);
  const today = new Date();
  const startDate = new Date(today.getTime() - (WEEKS * 7 - 1) * 86_400_000);
  const fmtDayMonth = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });
  const startLabel = fmtDayMonth.format(startDate).toLowerCase();
  const endLabel = fmtDayMonth.format(today).toLowerCase();

  return (
    <View style={styles.streakWrap}>
      <View style={styles.streakHeader}>
        <Text style={[styles.cardLabel, textStyles.cap]}>streak · last {WEEKS} weeks</Text>
        <Text style={[styles.streakMeta, textStyles.tnum]}>
          current <Text style={styles.streakMetaStrong}>{history.currentStreak}d</Text>
          <Text style={styles.streakMetaDot}>{'  ·  '}</Text>
          best <Text style={styles.streakMetaStrong}>{history.bestStreak}d</Text>
        </Text>
      </View>

      <StreakHeatmap cells={history.cells} weeks={WEEKS} today={today} />

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
                borderColor: tokens.line,
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
// ─────────────────────────────────────────────────────────────────────────────
type HeroRingProps = {
  size: number;
  elapsedHours: number;
  targetHours: number;
  elapsedMs: number;
  phaseLabel: string;
};

function HeroRing({ size, elapsedHours, targetHours, elapsedMs, phaseLabel }: HeroRingProps) {
  const sw = 9;
  const r = (size - sw) / 2 - 6;
  const c = 2 * Math.PI * r;
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
        {/* overrun arc — accent-colored overlay from target → elapsed, drawn
            after the elapsed arc so it recolors the overage segment. */}
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
        {/* current head dot — accent fill when riding the overrun segment so
            it reads as a single continuous motion past target. */}
        <Circle
          cx={headX}
          cy={headY}
          r={5}
          fill={tokens.card}
          stroke={headInOverrun ? tokens.accent : tokens.accentInk}
          strokeWidth={2}
        />
        <Circle cx={headX} cy={headY} r={1.6} fill={headInOverrun ? tokens.accent : tokens.accentInk} />
      </Svg>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.heroCenter}>
          <Text style={[styles.heroElapsedLabel, textStyles.cap]}>elapsed</Text>
          <Text style={[styles.heroElapsedTime, textStyles.tnum]}>
            {main}
            <Text style={styles.heroElapsedSeconds}>{tail}</Text>
          </Text>
          <View style={styles.heroPhaseChip}>
            <View style={styles.heroPhaseDot} />
            <Text style={[styles.heroPhaseText, textStyles.cap]}>{phaseLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PhaseBar — 5 segments + ketosis-in label + bottom labels.
// (Visually distinct from home's smaller PhaseBar — taller, has its own header.)
// ─────────────────────────────────────────────────────────────────────────────
type PhaseBarProps = {
  elapsedHours: number;
  msToNextPhase: number | null;
  phaseLabel: string;
};

function FastingPhaseBar({ elapsedHours, msToNextPhase, phaseLabel }: PhaseBarProps) {
  return (
    <View>
      <View style={styles.phaseHeader}>
        <Text style={[styles.phaseLabel, textStyles.cap]}>
          phase · <Text style={{ textTransform: 'lowercase' }}>{phaseLabel}</Text>
        </Text>
        {msToNextPhase !== null && msToNextPhase > 0 && (
          <Text style={[styles.phaseEta, textStyles.tnum]}>
            next in <Text style={{ color: tokens.ink, fontFamily: fonts.monoMedium }}>{formatRelative(msToNextPhase)}</Text>
          </Text>
        )}
      </View>

      <View style={styles.phaseRow}>
        {FASTING_PHASES.map((p) => {
          const isPast = elapsedHours >= p.end;
          const isCurrent = elapsedHours >= p.start && elapsedHours < p.end;
          const isFuture = elapsedHours < p.start;
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
        {/* now-marker */}
        <View style={[styles.nowMarker, { left: `${(elapsedHours / 24) * 100}%` }]} />
      </View>

      <View style={styles.phaseLabels}>
        {FASTING_PHASES.map((p) => {
          const isCurrent = elapsedHours >= p.start && elapsedHours < p.end;
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
  withDivider = true,
}: {
  label: string;
  value: string;
  sub: string;
  /** 'over' switches the sub line to accent ink + medium weight, signalling an overrun. */
  subTone?: 'normal' | 'over';
  withDivider?: boolean;
}) {
  return (
    <View
      style={[
        styles.statCell,
        withDivider && { borderLeftWidth: 1, borderLeftColor: tokens.line },
      ]}>
      <Text style={[styles.statLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.statValue, textStyles.tnum]}>{value}</Text>
      <Text
        style={[
          styles.statSub,
          textStyles.tnum,
          subTone === 'over' && { color: tokens.accentInk, fontFamily: fonts.monoSemibold },
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
  heroPhaseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: tokens.bg2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  heroPhaseDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  heroPhaseText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink2,
    letterSpacing: 1.62,
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
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    shadowOpacity: 0.10,
  },
  primaryBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: tokens.bg,
  },

  // Idle (no session)
  idleLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  idleHeading: {
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    letterSpacing: -0.6,
    marginTop: 6,
    color: tokens.ink,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 24,
  },
  targetChip: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.line,
    backgroundColor: tokens.card,
  },
  targetChipActive: {
    backgroundColor: tokens.ink,
    borderColor: tokens.ink,
  },
  targetChipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.14,
  },
  targetChipTextActive: {
    color: tokens.bg,
  },
});
