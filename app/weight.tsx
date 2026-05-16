/**
 * Weight detail screen — port of designs/screen-weight.jsx WeightDisplay.
 *
 * Status: scaffold + hero + quick log + chart + recent entries + drawer
 * (issues #51, #52, #53). Remaining sections:
 *   #54 — Weigh-in streak + heatmap
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import {
  Glyph,
  HEAT_COLORS,
  HEATMAP_CELL,
  HEATMAP_GAP,
  StreakHeatmap,
  SubHeader,
  TabBar,
  WeightChart,
  WeightLogDrawer,
} from '@/components/design';
import {
  useLatestWeight,
  useRecentWeightEntries,
  useWeighInHistory,
  useWeightHistory,
} from '@/src/hooks/use-weight';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useLastWeightSyncAt } from '@/src/hooks/use-weight-sync';
import type { WeightEntry } from '@/src/db/schema';
import { useNow } from '@/src/lib/use-now';
import { seedWeightDataDev } from '@/src/lib/dev-seed';
import { ensureHkAuthorization, useHkAuthState } from '@/src/lib/healthkit/auth';
import { BODY_MASS_PERMISSIONS } from '@/src/lib/healthkit/weight';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const MONTH_DAY = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

// Chart fills the card minus padding (22px page + 8px card). iOS-portrait
// only for v1; if we ever rotate or hit iPad, swap for an onLayout-based
// width on the chart card.
const SCREEN_W = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_W - 22 * 2 - 8 * 2;
const CHART_HEIGHT = 258;

export default function WeightScreen() {
  const router = useRouter();
  const prefs = useWeightPreferences();
  const latest = useLatestWeight();
  const history = useWeightHistory({ days: 90 });
  const recent = useRecentWeightEntries(8);
  const auth = useHkAuthState(BODY_MASS_PERMISSIONS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);

  const openCreate = useCallback(() => {
    setEditingEntry(null);
    setDrawerOpen(true);
  }, []);
  const openEdit = useCallback((entry: WeightEntry) => {
    setEditingEntry(entry);
    setDrawerOpen(true);
  }, []);

  // The hero relies on `prefs.targetKg`/`targetDate` for the goal stats but
  // works fine without a goal — eta/to-goal just collapse to em-dash.
  // Returning null on prefs would flash the page; better to render the
  // hero with placeholders.
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader
          title="Weight"
          back="Home"
          onBack={() => router.back()}
          trailing={
            <Pressable onPress={() => router.push('/weight-settings')} hitSlop={8}>
              <View style={styles.cogBubble}>
                <Glyph name="cog" />
              </View>
            </Pressable>
          }
        />

        <AuthBanner state={auth} onConnect={() => ensureHkAuthorization(BODY_MASS_PERMISSIONS)} />

        <StatHero
          latestKg={latest?.kg ?? null}
          sevenDayDelta={history.sevenDayDelta}
          targetKg={prefs?.targetKg ?? null}
          targetDate={prefs?.targetDate ?? null}
        />

        {prefs && (
          <View style={styles.chartOuter}>
            <View style={styles.chartCard}>
              <WeightChart
                history={history.points}
                prefs={prefs}
                width={CHART_WIDTH}
                height={CHART_HEIGHT}
              />
            </View>
          </View>
        )}

        <QuickLogRow authGranted={auth === 'granted'} onOpen={openCreate} />

        <RecentEntries entries={recent} onEdit={openEdit} />

        <StreakSection />

        {/* Dev-only seed action — gated on __DEV__ so it never ships in
            release builds. Lets the simulator render the chart since HK
            isn't available there. */}
        {__DEV__ && (
          <Pressable
            onPress={async () => {
              try {
                const r = await seedWeightDataDev();
                Alert.alert('Seeded', `Inserted ${r.inserted} entries.`);
              } catch (err) {
                Alert.alert('Seed failed', err instanceof Error ? err.message : String(err));
              }
            }}
            style={({ pressed }) => [styles.devSeedBtn, pressed && { opacity: 0.6 }]}>
            <Text style={styles.devSeedText}>DEV · seed 14 days</Text>
          </Pressable>
        )}
      </ScrollView>
      <TabBar active="home" />

      <WeightLogDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entry={editingEntry}
        seedKg={latest?.kg ?? null}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthBanner — prompts for HK auth or hints at manual-only mode. Hidden on
