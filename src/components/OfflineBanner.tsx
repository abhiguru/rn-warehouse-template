/**
 * Offline Banner Component
 *
 * Full-width banner shown while the device is offline (docs/STYLE_GUIDE.md
 * §13.9 and §14.9): status.neutral background, cloud-off-outline icon, and the
 * state plus what still works. It sits in the layout above the app, so it
 * pushes content down instead of covering it, and adds the top safe-area inset.
 * Auto-hides when the connection is restored.
 *
 * Issue: I1 - No Network State Monitoring
 */

import React from 'react';
import { View, Text, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, motion, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

interface OfflineBannerProps {
  /**
   * Optional custom message to display
   */
  message?: string;
}

/** Distance the banner slides in from. */
const HIDDEN_OFFSET = -space.giant;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.status.neutral.background,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
    paddingBottom: space.sm,
    paddingHorizontal: layout.marginCompact,
  },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  text: {
    ...typography.footnote,
    color: t.text.primary,
    flexShrink: 1,
  },
});

/**
 * Banner that appears when device is offline
 * Automatically shows/hides based on network status
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  message = "You're offline. Actions that need the server will work again when you reconnect.",
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const [visible, setVisible] = React.useState(false);
  const translateY = React.useRef(new Animated.Value(HIDDEN_OFFSET)).current;

  React.useEffect(() => {
    let current = true;
    let animation: Animated.CompositeAnimation | undefined;
    if (isOffline) {
      setVisible(true);
      animation = Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      });
    } else if (visible) {
      animation = Animated.timing(translateY, {
        toValue: HIDDEN_OFFSET,
        duration: motion.standard,
        useNativeDriver: true,
      });
    }
    animation?.start(({ finished }) => {
      // A cancelled or obsolete hide must not remove a newer offline warning.
      if (current && finished && !isOffline) setVisible(false);
    });
    return () => {
      current = false;
      animation?.stop();
    };
  }, [isOffline, visible, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top, transform: [{ translateY }] },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.content}>
        <Icon name="cloud-off-outline" size={iconSize.md} color={t.status.neutral.text} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
};

export default OfflineBanner;
