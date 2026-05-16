import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, textStyles, tokens } from '@/theme/tokens';

import { BottomSheet } from './bottom-sheet';

type Props = {
  open: boolean;
  /** Seed value — also re-seeds the spinner whenever the sheet reopens. */
  value: Date;
  /** Picker mode. 'datetime' (default) shows date + time in one column set. */
  mode?: 'date' | 'time' | 'datetime';
  /** Optional sheet title centered between the Cancel and Apply actions. */
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /**
   * Fires when the user taps Apply with the in-sheet value. Parent is
   * responsible for any further validation + persistence.
   */
  onApply: (date: Date) => void;
  /**
   * Fires when the user taps Cancel, taps the backdrop, or otherwise
   * dismisses the sheet without applying.
   */
  onCancel: () => void;
};

/**
 * Bottom-sheet wrapper around `@react-native-community/datetimepicker`.
 *
 * Designed for the lab-notebook palette: paper background, mono-cap action
 * labels, accent-ink for the primary Apply. The picker itself is iOS
 * `display='spinner'` for a classic 3-wheel scroll that's predictable
 * across OS versions; the rest of the chrome is ours.
 *
 * Intentionally generic — used directly by the fasting hero ring to edit
 * an active session's start time, and slated for reuse by retroactive
 * fast logging (#33) and the precise eating-window picker (#17).
 */
export function DateTimePickerSheet({
  open,
  value,
  mode = 'datetime',
  title,
  minimumDate,
  maximumDate,
  onApply,
  onCancel,
}: Props) {
  // Internal state so the parent's `value` stays stable while the user
  // scrolls — we only push back on Apply.
  const [internal, setInternal] = useState(value);

  // Re-seed each time the sheet opens so a reopen reflects the latest
  // parent value (otherwise the spinner would show stale data).
  useEffect(() => {
    if (open) setInternal(value);
  }, [open, value]);

  return (
    <BottomSheet open={open} onClose={onCancel} sheetStyle={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12} style={styles.actionWrap}>
          <Text style={[styles.actionMuted, textStyles.cap]}>cancel</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        <Pressable onPress={() => onApply(internal)} hitSlop={12} style={[styles.actionWrap, { alignItems: 'flex-end' }]}>
          <Text style={[styles.actionPrimary, textStyles.cap]}>apply</Text>
        </Pressable>
      </View>
      <DateTimePicker
        value={internal}
        mode={mode}
        display="spinner"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(_, d) => {
          if (d) setInternal(d);
        }}
        textColor={tokens.ink}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // BottomSheet handles position/anchoring; sheet style is look-only.
  sheet: {
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    // approximate safe-area bottom; will revisit with useSafeAreaInsets later
    paddingBottom: 34,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: tokens.line,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.line2,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionWrap: {
    minWidth: 70,
  },
  actionMuted: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    letterSpacing: 1.92,
    color: tokens.ink3,
  },
  actionPrimary: {
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    letterSpacing: 1.92,
    color: tokens.accentInk,
    textAlign: 'right',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.15,
  },
});
