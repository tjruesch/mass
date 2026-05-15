import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  /** Drives the open/close lifecycle. Toggle from the parent. */
  open: boolean;
  /** Tap on the backdrop or system back gesture. Animation runs *out* first. */
  onClose: () => void;
  /** Sheet content. Sits in an absolute container pinned to the bottom. */
  children: ReactNode;
  /**
   * Styles for the sheet itself — bg color, top radii, height, padding, etc.
   * The container handles position (absolute, bottom: 0) so you don't have to.
   */
  sheetStyle?: StyleProp<ViewStyle>;
};

const SLIDE_DURATION = 280;
const FADE_DURATION = 240;
const SHEET_TRAVEL_PX = Dimensions.get('window').height;

/**
 * Bottom-anchored modal with the right iOS feel: the backdrop *fades in*
 * while the sheet *slides up*, instead of the whole modal stack sliding
 * together (the default with `Modal animationType="slide"`).
 *
 * Implementation: Modal with `animationType="none"` so RN doesn't animate
 * anything, then two parallel Animated.timing calls — opacity 0→1 on a
 * translucent backdrop, translateY SHEET_TRAVEL_PX→0 on the sheet.
 * On close, we run the inverse animations and unmount the Modal once they
 * complete so the sheet doesn't snap away.
 *
 * Use this as the chrome for any bottom drawer/sheet. The visible content
 * (handles, headers, scrolls, CTAs) lives entirely in `children`.
 */
export function BottomSheet({ open, onClose, children, sheetStyle }: Props) {
  // `visible` controls whether the Modal is mounted. We keep it true through
  // the close animation, then flip false in the animation-end callback.
  const [visible, setVisible] = useState(false);

  const translateY = useRef(new Animated.Value(SHEET_TRAVEL_PX)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      // Reset starting positions in case a half-finished close animation
      // left them somewhere in between.
      translateY.setValue(SHEET_TRAVEL_PX);
      backdropOpacity.setValue(0);
      setVisible(true);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: SLIDE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: FADE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out, then unmount once the animation actually finishes
      // (interrupted animations report finished:false — leave visible alone
      // so a follow-up open finds the modal still up).
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_TRAVEL_PX,
          duration: SLIDE_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: FADE_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
  }, [open, translateY, backdropOpacity]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.sheetContainer, { transform: [{ translateY }] }, sheetStyle]}>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,15,0.35)',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
