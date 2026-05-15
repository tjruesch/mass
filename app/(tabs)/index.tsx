import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { TabBar } from '@/components/design';
import { useFasting } from '@/src/hooks/use-fasting';
import { FASTING_PHASES, formatHM, formatHMS, formatRelative } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Hero rings — three concentric kcal/h2o/move arcs, no center label.
// ─────────────────────────────────────────────────────────────────────────────
function Concentric({ size = 138 }: { size?: number }) {
  const rings = [
    { rOff: 0, pct: 0.264, c: tokens.ink, sw: 11 },
    { rOff: 17, pct: 0.617, c: tokens.cool, sw: 11 },
    { rOff: 34, pct: 0.42, c: tokens.accentInk, sw: 11 },
  ];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {rings.map((r, i) => {
          const radius = (size - 12) / 2 - r.rOff;
          const c = 2 * Math.PI * radius;
          return (
            <View key={i}>
              {/* track */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={tokens.bg2}
                strokeWidth={r.sw}
              />
              {/* progress */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={r.c}
                strokeWidth={r.sw}
                strokeDasharray={`${c * r.pct} ${c}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </View>
          );
        })}
      </Svg>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend row — color swatch + label + value/unit + pct/target.
// ─────────────────────────────────────────────────────────────────────────────
type LegendProps = {
  swatch: string;
  label: string;
  value: string;
  unit?: string;
  target: string;
  pct: string;
};

function Legend({ swatch, label, value, unit, target, pct }: LegendProps) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.legendLabel, textStyles.cap]}>{label}</Text>
        <Text style={[styles.legendValue, textStyles.tnum]}>
          {value}
          {unit ? <Text style={styles.legendUnit}> {unit}</Text> : null}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.legendPct, textStyles.tnum]}>{pct}</Text>
        <Text style={[styles.legendTarget, textStyles.tnum]}>{target}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase bar — 5 segments + animated "now" marker driven by current elapsed.
// ─────────────────────────────────────────────────────────────────────────────
function PhaseBar({ elapsedHours }: { elapsedHours: number }) {
  return (
    <View>
      <View style={styles.phaseRow}>
        {FASTING_PHASES.map((p) => {
          const isPast = elapsedHours >= p.end;
          const isCurrent = elapsedHours >= p.start && elapsedHours < p.end;
          const isFuture = elapsedHours < p.start;
          const flex = p.end - p.start;
          const innerWidthPct = isCurrent ? ((elapsedHours - p.start) / (p.end - p.start)) * 100 : 0;
          return (
            <View
              key={p.id}
              style={{
                flex,
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
                    width: `${innerWidthPct}%`,
                    backgroundColor: tokens.ink,
                    borderRadius: 2,
                  }}
                />
              )}
            </View>
          );
        })}
        {/* "Now" marker — vertical accent line at current elapsed % */}
        <View
          style={[styles.nowMarker, { left: `${(Math.min(elapsedHours, 24) / 24) * 100}%` }]}
        />
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
                fontSize: 8,
                letterSpacing: 0.32,
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
// Screen.
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const fasting = useFasting(1000);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── 1. Greeting block ─────────────────────────────────── */}
        <View style={styles.greetingWrap}>
          <View style={styles.greetingTopRow}>
            <Text style={[styles.dateline, textStyles.cap]}>
              thu 14 may <Text style={styles.datelineDot}> · </Text>09:41
            </Text>
            <View style={styles.streakChip}>
              <View style={styles.streakDot} />
              <Text style={styles.streakText}>streak 12d</Text>
            </View>
          </View>
          <Text style={styles.greetingHeading}>
            Morning, <Text style={styles.greetingHeadingName}>Sam.</Text>
          </Text>
          <Text style={styles.greetingSub}>
            {fasting.status === 'active' && fasting.msToNextPhase !== null && fasting.msToNextPhase > 0 ? (
              <>
                <Text>fasting </Text>
                <Text style={styles.greetingSubStrong}>{formatRelative(fasting.msToNextPhase)}</Text>
                <Text style={styles.greetingSubMute}> to {fasting.nextPhase?.short ?? 'next phase'}</Text>
              </>
            ) : fasting.status === 'active' ? (
              <>
                <Text>fasting </Text>
                <Text style={styles.greetingSubStrong}>{formatHM(fasting.elapsedMs)}</Text>
                <Text style={styles.greetingSubMute}> elapsed</Text>
              </>
            ) : (
              <Text style={styles.greetingSubMute}>no active fast</Text>
            )}
            <Text style={styles.greetingSubMute}>{'  ·  '}</Text>
            {/* TODO(goals slice): wire 'day 14 / 28' to active goal */}
            <Text style={styles.greetingSubStrong}>day 14</Text>
            <Text style={styles.greetingSubMute}> / 28</Text>
          </Text>
        </View>

        {/* ── 2. Hero rings card ────────────────────────────────── */}
        <View style={styles.cardOuter}>
          <View style={[styles.card, styles.heroCard]}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={[styles.cardLabel, textStyles.cap]}>daily rings</Text>
                <Text style={styles.heroTitle}>On pace</Text>
              </View>
              <View style={styles.liveChip}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveText, textStyles.cap]}>live</Text>
              </View>
            </View>
            <View style={styles.heroBody}>
              <Concentric size={138} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Legend swatch={tokens.ink} label="kcal" value="480" target="of 1820" pct="26%" />
                <View style={styles.legendDivider} />
                <Legend swatch={tokens.cool} label="h2o" value="1.85" unit="L" target="of 3.0" pct="62%" />
                <View style={styles.legendDivider} />
                <Legend swatch={tokens.accentInk} label="move" value="42" unit="min" target="of 100" pct="42%" />
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. Fasting card ───────────────────────────────────── */}
        <View style={styles.cardOuterTight}>
          <Pressable onPress={() => router.push('/fasting')}>
            {({ pressed }) => (
              <View style={[styles.card, styles.fastingCard, pressed && { opacity: 0.94 }]}>
                <View style={styles.fastingHeader}>
                  <Text style={[styles.cardLabel, textStyles.cap]}>fasting</Text>
                  {fasting.status === 'active' && (
                    <View style={styles.fastingChip}>
                      <View style={styles.streakDot} />
                      <Text style={styles.fastingChipText}>{fasting.currentPhase.short}</Text>
                    </View>
                  )}
                </View>

                {fasting.status === 'active' ? (
                  <>
                    <View style={styles.fastingTimes}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text style={[styles.fastingElapsed, textStyles.tnum]}>
                          {formatHMS(fasting.elapsedMs).slice(0, 5)}
                          <Text style={styles.fastingElapsedSeconds}>
                            {formatHMS(fasting.elapsedMs).slice(5)}
                          </Text>
                        </Text>
                        <Text style={styles.fastingElapsedLabel}>elapsed</Text>
                      </View>
                      {fasting.nextPhase && fasting.msToNextPhase !== null && fasting.msToNextPhase > 0 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.fastingKetoLabel, textStyles.cap]}>
                            {fasting.nextPhase.short} in
                          </Text>
                          <Text style={[styles.fastingKetoTime, textStyles.tnum]}>
                            {formatRelative(fasting.msToNextPhase)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <PhaseBar elapsedHours={fasting.elapsedHours} />
                  </>
                ) : (
                  <View style={styles.fastingIdle}>
                    <Text style={styles.fastingIdleText}>tap to start a fast</Text>
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </View>

        {/* ── 4. Macros card ────────────────────────────────────── */}
        <View style={[styles.cardOuterTight, { marginBottom: 8 }]}>
          <View style={[styles.card, styles.macrosCard]}>
            <View style={styles.macrosHeader}>
              <Text style={[styles.cardLabel, textStyles.cap]}>macros · today</Text>
              <Text style={[styles.macrosKcal, textStyles.tnum]}>
                <Text style={styles.macrosKcalStrong}>480</Text>
                <Text> / 1820 kcal</Text>
              </Text>
            </View>
            <View style={styles.macrosBar}>
              <View style={{ flex: 38, backgroundColor: tokens.ink }} />
              <View style={{ flex: 42, backgroundColor: tokens.cool }} />
              <View style={{ flex: 12, backgroundColor: tokens.accentInk }} />
              <View style={{ flex: 8 }} />
            </View>
            <View style={styles.macrosGrid}>
              {[
                { k: 'P', v: '46g', c: tokens.ink, italic: false },
                { k: 'C', v: '52g', c: tokens.cool, italic: false },
                { k: 'F', v: '14g', c: tokens.accentInk, italic: false },
                { k: 'left', v: '92g', c: tokens.ink4, italic: true },
              ].map((m) => (
                <View key={m.k} style={styles.macroCell}>
                  <Text
                    style={{
                      fontFamily: fonts.monoMedium,
                      fontSize: 10,
                      color: m.c,
                      letterSpacing: 1.8,
                      textTransform: m.italic ? 'lowercase' : 'uppercase',
                      fontStyle: m.italic ? 'italic' : 'normal',
                    }}>
                    {m.k}
                  </Text>
                  <Text style={[styles.macroValue, textStyles.tnum]}>{m.v}</Text>
                </View>
              ))}
            </View>
            <View style={styles.macrosFooter}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={[styles.deficitLabel, textStyles.cap]}>deficit</Text>
                <Text style={[styles.deficitValue, textStyles.tnum]}>−1000</Text>
                <Text style={styles.deficitNote}> · on track</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={[styles.deficitLabel, textStyles.cap]}>tdee</Text>
                <Text style={[styles.tdeeValue, textStyles.tnum]}>2820</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },

  // Greeting
  greetingWrap: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  greetingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  dateline: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  datelineDot: {
    color: tokens.ink3,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: tokens.bg2,
    borderRadius: 999,
  },
  streakDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    // approximate the source's box-shadow glow
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  streakText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color: tokens.ink2,
  },
  greetingHeading: {
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    letterSpacing: -0.6,
    marginTop: 8,
    color: tokens.ink,
  },
  greetingHeadingName: {
    fontFamily: fonts.sans,
    color: tokens.ink3,
  },
  greetingSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    marginTop: 4,
  },
  greetingSubStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoMedium,
  },
  greetingSubMute: {
    color: tokens.ink4,
  },

  // Cards
  cardOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  cardOuterTight: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: tokens.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.line,
    // Outer drop shadow only — RN doesn't support inset shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  cardLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.62,
  },

  // Hero card
  heroCard: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  heroTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    marginTop: 3,
    color: tokens.ink,
    letterSpacing: -0.14,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  liveText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.accentInk,
    letterSpacing: 1.44,
  },
  heroBody: {
    flexDirection: 'row',
    gap: 22,
    alignItems: 'center',
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    letterSpacing: 1.62,
  },
  legendValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 16,
    color: tokens.ink,
    marginTop: 2,
    letterSpacing: -0.24,
  },
  legendUnit: {
    color: tokens.ink4,
    fontSize: 10,
    fontFamily: fonts.mono,
  },
  legendPct: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
  },
  legendTarget: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    marginTop: 1,
  },
  legendDivider: {
    height: 1,
    backgroundColor: tokens.line,
  },

  // Fasting card
  fastingCard: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderRadius: 18,
  },
  fastingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  fastingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
  },
  fastingChipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color: tokens.ink2,
  },
  fastingTimes: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
  },
  fastingElapsed: {
    fontFamily: fonts.monoSemibold,
    fontSize: 26,
    color: tokens.ink,
    letterSpacing: -0.78,
    lineHeight: 32,
  },
  fastingElapsedSeconds: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
  },
  fastingElapsedLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  fastingKetoLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  fastingKetoTime: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
    marginTop: 2,
  },
  fastingIdle: {
    paddingTop: 18,
    paddingBottom: 6,
    alignItems: 'center',
  },
  fastingIdleText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    letterSpacing: 0.44,
  },

  // Phase bar
  phaseRow: {
    position: 'relative',
    flexDirection: 'row',
    height: 22,
    gap: 2,
  },
  nowMarker: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1, // offset to center the 2px marker on its left coordinate
    backgroundColor: tokens.accentInk,
    borderRadius: 1,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  phaseLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
  },

  // Macros
  macrosCard: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderRadius: 16,
  },
  macrosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  macrosKcal: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: tokens.ink3,
  },
  macrosKcalStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoMedium,
  },
  macrosBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: tokens.bg2,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  macroCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  macroValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: tokens.ink,
  },
  macrosFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deficitLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: tokens.ink4,
    letterSpacing: 1.76,
  },
  deficitValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    // Was a hardcoded green for "good" — switched to the palette's `cool`
    // teal so it reads positive without fighting the Mist · Petrol scheme.
    color: tokens.cool,
  },
  deficitNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
  },
  tdeeValue: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink3,
  },
});