// the simulator (`unavailable`) and once auth is granted.
// ─────────────────────────────────────────────────────────────────────────────
function AuthBanner({
  state,
  onConnect,
}: {
  state: ReturnType<typeof useHkAuthState>;
  onConnect: () => void;
}) {
  if (state === 'granted' || state === 'unavailable' || state === 'checking') {
    return null;
  }
  if (state === 'denied') {
    return (
      <View style={styles.bannerOuter}>
        <Text style={styles.bannerText}>
          Apple Health off — manual entries only. Re-enable in iOS
          Settings → Privacy → Health.
        </Text>
      </View>
    );
  }
  // 'unknown' — show a CTA.
  return (
    <View style={styles.bannerOuter}>
      <View style={styles.bannerCard}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerKicker, textStyles.cap]}>apple health</Text>
          <Text style={styles.bannerTitle}>Connect to import weigh-ins</Text>
          <Text style={styles.bannerSub}>
            We&apos;ll mirror existing body-mass samples and push manual entries back.
          </Text>
        </View>
        <Pressable
          onPress={onConnect}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bannerCta, pressed && { opacity: 0.7 }]}>
          <Text style={styles.bannerCtaText}>connect</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatHero — big kg readout + 7d/to-goal/eta strip. No card frame, matches
// the inline-rings treatment we did on home.
// ─────────────────────────────────────────────────────────────────────────────
function StatHero({
  latestKg,
  sevenDayDelta,
  targetKg,
  targetDate,
}: {
  latestKg: number | null;
  sevenDayDelta: number | null;
  targetKg: number | null;
  targetDate: Date | null;
}) {
  const remainingKg = latestKg !== null && targetKg !== null ? latestKg - targetKg : null;

  return (
    <View style={styles.heroSection}>
      <View style={styles.heroBigRow}>
        <Text style={[styles.heroValue, textStyles.tnum]}>
          {latestKg === null ? '—' : latestKg.toFixed(1)}
        </Text>
        <Text style={styles.heroUnit}>kg</Text>
      </View>
      <View style={styles.statStrip}>
        <StatChip
          label="7d"
          // Down is good (cutting). Tinting accent-positive for now;
          // a dedicated success token can come with the design palette
          // pass once trends + meals land and the green/warn split matters.
          value={
            sevenDayDelta === null
              ? '—'
              : `${sevenDayDelta < 0 ? '▼' : '▲'} ${Math.abs(sevenDayDelta).toFixed(1)}`
          }
          tone={sevenDayDelta === null ? 'muted' : sevenDayDelta <= 0 ? 'positive' : 'warn'}
        />
        <StatDot />
        <StatChip
          label="to goal"
          value={remainingKg === null ? '—' : `${remainingKg.toFixed(1)} kg`}
        />
        <StatDot />
        <StatChip
          label="eta"
          value={targetDate ? MONTH_DAY.format(targetDate).toLowerCase() : '—'}
        />
      </View>
    </View>
  );
}

function StatChip({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'muted' | 'positive' | 'warn';
}) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipLabel, textStyles.cap]}>{label}</Text>
      <Text
        style={[
          styles.statChipValue,
          textStyles.tnum,
          tone === 'muted' && { color: tokens.ink4, fontFamily: fonts.mono },
          tone === 'positive' && { color: tokens.cool },
          tone === 'warn' && { color: tokens.warn },
        ]}>
        {value}
      </Text>
    </View>
  );
}

