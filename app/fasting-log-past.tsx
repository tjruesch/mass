import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeField, SubHeader, TabBar } from '@/components/design';
import { logPastSession } from '@/src/db/queries/fasting';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const TARGET_OPTIONS = [13, 14, 16, 18, 20, 24] as const;

/** Reasonable history horizon — users rarely need to log a fast more than a month ago. */
const MAX_BACKDATE_MS = 30 * 24 * 3_600_000;

export default function FastingLogPastScreen() {
  const router = useRouter();
  const prefs = useFastingPreferences();

  const [targetHours, setTargetHours] = useState<number | null>(null);
  // Default to "yesterday evening → this morning" pattern: end = now, start = end - target hours.
  const now = new Date();
  const [startedAt, setStartedAt] = useState<Date>(() => new Date(now.getTime() - 16 * 3_600_000));
  const [endedAt, setEndedAt] = useState<Date>(() => now);
  const [saving, setSaving] = useState(false);

  // Once prefs loads, seed target from the default protocol if not set yet.
  useEffect(() => {
    if (targetHours === null && prefs) {
      setTargetHours(prefs.defaultTargetHours);
      // Also reflow the default time range to match the seeded target.
      setStartedAt(new Date(Date.now() - prefs.defaultTargetHours * 3_600_000));
    }
  }, [prefs, targetHours]);

  const minStart = new Date(Date.now() - MAX_BACKDATE_MS);
  const maxEnd = new Date();

  const durationMs = endedAt.getTime() - startedAt.getTime();
  const valid = durationMs > 0 && endedAt.getTime() <= Date.now() && targetHours !== null;

  const handleSave = useCallback(() => {
    if (!valid || targetHours === null || saving) return;
    setSaving(true);
    logPastSession({ startedAt, endedAt, targetHours })
      .then(() => router.back())
      .catch((err) => {
        Alert.alert('Could not log fast', err.message);
        setSaving(false);
      });
  }, [valid, targetHours, saving, startedAt, endedAt, router]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SubHeader
          title="Log past fast"
          back="Fasting"
          onBack={() => router.back()}
          trailing={
            <Pressable onPress={handleSave} hitSlop={8} disabled={!valid || saving}>
              <Text style={[styles.saveText, (!valid || saving) && { opacity: 0.35 }]}>save</Text>
            </Pressable>
          }
        />

        {/* TARGET */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, textStyles.cap]}>target</Text>
          <View style={styles.targetGrid}>
            {TARGET_OPTIONS.map((h) => {
              const active = h === targetHours;
              return (
                <Pressable
                  key={h}
                  onPress={() => setTargetHours(h)}
                  style={[styles.targetChip, active && styles.targetChipActive]}>
                  <Text style={[styles.targetChipText, active && { color: tokens.bg }]}>{h}h</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* START */}
        <View style={styles.section}>
          <DateTimeField
            label="start"
            value={startedAt}
            onChange={setStartedAt}
            title="Start time"
            minimumDate={minStart}
            maximumDate={endedAt}
          />
        </View>

        {/* END */}
        <View style={styles.section}>
          <DateTimeField
            label="end"
            value={endedAt}
            onChange={setEndedAt}
            title="End time"
            minimumDate={startedAt}
            maximumDate={maxEnd}
          />
        </View>

        {/* DURATION + VALIDATION */}
        <View style={styles.section}>
          <View style={styles.durationRow}>
            <Text style={[styles.durationLabel, textStyles.cap]}>duration</Text>
            <Text
              style={[
                styles.durationValue,
                textStyles.tnum,
                !valid && { color: tokens.warn },
              ]}>
              {formatDurationFull(durationMs)}
            </Text>
          </View>
          {!valid && durationMs <= 0 && (
            <Text style={styles.validationMsg}>End time must come after start time.</Text>
          )}
          {!valid && endedAt.getTime() > Date.now() && (
            <Text style={styles.validationMsg}>End time can&apos;t be in the future.</Text>
          )}
        </View>
      </ScrollView>

      <TabBar active="home" />
    </View>
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

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 120,
  },
  saveText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    color: tokens.accentInk,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
  },
  section: {
    paddingHorizontal: 22,
    marginTop: 18,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 8,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetChip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
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
    fontSize: 13,
    color: tokens.ink,
    letterSpacing: -0.13,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
  },
  durationLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  durationValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 18,
    color: tokens.ink,
    letterSpacing: -0.36,
  },
  validationMsg: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.warn,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
