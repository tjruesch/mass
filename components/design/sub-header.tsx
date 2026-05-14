import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, tokens } from '@/theme/tokens';

type Props = {
  title: string;
  /**
   * Label rendered next to the back chevron — typically the previous
   * screen name (e.g. "Me"). Source defaults to "Home".
   */
  back?: string;
  /** Tap handler on the back bubble. Omit to render a non-interactive bubble. */
  onBack?: () => void;
  /** Right-aligned slot (icon button, status chip, etc.). */
  trailing?: ReactNode;
};

/**
 * Screen sub-header used across screen-apple-health, screen-fasting,
 * screen-weight, screen-meals-week, screen-pantry, etc.
 *
 * Pixel-faithful port of the inline `SubHeader` defined in
 * designs/screen-fasting.jsx — same paddings, 30px back bubble, mono
 * 0.22em uppercase back label, Inter 14/600 title, balanced trailing slot.
 */
export function SubHeader({ title, back = 'Home', onBack, trailing }: Props) {
  const BackBubble = (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        backgroundColor: tokens.bg2,
        borderWidth: 1,
        borderColor: tokens.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path
          d="M7.5 2.5L4 6l3.5 3.5"
          stroke={tokens.ink}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        paddingRight: 18,
        paddingBottom: 12,
        paddingLeft: 18,
        gap: 8,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${back}`}
            hitSlop={8}>
            {BackBubble}
          </Pressable>
        ) : (
          BackBubble
        )}
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            color: tokens.ink4,
            letterSpacing: 1.98,
            textTransform: 'uppercase',
          }}>
          {back}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: fonts.sansSemibold,
          fontSize: 14,
          color: tokens.ink,
          letterSpacing: -0.14,
        }}>
        {title}
      </Text>

      <View style={{ minWidth: 60, flexDirection: 'row', justifyContent: 'flex-end' }}>
        {trailing}
      </View>
    </View>
  );
}
