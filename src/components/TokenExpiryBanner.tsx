/**
 * Token Expiry Banner Component
 *
 * Full-width banner for session and sign-in problems (docs/STYLE_GUIDE.md §13.9):
 * - Session expiring soon: status.critical background, "Sign in again".
 * - Session expired or a sign-in error: status.negative background.
 * - App configuration could not be loaded: status.critical background.
 *
 * The banner sits in the layout (it pushes content down, never covers it) and
 * stays until the user acts. Actions are tertiary buttons in brand.tint.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { clearTokenExpiryStates, clearAuthError, logout, setConfigFetchFailed } from '@/store/slices/authSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { StatusTokens, ThemeTokens } from '@/theme/tokens';

type BannerTone = 'critical' | 'negative';

interface BannerAction {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  banner: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    paddingBottom: space.xs,
    borderBottomWidth: 1,
  },
  critical: {
    backgroundColor: t.status.critical.background,
    borderBottomColor: t.status.critical.border,
  },
  negative: {
    backgroundColor: t.status.negative.background,
    borderBottomColor: t.status.negative.border,
  },
  contentRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },
  icon: {
    marginTop: space.xxs,
  },
  message: {
    ...typography.subhead,
    flex: 1,
    color: t.text.primary,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  action: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },
  actionPressed: {
    backgroundColor: t.interaction.pressedOverlay,
  },
  actionText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

interface BannerProps {
  tone: BannerTone;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  message: string;
  actions: BannerAction[];
}

function Banner({ tone, icon, message, actions }: BannerProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const status: StatusTokens = t.status[tone];

  return (
    <View style={[styles.banner, styles[tone]]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.contentRow}>
        <MaterialCommunityIcons name={icon} size={iconSize.md} color={status.text} style={styles.icon} />
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.actionsRow}>
        {actions.map(action => (
          <Pressable
            key={action.label}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const TokenExpiryBanner: React.FC = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { tokenExpiryWarning, tokenExpired, error: authError, configFetchFailed } = useAppSelector(
    (state) => state.auth
  );

  const handleDismissTokenExpiry = () => {
    dispatch(clearTokenExpiryStates());
  };

  const handleDismissAuthError = () => {
    dispatch(clearAuthError());
  };

  const handleDismissConfigError = () => {
    dispatch(setConfigFetchFailed(false));
  };

  const handleLogout = async () => {
    await dispatch(logout()).unwrap();
    router.replace('/login');
  };

  const handleRefresh = () => {
    // Navigate to login to re-authenticate
    router.push('/login');
  };

  // A sign-in error the user must act on
  if (authError) {
    return (
      <Banner
        tone="negative"
        icon="alert-circle"
        message={authError}
        actions={[
          { label: 'Dismiss', accessibilityLabel: 'Dismiss error', onPress: handleDismissAuthError },
          { label: 'Sign in again', onPress: handleLogout },
        ]}
      />
    );
  }

  // The app configuration could not be loaded
  if (configFetchFailed) {
    return (
      <Banner
        tone="critical"
        icon="alert"
        message="Couldn't load the app settings, so some features may not work. Check your connection and open the app again."
        actions={[{ label: 'Dismiss', accessibilityLabel: 'Dismiss warning', onPress: handleDismissConfigError }]}
      />
    );
  }

  // Session expired
  if (tokenExpired) {
    return (
      <Banner
        tone="negative"
        icon="alert-circle"
        message="Your session has ended. Sign in again to continue."
        actions={[{ label: 'Sign in again', onPress: handleLogout }]}
      />
    );
  }

  // Session expiring soon
  if (tokenExpiryWarning) {
    return (
      <Banner
        tone="critical"
        icon="alert"
        message="Your session ends soon. Sign in again to stay signed in."
        actions={[
          { label: 'Dismiss', accessibilityLabel: 'Dismiss warning', onPress: handleDismissTokenExpiry },
          { label: 'Sign in again', onPress: handleRefresh },
        ]}
      />
    );
  }

  return null;
};
