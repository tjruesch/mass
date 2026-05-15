import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, textStyles, tokens } from '@/theme/tokens';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Small caps eyebrow above the title (e.g. "FASTING"). Optional. */
  kicker?: string;
  title: string;
  /**
   * Sticky CTA pinned at the bottom of the drawer (typically a PrimaryButton).
   * Sits above the bottom safe-area inset.
   */
  cta?: ReactNode;
  children: ReactNode;
};

/**
 * Bottom drawer that mirrors the chrome in designs/screen-log-drawers.jsx:
 * paper bg with 24px rounded top corners, drag handle, kicker + title header
 * with an X close button, scrollable body, and an optional sticky CTA slot.
 *
 * Generic on content — the same shell hosts water / weight / meal / past-fast
 * logging. Each drawer just provides its own kicker / title / sections / CTA.
 *
 * Note on nested overlays: the drawer is a `Modal`, and `DateTimeField`
 * children open their own `DateTimePickerSheet` (also a Modal). On iOS,
 * Modal-over-Modal works in practice for sequential interactions like this;
 * if we ever ship Android or hit a stacking glitch we'll move the picker
 * to an inline overlay layer.
 */
export function Drawer({ open, onClose, kicker, title, cta, children }: DrawerProps) {
  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss drawer" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {kicker && <Text style={[styles.kicker, textStyles.cap]}>{kicker}</Text>}
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}>
            <Svg width={11} height={11} viewBox="0 0 12 12">
              <Path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke={tokens.ink} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>

        {cta && <View style={styles.ctaWrap}>{cta}</View>}
      </View>
    </Modal>
  );
}

type DrawerSectionProps = {
  label: string;
  sub?: string;
  /** Vertical gap above this section. Defaults to 16. */
  marginTop?: number;
  children: ReactNode;
};

/**
 * One block inside a Drawer — small-caps label + optional italic sub on the
 * right, then content. Mirrors the `DrawerSection` helper in the design.
 */
export function DrawerSection({ label, sub, marginTop = 16, children }: DrawerSectionProps) {
  return (
    <View style={{ marginTop }}>
      <View style={drawerSectionStyles.header}>
        <Text style={[drawerSectionStyles.label, textStyles.cap]}>{label}</Text>
        {sub && <Text style={drawerSectionStyles.sub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

// Approx 78% screen on a 390×844 — matches the design's 660px on that frame.
const SHEET_HEIGHT_PCT = '78%' as const;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,15,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT_PCT,
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -24 },
    shadowRadius: 60,
    shadowOpacity: 0.25,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.line2,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    color: tokens.ink4,
    letterSpacing: 1.87,
  },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 19,
    color: tokens.ink,
    letterSpacing: -0.38,
    marginTop: 4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingTop: 6,
    paddingHorizontal: 22,
  },
  bodyContent: {
    // Leave headroom under the sticky CTA so scroll doesn't crowd it.
    paddingBottom: 96,
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 30,
    paddingHorizontal: 22,
    paddingTop: 8,
  },
});

const drawerSectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  sub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    fontStyle: 'italic',
  },
});
