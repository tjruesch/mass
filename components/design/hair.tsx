import { View } from 'react-native';

import { tokens } from '@/theme/tokens';

type Props = {
  color?: string;
  /** Vertical line instead of horizontal */
  vertical?: boolean;
};

/**
 * 1px rule. Defaults to the horizontal `.hair` from designs/tokens.css;
 * pass `vertical` for the `.vhair` variant.
 */
export function Hair({ color = tokens.line, vertical = false }: Props) {
  return (
    <View
      style={
        vertical
          ? { width: 1, alignSelf: 'stretch', backgroundColor: color }
          : { height: 1, alignSelf: 'stretch', backgroundColor: color }
      }
    />
  );
}
