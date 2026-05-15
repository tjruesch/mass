import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Glyph, SubHeader, TabBar } from '@/components/design';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { updatePreferences } from '@/src/db/queries/fasting-preferences';
import type { FastingPreferences } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const PROTOCOL_OPTIONS = [
  { id: '16:8', sub: '16 fast', defaultTarget: 16, windowLengthMin: 8 * 60 },
  { id: '18:6', sub: '18 fast', defaultTarget: 18, windowLengthMin: 6 * 60 },
  { id: '20:4', sub: 'warrior', defaultTarget: 20, windowLengthMin: 4 * 60 },
  { id: 'OMAD', sub: '23', defaultTarget: 23, windowLengthMin: 1 * 60 },
  { id: 'custom', sub: 'set', defaultTarget: null, windowLengthMin: null },
] as const;

type ProtocolId = (typeof PROTOCOL_OPTIONS)[number]['id'];

const WEEKDAYS: { label: string; bit: number }[] = [
  { label: 'M', bit: 0 },
  { label: 'T', bit: 1 },
  { label: 'W', bit: 2 },
  { label: 'T', bit: 3 },
  { label: 'F', bit: 4 },
  { label: 'S', bit: 5 },
  { label: 'S', bit: 6 },
];

const REMINDERS: {
  key: keyof Pick<
    FastingPreferences,
    | 'reminderBeforeFastStart'
    | 'reminderEatingWindowOpens'
    | 'reminderWeeklySummary'
    | 'reminderStreakCheckIn'
  >;
  name: string;
  sub: string;
}[] = [
  { key: 'reminderBeforeFastStart', name: '15 min before fast starts', sub: 'evening reminder' },
  { key: 'reminderEatingWindowOpens', name: 'eating window opens', sub: 'morning · window start' },
  { key: 'reminderWeeklySummary', name: 'weekly summary', sub: 'sunday · 18:00' },
  { key: 'reminderStreakCheckIn', name: 'streak check-in', sub: 'after each session' },
];