function StatDot() {
  return <Text style={styles.statSeparator}>·</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickLogRow — primary "log today's weigh-in" CTA. Card with kicker, title,
// status subline driven by auth state + last-sync time, dark button on the
// right. The button currently stubs out the drawer (issue #53 ships it).
// ─────────────────────────────────────────────────────────────────────────────
function QuickLogRow({
  authGranted,
  onOpen,
}: {
  authGranted: boolean;
  onOpen: () => void;
}) {
  const now = useNow(60_000);
  const lastSyncAt = useLastWeightSyncAt();

  const kicker = `today · ${formatClock(now)}`;
  const subline = !authGranted
    ? 'manual entry — Apple Health off'
    : lastSyncAt
    ? `via Apple Health · last sync ${formatClock(lastSyncAt)}`
    : 'via Apple Health · waiting for first sync';

  return (
    <View style={styles.quickLogOuter}>
      <View style={styles.quickLogCard}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.quickLogKicker, textStyles.cap]}>{kicker}</Text>
          <Text style={styles.quickLogTitle}>Log today&apos;s weigh-in</Text>
          <Text style={styles.quickLogSub}>{subline}</Text>
        </View>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Log weigh-in"
          style={({ pressed }) => [styles.quickLogBtn, pressed && { opacity: 0.6 }]}>
          <Glyph name="plus" color={tokens.accent} size={14} />
          <Text style={styles.quickLogBtnText}>log</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent entries — last N weigh-ins desc. Tap a row → edit in drawer.
// Delta vs the row's chronological predecessor (so the topmost row shows the
// most recent change). Down is `tokens.cool` (cutting reads as positive
// progress); up is `tokens.warn`.
// ─────────────────────────────────────────────────────────────────────────────
function RecentEntries({
  entries,
  onEdit,
}: {
  entries: ReadonlyArray<WeightEntry>;
  onEdit: (e: WeightEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <View style={styles.recentOuter}>
        <Text style={[styles.recentKicker, textStyles.cap]}>recent entries</Text>
        <Text style={styles.recentEmptyText}>no weigh-ins yet</Text>
      </View>
    );
  }

  // entries arrive desc; delta = current.kg - predecessor.kg (the next row down).
  return (
    <View style={styles.recentOuter}>
      <Text style={[styles.recentKicker, textStyles.cap]}>recent entries</Text>
      <View style={styles.recentCard}>
        {entries.map((e, i) => {
          const prev = entries[i + 1];
          const delta = prev ? e.kg - prev.kg : null;
          const isLast = i === entries.length - 1;
          return (
            <Pressable
              key={e.id}
              onPress={() => onEdit(e)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${e.kg.toFixed(1)} kg from ${formatRecentDate(e.at)}`}
              style={({ pressed }) => [
                styles.recentRow,
                !isLast && styles.recentRowBorder,
                pressed && { opacity: 0.65 },
              ]}>
              <View style={styles.recentDayCol}>
                <Text style={[styles.recentDay, textStyles.cap]}>{shortWeekday(e.at)}</Text>
                <Text style={styles.recentDate}>{formatRecentDate(e.at)}</Text>
              </View>
              <Text style={[styles.recentSource, textStyles.cap]}>
                {sourceLabel(e.source)}
              </Text>
              {delta === null ? (
                <Text style={[styles.recentDelta, textStyles.tnum, styles.recentDeltaMuted]}>—</Text>
              ) : (
                <Text
                  style={[
                    styles.recentDelta,
                    textStyles.tnum,
                    delta <= 0 ? styles.recentDeltaDown : styles.recentDeltaUp,
                  ]}>
                  {`${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(1)}`}
                </Text>
              )}
              <View style={styles.recentKgRow}>
                <Text style={[styles.recentKg, textStyles.tnum]}>{e.kg.toFixed(1)}</Text>
                <Text style={styles.recentKgUnit}>kg</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY_FMT = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

function shortWeekday(d: Date): string {
  return WEEKDAY_FMT.format(d).toLowerCase();
}

function formatRecentDate(d: Date): string {
  return MONTH_DAY_FMT.format(d).toLowerCase();
}

function sourceLabel(source: WeightEntry['source']): string {
  if (source === 'healthkit') return 'apple health';
  if (source === 'scale') return 'scale';
  return 'manual';
}

// ─────────────────────────────────────────────────────────────────────────────
// StreakSection — adherence + current/best streak above a binary heatmap.
// Weeks count is computed from measured container width so cells stay at
// their fixed 14px design size (same trick as fasting + water).
// ─────────────────────────────────────────────────────────────────────────────
const STREAK_DAY_LABELS_WIDTH = 14;
const STREAK_LABEL_GAP = 6;
const MIN_WEEKS = 14;

function StreakSection() {
  const [weeks, setWeeks] = useState(MIN_WEEKS);
  const prefs = useWeightPreferences();

  const onSectionLayout = (e: LayoutChangeEvent) => {
    const innerWidth = e.nativeEvent.layout.width - 22 * 2;
    const gridWidth = innerWidth - STREAK_DAY_LABELS_WIDTH - STREAK_LABEL_GAP;
    const fits = Math.floor((gridWidth + HEATMAP_GAP) / (HEATMAP_CELL + HEATMAP_GAP));
    const next = Math.max(MIN_WEEKS, fits);
    if (next !== weeks) setWeeks(next);
  };

  const history = useWeighInHistory(weeks);
  const adherencePct = Math.round(history.adherencePct * 100);

  return (
    <View style={styles.streakWrap} onLayout={onSectionLayout}>
      <View style={styles.streakHeader}>
        <Text style={[styles.recentKicker, textStyles.cap]}>
          weigh-ins · last {weeks} weeks
        </Text>
        <Text style={[styles.streakMeta, textStyles.tnum]}>
          adherence <Text style={styles.streakMetaStrong}>{adherencePct}%</Text>
          <Text style={styles.streakMetaDot}>{'  ·  '}</Text>
          streak <Text style={styles.streakMetaStrong}>{history.currentStreak}d</Text>
          <Text style={styles.streakMetaDot}>{'  ·  '}</Text>
          best <Text style={styles.streakMetaStrong}>{history.bestStreak}d</Text>
        </Text>
      </View>

      <StreakHeatmap
        cells={history.cells}
        weeks={weeks}
        weekdayBitmask={prefs?.weekdayBitmask}
      />

      {/* Binary palette — 2-color key (skipped / logged) instead of the
          5-stop ramp used by water/fasting. */}
      <View style={styles.streakLegend}>
        <View style={styles.streakLegendKey}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: HEAT_COLORS[0],
              borderWidth: 1,
              borderColor: tokens.line2,
            }}
          />
          <Text style={styles.streakLegendWord}>skipped</Text>
          <View style={{ width: 8 }} />
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: HEAT_COLORS[4],
            }}
          />
          <Text style={styles.streakLegendWord}>logged</Text>
        </View>
      </View>
    </View>
  );
}

function formatClock(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  // Auth banner
  bannerOuter: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.03,
  },
  bannerKicker: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.87,
  },
  bannerTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: tokens.ink,
    marginTop: 3,
  },
  bannerSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
  },
  bannerCta: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: tokens.ink,
  },
  bannerCtaText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  bannerText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: tokens.bg2,
    borderRadius: 12,
    fontStyle: 'italic',
  },

  // Stat hero
  heroSection: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  heroBigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 56,
    color: tokens.ink,
    letterSpacing: -1.2,
    lineHeight: 60,
  },
  heroUnit: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: tokens.ink3,
  },

  statStrip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    rowGap: 4,
    columnGap: 12,
    marginTop: 10,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  statChipLabel: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
  },
  statChipValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: tokens.ink,
    letterSpacing: 0.4,
  },
  statSeparator: {
    color: tokens.ink4,
    fontFamily: fonts.mono,
    fontSize: 11,
  },

  // Quick log
  quickLogOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  quickLogCard: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.03,
  },
  quickLogKicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  quickLogTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: tokens.ink,
    marginTop: 3,
  },
  quickLogSub: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    marginTop: 2,
    fontStyle: 'italic',
  },
  quickLogBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.12,
  },
  quickLogBtnText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.bg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },

  // Chart card
  chartOuter: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  chartCard: {
    backgroundColor: tokens.card,
    borderRadius: 18,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },

  // Recent entries
  recentOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  recentKicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 8,
  },
  recentEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.22,
  },
  recentCard: {
    backgroundColor: tokens.card,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  recentRowBorder: {
    borderBottomColor: tokens.line,
    borderBottomWidth: 1,
  },
  recentDayCol: {
    width: 60,
  },
  recentDay: {
    fontFamily: fonts.monoSemibold,
    fontSize: 8.5,
    color: tokens.ink,
    letterSpacing: 1.53,
  },
  recentDate: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    marginTop: 1,
  },
  recentSource: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.53,
  },
  recentDelta: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
  },
  recentDeltaMuted: { color: tokens.ink4 },
  recentDeltaDown: { color: tokens.cool },
  recentDeltaUp: { color: tokens.warn },
  recentKgRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    minWidth: 56,
    justifyContent: 'flex-end',
  },
  recentKg: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
  },
  recentKgUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
  },

  // Streak section
  streakWrap: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  streakLegendKey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakLegendWord: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 0.34,
  },

  devSeedBtn: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.line,
    borderStyle: 'dashed',
  },
  devSeedText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
