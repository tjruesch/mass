import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { fonts, tokens } from '@/theme/tokens';

import { Glyph, type GlyphName } from './glyph';

export type TabId = 'home' | 'today' | 'plan' | 'trends' | 'me';

type Tab = {
  id: TabId;
  label: string;
  icon: GlyphName;
  /** Route to navigate to on tap. Null tabs no-op for now and will
   *  light up once their slice lands (`today` and `me` aren't built). */
  route: string | null;
};

const TABS: readonly Tab[] = [
  { id: 'home', label: 'home', icon: 'home', route: '/' },
  { id: 'today', label: 'today', icon: 'today', route: null },
  { id: 'plan', label: 'plan', icon: 'plan', route: '/plan' },
  { id: 'trends', label: 'trends', icon: 'trends', route: '/trends' },
  { id: 'me', label: 'me', icon: 'me', route: '/me' },
];

type Props = {
  active?: TabId;
  dark?: boolean;
};

/**
 * Bottom tab bar — pixel-faithful port of the TabBar in
 * designs/shared.jsx. Frosted via expo-blur to match the source's
 * `backdrop-filter: blur(20px)`. Decoupled from routing; the real app
 * will wire these into expo-router's <Tabs>.
 */
export function TabBar({ active = 'home', dark = false }: Props) {
  const router = useRouter();
  const ink = dark ? '#FFFFFF' : tokens.ink;
  const mute = dark ? 'rgba(255,255,255,0.45)' : tokens.ink4;
  const disabled = dark ? 'rgba(255,255,255,0.25)' : tokens.line2;
  // Translucent tint sits on top of the blur. Source used 0.94/0.96 alpha.
  const tintOverlay = dark ? 'rgba(20,20,15,0.55)' : 'rgba(250,250,247,0.55)';
  const borderColor = dark ? '#252521' : tokens.line;

  return (
    <BlurView
      tint={dark ? 'dark' : 'light'}
      intensity={60}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 88,
        paddingBottom: 28,
        borderTopWidth: 1,
        borderTopColor: borderColor,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        overflow: 'hidden',
        zIndex: 5,
      }}>
      <View
        // Translucent paper wash above the blur, matching the source's
        // 0.94/0.96-alpha background.
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: tintOverlay,
        }}
      />
      {TABS.map((t) => {
        const isActive = t.id === active;
        const isDisabled = t.route === null;
        const color = isDisabled ? disabled : isActive ? ink : mute;
        const onPress = () => {
          if (t.route === null || isActive) return;
          router.push(t.route as never);
        };
        return (
          <Pressable
            key={t.id}
            onPress={onPress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: isActive, disabled: isDisabled }}
            hitSlop={8}
            style={({ pressed }) => [
              { alignItems: 'center', gap: 4 },
              pressed && !isActive && !isDisabled && { opacity: 0.55 },
            ]}>
            <Glyph name={t.icon} color={color} />
            <Text
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                letterSpacing: 0.88,
                textTransform: 'uppercase',
                color,
              }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </BlurView>
  );
}