export default function FastingSettingsScreen() {
  const router = useRouter();
  const prefs = useFastingPreferences();

  // Local buffer for the in-flight eating-window drag. Kept set after commit
  // until prefs reflects the new values (cleared by the effect below) so the
  // strip and stats don't flash through stale values for a frame.
  const [dragWindow, setDragWindow] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (
      dragWindow &&
      prefs &&
      prefs.eatingWindowStartMin === dragWindow.start &&
      prefs.eatingWindowEndMin === dragWindow.end
    ) {
      setDragWindow(null);
    }
  }, [prefs, dragWindow]);

  if (!prefs) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;

  const windowStart = dragWindow?.start ?? prefs.eatingWindowStartMin;
  const windowEnd = dragWindow?.end ?? prefs.eatingWindowEndMin;

  const writeFail = (err: unknown) =>
    console.warn('Failed to update fasting preferences:', err);

  // Every interaction auto-commits — no save button, no dirty check.
  const onSelectProtocol = (proto: typeof PROTOCOL_OPTIONS[number]) => {
    const patch: Partial<FastingPreferences> = { protocol: proto.id };
    if (proto.defaultTarget !== null) patch.defaultTargetHours = proto.defaultTarget;
    if (proto.windowLengthMin !== null) {
      // Keep window start fixed; move end to start + length.
      patch.eatingWindowEndMin = (prefs.eatingWindowStartMin + proto.windowLengthMin) % (24 * 60);
    }
    updatePreferences(patch).catch(writeFail);
  };

  const onToggleWeekday = (bit: number) => {
    updatePreferences({ weekdayBitmask: prefs.weekdayBitmask ^ (1 << bit) }).catch(writeFail);
  };

  const onToggleReminder = (key: typeof REMINDERS[number]['key']) => {
    updatePreferences({ [key]: !prefs[key] }).catch(writeFail);
  };

  // ── Drag handlers ───────────────────────────────────────────────────────
  // Buffer locally during the drag (so stats + strip update fluidly without
  // hitting SQLite per snap step); commit a single write on lift.
  const onShiftStart = () => {
    setDragWindow({ start: prefs.eatingWindowStartMin, end: prefs.eatingWindowEndMin });
  };
  const onShift = (deltaMin: number) => {
    setDragWindow((prev) => {
      if (!prev) return prev;
      const length = windowLengthMin(prev.start, prev.end);
      const newStart = wrapMin(prev.start + deltaMin);
      return { start: newStart, end: wrapMin(newStart + length) };
    });
  };
  const onShiftCommit = () => {
    setDragWindow((prev) => {
      if (prev) {
        updatePreferences({
          eatingWindowStartMin: prev.start,
          eatingWindowEndMin: prev.end,
        }).catch(writeFail);
      }
      // Keep until prefs catches up — useEffect above clears the buffer
      // once they match, avoiding a one-frame flash through old values.
      return prev;
    });
  };
  const onShiftAbort = () => setDragWindow(null);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Fasting · settings" back="Fasting" onBack={() => router.back()} />

        {/* PROTOCOL */}
        <Section label="protocol" sub="select your fasting ratio">
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {PROTOCOL_OPTIONS.map((p) => (
              <ProtocolChip
                key={p.id}
                label={p.id}
                sub={p.sub}
                active={prefs.protocol === p.id}
                onPress={() => onSelectProtocol(p)}
              />
            ))}
          </View>
        </Section>

        {/* EATING WINDOW */}
        <Section
          label="eating window"
          sub={`${formatWindowLength(windowStart, windowEnd)} · ${formatMinutes(windowStart)} → ${formatMinutes(windowEnd)}`}>
          <View style={styles.windowCard}>
            <View style={styles.windowStatsRow}>
              <WindowStat label="start" value={formatMinutes(windowStart)} withDivider={false} />
              <WindowStat label="end" value={formatMinutes(windowEnd)} />
              <WindowStat label="length" value={formatWindowLength(windowStart, windowEnd)} />
            </View>
            <WindowStrip
              startMin={windowStart}
              endMin={windowEnd}
              onShiftStart={onShiftStart}
              onShift={onShift}
              onShiftCommit={onShiftCommit}
              onShiftAbort={onShiftAbort}
            />
          </View>
        </Section>

        {/* WEEKLY SCHEDULE */}
        <Section label="weekly schedule" sub="apply on these days">
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {WEEKDAYS.map((d, i) => {
              const on = (prefs.weekdayBitmask & (1 << d.bit)) !== 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => onToggleWeekday(d.bit)}
                  style={[styles.dayCircle, on ? styles.dayCircleOn : styles.dayCircleOff]}>
                  <Text style={[styles.dayCircleText, on && { color: tokens.bg }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.weeklySummary}>{summarizeWeekdays(prefs.weekdayBitmask)}</Text>
        </Section>

        {/* REMINDERS */}
        <Section label="reminders">
          <View style={styles.cardList}>
            {REMINDERS.map((r, i) => (
              <View
                key={r.key}
                style={[
                  styles.cardRow,
                  i < REMINDERS.length - 1 && { borderBottomWidth: 1, borderBottomColor: tokens.line },
                ]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardRowName}>{r.name}</Text>
                  <Text style={styles.cardRowSub}>{r.sub}</Text>
                </View>
                <Switch on={prefs[r.key]} onToggle={() => onToggleReminder(r.key)} />
              </View>
            ))}
          </View>
          <Text style={styles.reminderNote}>
            notifications aren't scheduled yet — toggles only save the preference for now.
          </Text>
        </Section>

        {/* GOALS — render-only for now (depend on more history / meals data) */}
        <Section label="goals">
          <View style={[styles.cardList, { padding: 14 }]}>
            <GoalRow name="weekly adherence" value={`${prefs.weeklyAdherenceTarget} / 7 days`} sub="min target" />
            <GoalRow name="streak target" value={`${prefs.streakTarget} days`} sub="next goal: 100" />
            <GoalRow name="auto-detect start" value="from food logs" sub="experimental" last />
          </View>
        </Section>
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — header (label + sub) + body slot.
// ─────────────────────────────────────────────────────────────────────────────
function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 22, marginTop: 18 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, textStyles.cap]}>{label}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function ProtocolChip({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.protocolChip, active ? styles.protocolChipActive : styles.protocolChipInactive]}>
      <Text style={[styles.protocolLabel, active && { color: tokens.bg }, textStyles.tnum]}>{label}</Text>
      <Text style={[styles.protocolSub, active && { color: tokens.bg, opacity: 0.6 }]}>{sub}</Text>
    </Pressable>
  );
}

