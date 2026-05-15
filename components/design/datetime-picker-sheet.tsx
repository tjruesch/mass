import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, textStyles, tokens } from '@/theme/tokens';

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
 * an active session's start time, and reused by retroactive fast logging
 * and the precise eating-window picker via `DateTimeField`.
 *
 * iOS gotcha: the native UIDatePicker (display='spinner') seeds its wheels
 * the moment it's added to the view hierarchy and ignores subsequent
 * `value` prop changes. If we mount the picker during the Modal's
 * slide-in animation, the wheels end up at iOS's internal default (often
 * 01:00) instead of our value. The fix is two-fold: (1) the consumer
 * remounts the sheet via `key=` on each open so the React tree is fresh,
 * and (2) inside this component we defer the actual `<DateTimePicker>`
 * render until `Modal.onShow` fires, i.e. after the animation completes.
 * By that point our `internal` state is settled on the right value and
 * UIDatePicker picks it up correctly.
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

  // Defer mounting <DateTimePicker> until the modal is fully shown — see
  // class doc for why.
  const [pickerMounted, setPickerMounted] = useState(false);

  // Re-seed when the sheet opens so a reopen reflects the latest value.
  useEffect(() => {
    if (open) setInternal(value);
  }, [open, value]);

  // When the sheet closes, drop the picker from the tree so the next open
  // gets a fresh mount with the freshly-seeded internal value.
  useEffect(() => {
    if (!open) setPickerMounted(false);
  }, [open]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      onShow={() => setPickerMounted(true)}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss picker" />
      <View style={styles.sheet}>
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
        {pickerMounted ? (
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
        ) : (
          // Reserve the wheel's vertical space so the sheet doesn't pop in
          // when the picker mounts. 216 is the iOS spinner's intrinsic height.
          <View style={{ height: 216 }} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    fontSize: 10,
    letterSpacing: 1.98,
    color: tokens.ink3,
  },
  actionPrimary: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    letterSpacing: 1.98,
    color: tokens.accentInk,
    textAlign: 'right',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: tokens.ink,
    letterSpacing: -0.14,
  },
});
