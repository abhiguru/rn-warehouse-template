/**
 * Force Update Modal Component
 *
 * Blocks the app when its version is below the minimum required
 * (docs/STYLE_GUIDE.md §13.9 and §14.11): a dialog on surface.sheet with
 * radius.card and shadow[4] over overlay.scrim, with one "Update app" action.
 * It cannot be dismissed: neither the scrim nor the Android back button
 * closes it.
 *
 * @module components/ForceUpdateModal
 */

import React from 'react';
import { View, Text, Modal, Platform, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

const ICON_CIRCLE = layout.avatar.lg + space.lg;

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
  },
  dialog: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    alignItems: 'center' as const,
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    padding: space.xxl,
    ...t.shadow[4],
  },
  iconContainer: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
    backgroundColor: t.brand.subtle,
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  description: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xl,
  },
  versionContainer: {
    width: '100%' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    marginBottom: space.xl,
    backgroundColor: t.background.base,
  },
  versionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  versionLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  versionValue: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
    color: t.text.primary,
  },
  updateButton: {
    width: '100%' as const,
    minHeight: touchTarget,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    marginBottom: space.lg,
    backgroundColor: t.brand.fill,
  },
  updateButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  updateButtonLabel: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  securityNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  securityText: {
    ...typography.footnote,
    color: t.text.secondary,
    flexShrink: 1,
  },
});

/** The Android back button does nothing while the update is required. */
const ignoreBack = () => undefined;

/**
 * Force Update Modal
 *
 * Shows a blocking dialog when the app needs to be updated. It appears only when
 * the config has loaded, a minimum version is set, and this build is older.
 *
 * @example
 * ```tsx
 * // Place this near the root of your app
 * <ForceUpdateModal />
 * ```
 */
export function ForceUpdateModal() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const {
    updateRequired,
    currentVersion,
    minimumVersion,
    isConfigLoaded,
    openStore,
  } = useForceUpdate();

  // Don't show if config hasn't loaded yet or no update required
  if (!isConfigLoaded || !updateRequired) {
    return null;
  }

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={ignoreBack}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
          <View style={styles.iconContainer} accessible={false} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="cellphone-arrow-down" size={iconSize.hero} color={t.brand.tint} />
          </View>

          <Text style={styles.title} accessibilityRole="header">
            {tr('components.forceUpdate.title')}
          </Text>

          <Text style={styles.description}>
            {tr('components.forceUpdate.description')}
          </Text>

          <View style={styles.versionContainer}>
            <View style={styles.versionRow} accessible accessibilityLabel={tr('components.forceUpdate.yourVersionLabel', { version: currentVersion })}>
              <Text style={styles.versionLabel}>{tr('components.forceUpdate.yourVersion')}</Text>
              <Text style={styles.versionValue}>{currentVersion}</Text>
            </View>
            <View style={styles.versionRow} accessible accessibilityLabel={tr('components.forceUpdate.requiredVersionLabel', { version: minimumVersion })}>
              <Text style={styles.versionLabel}>{tr('components.forceUpdate.requiredVersion')}</Text>
              <Text style={styles.versionValue}>{minimumVersion}</Text>
            </View>
          </View>

          <Pressable
            onPress={openStore}
            style={({ pressed }) => [styles.updateButton, pressed && styles.updateButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel={tr('components.forceUpdate.updateApp')}
            accessibilityHint={tr(Platform.OS === 'ios' ? 'components.forceUpdate.opensAppStore' : 'components.forceUpdate.opensPlayStore')}
          >
            <MaterialCommunityIcons
              name={Platform.OS === 'ios' ? 'apple' : 'google-play'}
              size={iconSize.md}
              color={t.brand.onFill}
            />
            <Text style={styles.updateButtonLabel}>{tr('components.forceUpdate.updateApp')}</Text>
          </Pressable>

          <View style={styles.securityNotice}>
            <MaterialCommunityIcons name="shield-check-outline" size={iconSize.sm} color={t.status.positive.text} />
            <Text style={styles.securityText}>{tr('components.forceUpdate.securityNotice')}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default ForceUpdateModal;
