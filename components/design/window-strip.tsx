import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { nowMinutes, windowLengthMin, wrapMin } from '@/src/lib/time';
import { fonts, tokens } from '@/theme/tokens';

const TOTAL_MIN = 24 * 60;
const SNAP_MIN = 15;

type Props = {
  /** Eating-window start, in minutes since midnight (0..1439). */
  startMin: number;
  /** Eating-window end, in minutes since midnight (0..1439). May be ≤ startMin to wrap midnight. */
  endMin: number;
  /**
   * When all drag handlers are omitted, the strip is purely display.
   * When any are provided, a horizontal pan with 15-min snapping is wired
   * up. `onShiftStart` fires at gesture begin, `onShift(deltaMin)` emits
   * each snap-step's incremental delta, `onShiftCommit` fires on lift
   * (success), `onShiftAbort` on cancellation.
   */
  onShiftStart?: () => void;
  onShift?: (deltaMin: number) => void;
  onShiftCommit?: () => void;
  onShiftAbort?: () => void;
};

/**
 * 24-hour strip with the eating window rendered as a dark bar and the
 * current time of day marked by a glowing vertical line. Wraps midnight
 * cleanly — if `endMin < startMin`, two segments are drawn.
 *
 * Used by `fasting-settings` (interactive — drag to translate the window)
 * and by the idle phase card on `fasting` (display only).
 */
export function WindowStrip({
  startMin,
  endMin,
  onShiftStart,
  onShift,
  onShiftCommit,
  onShiftAbort,
}: Props) {
  const widthRef = useRef(0);
  const lastSnappedDelta = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const interactive = !!(onShiftStart || onShift || onShiftCommit);

  const pan = useMemo(() => {
    return Gesture.Pan()
      // Activate on horizontal motion only — lets a parent ScrollView keep vertical scrolls.
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
        const rawDeltaMin = (e.translationX / widthRef.current) * TOTAL_MIN;
        const snapped = Math.round(rawDeltaMin / SNAP_MIN) * SNAP_MIN;
        if (snapped !== lastSnappedDelta.current) {
          const incremental = snapped - lastSnappedDelta.current;
          lastSnappedDelta.current = snapped;
          onShift(incremental);
        }
      })
      .onEnd(() => onShiftCommit?.())
      .onFinalize((_, success) => {
        if (!success) onShiftAbort?.();
      })
      .runOnJS(true);
  }, [onShiftStart, onShift, onShiftCommit, onShiftAbort]);

  const nowMin = nowMinutes();
  const segments: { left: number; width: number }[] = [];
  if (endMin > startMin) {
    segments.push({ left: (startMin / TOTAL_MIN) * 100, width: ((endMin - startMin) / TOTAL_MIN) * 100 });
  } else if (endMin < startMin) {
    segments.push({ left: (startMin / TOTAL_MIN) * 100, width: ((TOTAL_MIN - startMin) / TOTAL_MIN) * 100 });
    segments.push({ left: 0, width: (endMin / TOTAL_MIN) * 100 });
  }

  const stripBody = (
    <View style={styles.stripBg} onLayout={onLayout}>
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
            left: `${((h * 60) / TOTAL_MIN) * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: tokens.line2,
            opacity: 0.5,
          }}
        />
      ))}
      <View style={[styles.nowMarker, { left: `${(nowMin / TOTAL_MIN) * 100}%` }]} />
      {interactive && (
        // Grip hint at the window's midpoint so users discover it's draggable.
        <View
          pointerEvents="none"
          style={[
            styles.grip,
            { left: `${(wrapMin(startMin + windowLengthMin(startMin, endMin) / 2) / TOTAL_MIN) * 100}%` },
          ]}
        />
      )}
    </View>
  );

  return (
    <View>
      {interactive ? <GestureDetector gesture={pan}>{stripBody}</GestureDetector> : stripBody}
      <View style={styles.tickRow}>
        {['00', '06', '12', '18', '24'].map((t) => (
          <Text key={t} style={styles.tickText}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stripBg: {
    position: 'relative',
    height: 28,
    backgroundColor: tokens.bg2,
    borderRadius: 4,
    overflow: 'hidden',
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
  grip: {
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
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tickText: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 0.34,
  },
});
