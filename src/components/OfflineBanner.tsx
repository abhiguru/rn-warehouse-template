/**
 * Offline Banner Component
 *
 * Displays a banner when the device is offline.
 * Auto-hides when connection is restored.
 *
 * Issue: I1 - No Network State Monitoring
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import theme from '@/theme';

interface OfflineBannerProps {
  /**
   * Optional custom message to display
   */
  message?: string;
}

/**
 * Banner that appears when device is offline
 * Automatically shows/hides based on network status
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  message = 'No internet connection',
}) => {
  const isOffline = useIsOffline();
  const [visible, setVisible] = React.useState(false);
  const translateY = React.useRef(new Animated.Value(-50)).current;

  React.useEffect(() => {
    if (isOffline) {
      setVisible(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();
    } else if (visible) {
      Animated.timing(translateY, {
        toValue: -50,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }
  }, [isOffline, visible, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }] },
      ]}
    >
      <View style={styles.content}>
        <Icon name="wifi-off" size={18} color={styles.icon.color} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: theme.colors.gray[800],
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  icon: {
    color: '#FFFFFF',
  },
});

export default OfflineBanner;