function WindowStat({ label, value, withDivider = true }: { label: string; value: string; withDivider?: boolean }) {
  return (
    <View
      style={[
        styles.windowStat,
        withDivider && { borderLeftWidth: 1, borderLeftColor: tokens.line },
      ]}>
      <Text style={[styles.windowStatLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.windowStatValue, textStyles.tnum]}>{value}</Text>
    </View>
  );
}

/**
 * 24-hour strip showing the eating window and a "now" marker.
 * Wraps midnight gracefully — if endMin < startMin, draws two rectangles.
 *
 * Drag lifecycle (when handlers are provided): a horizontal pan translates
 * the whole window with 15-min snapping. `onShiftStart` fires when the
 * gesture is recognized; `onShift(delta)` emits each snap-step's
 * incremental delta; `onShiftCommit` fires on lift (success);
 * `onShiftAbort` fires when the gesture is cancelled (e.g. parent scroll
 * claims it). Parents are expected to buffer state during the drag and
 * commit a single write at the end.
 */
const SNAP_MIN = 15;

function WindowStrip({
  startMin,
  endMin,
  onShiftStart,
  onShift,
  onShiftCommit,
  onShiftAbort,
}: {
  startMin: number;
  endMin: number;
  onShiftStart?: () => void;
  onShift?: (deltaMin: number) => void;
  onShiftCommit?: () => void;
  onShiftAbort?: () => void;
}) {
  const totalMin = 24 * 60;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const widthRef = useRef(0);
  const lastSnappedDelta = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const interactive = !!(onShiftStart || onShift || onShiftCommit);

  // Build the Pan gesture lazily so non-interactive strips don't pay for it.
  const pan = useMemo(() => {
    return Gesture.Pan()
      // Activate on horizontal motion only — lets the parent ScrollView keep vertical scrolls.
      .activeOffsetX([-4, 4])
      .failOffsetY([-12, 12])
      // Don't lose the gesture when the finger moves outside the strip bounds.
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        lastSnappedDelta.current = 0;
        onShiftStart?.();
      })
      .onUpdate((e) => {
        if (!onShift || widthRef.current === 0) return;
        const rawDeltaMin = (e.translationX / widthRef.current) * totalMin;
        const snapped = Math.round(rawDeltaMin / SNAP_MIN) * SNAP_MIN;
        if (snapped !== lastSnappedDelta.current) {
          const incremental = snapped - lastSnappedDelta.current;
          lastSnappedDelta.current = snapped;
          onShift(incremental);
        }
      })
      .onEnd(() => onShiftCommit?.())
      // Fires on success OR cancel — only revert on the latter.
      .onFinalize((_, success) => {
        if (!success) onShiftAbort?.();
      })
      // runOnJS so callbacks reach the JS thread where state lives.
      .runOnJS(true);
  }, [onShiftStart, onShift, onShiftCommit, onShiftAbort, totalMin]);

  const segments: { left: number; width: number }[] = [];
  if (endMin > startMin) {
    segments.push({ left: (startMin / totalMin) * 100, width: ((endMin - startMin) / totalMin) * 100 });
  } else if (endMin < startMin) {
    segments.push({ left: (startMin / totalMin) * 100, width: ((totalMin - startMin) / totalMin) * 100 });
    segments.push({ left: 0, width: (endMin / totalMin) * 100 });
  }

  const stripBody = (
    <View style={styles.windowStripBg} onLayout={onLayout}>
      {segments.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${s.left}%`,
            width: `${s.width}%`,
            backgroundColor: tokens.ink,
          }}
        />
      ))}
      {[0, 6, 12, 18].map((h) => (
        <View
          key={h}
          style={{
            position: 'absolute',
            left: `${(h * 60) / totalMin * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: tokens.line2,
            opacity: 0.5,
          }}
        />
      ))}
      <View style={[styles.windowNowMarker, { left: `${(nowMin / totalMin) * 100}%` }]} />
      {interactive && (
        // Grip hint at the window's midpoint so users discover it's draggable.
        <View
          pointerEvents="none"
          style={[
            styles.windowGrip,
            { left: `${(wrapMin(startMin + windowLengthMin(startMin, endMin) / 2) / totalMin) * 100}%` },
          ]}
        />
      )}
    </View>
  );

  return (
    <View>
      {interactive ? <GestureDetector gesture={pan}>{stripBody}</GestureDetector> : stripBody}
      <View style={styles.windowTickRow}>
        {['00', '06', '12', '18', '24'].map((t) => (
          <Text key={t} style={styles.windowTickText}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      style={[styles.switch, { backgroundColor: on ? tokens.accentInk : tokens.bg2, borderColor: on ? tokens.accentInk : tokens.line }]}>
      <View style={[styles.switchKnob, { left: on ? 18 : 2 }]} />
    </Pressable>
  );
}

function GoalRow({ name, value, sub, last = false }: { name: string; value: string; sub: string; last?: boolean }) {
  return (
    <View
      style={[
        styles.goalRow,
        !last && { borderBottomWidth: 1, borderBottomColor: tokens.line },
      ]}>
      <View>
        <Text style={styles.goalName}>{name}</Text>
        <Text style={styles.goalSub}>{sub}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text style={[styles.goalValue, textStyles.tnum]}>{value}</Text>
        <Glyph name="chev" color={tokens.ink4} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatWindowLength(startMin: number, endMin: number): string {
  const length = windowLengthMin(startMin, endMin);
  const h = Math.floor(length / 60);
  const m = length % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function windowLengthMin(startMin: number, endMin: number): number {
  let length = endMin - startMin;
  if (length <= 0) length += 24 * 60;
  return length;
}

/** Bring `min` into [0, 1440). Negatives wrap, so dragging left past midnight rolls around. */
function wrapMin(min: number): number {
  const total = 24 * 60;
  return ((min % total) + total) % total;
}

function summarizeWeekdays(bitmask: number): string {
  let count = 0;
  for (let i = 0; i < 7; i++) if (bitmask & (1 << i)) count++;
  const weekendsOff = !(bitmask & (1 << 5)) && !(bitmask & (1 << 6));
  if (count === 0) return 'no active days';
  if (count === 7) return 'every day';
  if (weekendsOff && count === 5) return '5 active days · weekends off';
  return `${count} active day${count === 1 ? '' : 's'}`;
}

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
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sectionSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    fontStyle: 'italic',
  },

  // Protocol chips
  protocolChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    gap: 2,
  },
  protocolChipActive: {
    backgroundColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.10,
  },
  protocolChipInactive: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  protocolLabel: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.13,
  },
  protocolSub: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.28,
    textTransform: 'uppercase',
    color: tokens.ink2,
    opacity: 0.55,
  },

  // Eating window card
  windowCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  windowStatsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  windowStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  windowStatLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.87,
  },
  windowStatValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 18,
    color: tokens.ink,
    marginTop: 4,
    letterSpacing: -0.36,
  },
  windowStripBg: {
    position: 'relative',
    height: 28,
    backgroundColor: tokens.bg2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  windowNowMarker: {
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
  windowGrip: {
    // Subtle "grab handle" hint — kept lightweight so it doesn't fight the design.
    position: 'absolute',
    top: '50%',
    marginTop: -1,
    marginLeft: -8,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: tokens.bg,
    opacity: 0.45,
  },
  windowTickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  windowTickText: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 0.34,
  },

  // Weekly schedule
  dayCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleOn: {
    backgroundColor: tokens.ink,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.10,
  },
  dayCircleOff: {
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
  },
  dayCircleText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 0.66,
  },
  weeklySummary: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 8,
  },

  // Card list (reminders + goals)
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  reminderNote: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 8,
    fontStyle: 'italic',
    letterSpacing: 0.36,
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

  // Goals
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  goalName: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: tokens.ink,
  },
  goalSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
    letterSpacing: 0.36,
  },
  goalValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: tokens.ink,
  },
});
