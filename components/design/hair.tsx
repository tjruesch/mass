import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

type Props = {
  color?: string;
  /** Vertical line instead of horizontal */
  vertical?: boolean;
};

/**
 * 1px rule. Defaults to the horizontal `.hair` from designs/tokens.css;
 * pass `vertical` for the `.vhair` variant.
 */
export function Hair({ color, vertical = false }: Props) {
  const theme = useTheme();
  const stroke = color ?? theme.line;
  return (
    <View
      style={
        vertical
          ? { width: 1, alignSelf: 'stretch', backgroundColor: stroke }
          : { height: 1, alignSelf: 'stretch', backgroundColor: stroke }
      }
    />
  );
}
