/**
 * Trends — backward-looking hub (Slice 7, #97).
 *
 * v1 scaffold only. Lays the route + header so the streak and chart
 * cards can land on top of it in #98–#101. The screen is a
 * top-level destination (not a sub-screen), so it uses a custom
 * header — dateline kicker + Trends h1 — rather than the
 * back-arrow `SubHeader`.
 *
 * Tab bar reachability is still wire-pending — #20 will route the
 * tabs once the 5-tab structure lands. Until then, the home screen
 * carries a temp `→ trends` link.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabBar } from '@/components/design';
import { useNow } from '@/src/lib/use-now';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('en', { month: 'short' });

function formatDateline(d: Date): string {
  const w = WEEKDAY_FMT.format(d).toLowerCase();
  const day = d.getDate().toString().padStart(2, '0');
  const m = MONTH_FMT.format(d).toLowerCase();
  return `${w} ${day} ${m}`;
}

function formatClockTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default function TrendsScreen() {
  // Once-a-minute tick keeps the dateline live across midnight without
  // a manual refresh, same cadence as the home greeting.
  const now = useNow(60_000);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.dateline, textStyles.cap]}>
            {formatDateline(now)}
            <Text style={styles.datelineDot}> · </Text>
            {formatClockTime(now)}
          </Text>
          <Text style={styles.title}>Trends</Text>
        </View>

        {/* Placeholder until #98–#101 fill the sections. */}
        <View style={styles.placeholderOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>coming next</Text>
          <Text style={styles.placeholder}>
            streak hero · per-feature breakdown · weight chart · 7d deficit bars
          </Text>
        </View>
      </ScrollView>

      <TabBar active="trends" />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  dateline: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    letterSpacing: 2.4,
  },
  datelineDot: {
    color: tokens.ink3,
  },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.6,
    marginTop: 6,
  },

  placeholderOuter: {
    paddingTop: 26,
    paddingHorizontal: 22,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 8,
  },
  placeholder: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    lineHeight: 18,
  },
});
