/**
 * Why the person was signed out without asking (a key change, a revoked session): the stored
 * reason of the forced sign-out, shown once as a message strip with "Dismiss" (docs/STYLE_GUIDE.md
 * §13.9). It sits at the top of My facilities, and of the facility "Sign in" screen without central
 * login, and is gone after Dismiss or the next sign-in. Draws nothing when there is no reason.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearSignOutReason } from '@/store/slices/authSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const makeStyles = (t: ThemeTokens) => ({
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.sm,
    paddingLeft: space.md,
    paddingVertical: space.xs,
    backgroundColor: t.status.critical.background,
    borderColor: t.status.critical.border,
    borderWidth: 1,
    borderRadius: radius.button,
  },
  text: { ...typography.subhead, color: t.status.critical.text, flex: 1, paddingVertical: space.xs },
  dismiss: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: space.md, justifyContent: 'center' as const },
  dismissText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.brand.tint },
});

export function SignOutReasonStrip() {
  const reason = useAppSelector(state => state.auth.signOutReason);
  const dispatch = useAppDispatch();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (!reason) return null;
  return (
    <View style={styles.strip} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="sign-out-reason">
      <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
      <Text style={styles.text}>{reason}</Text>
      <Pressable
        style={styles.dismiss}
        onPress={() => dispatch(clearSignOutReason())}
        accessibilityRole="button"
        accessibilityLabel={tr('common.dismiss')}
        testID="sign-out-reason-dismiss"
      >
        <Text style={styles.dismissText}>{tr('common.dismiss')}</Text>
      </Pressable>
    </View>
  );
}
