import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, textStyles, tokens } from '@/theme/tokens';

import { BottomSheet } from './bottom-sheet';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Small caps eyebrow above the title (e.g. "FASTING"). Optional. */
  kicker?: string;
  /** Plain string title — wrapped in the canonical Text node. */
  title?: string;
  /**
   * Rich title slot — pass a Text/View tree when the title needs inline
   * accent runs ("Plan <span>Thursday</span>"). Mutually exclusive with `title`.
   */
  titleNode?: ReactNode;
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
 * Animation comes from the shared `BottomSheet` primitive: the backdrop
 * fades while the sheet slides up (independent animations, iOS feel).
 */
export function Drawer({ open, onClose, kicker, title, titleNode, cta, children }: DrawerProps) {
  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          {kicker && <Text style={[styles.kicker, textStyles.cap]}>{kicker}</Text>}
          {titleNode ? (
            <Text style={styles.title}>{titleNode}</Text>
          ) : (
            <Text style={styles.title}>{title}</Text>
          )}
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
    </BottomSheet>
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
  // BottomSheet handles position/anchoring; we only set look + height here.
  sheet: {
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
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
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
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },
  sub: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
    fontStyle: 'italic',
  },
});
