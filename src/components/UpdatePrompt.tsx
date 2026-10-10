/**
 * Update Prompt Component
 *
 * Offers an over-the-air update (docs/STYLE_GUIDE.md §13.9 and §14.11): a
 * dialog on surface.sheet with radius.card and shadow[4] over overlay.scrim.
 * "A new version is available" is informative news; a downloaded update ready
 * to apply is positive. The Android back button and a tap on the scrim
 * dismiss it.
 */

import React, { useEffect } from 'react';
import { View, Text, Modal, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Portal } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useOTAUpdates } from '@/hooks/useOTAUpdates';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface UpdatePromptProps {
  /** Whether to show the prompt as a modal (true) or inline banner (false) */
  asModal?: boolean;
}

const ICON_CIRCLE = layout.avatar.lg;

const makeStyles = (t: ThemeTokens) => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxl,
  },
  container: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    padding: space.xxl,
    maxWidth: layout.maxFormWidth,
    width: '100%' as const,
    alignItems: 'center' as const,
    ...t.shadow[4],
  },
  iconContainer: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
  },
  iconInformative: { backgroundColor: t.status.informative.background },
  iconPositive: { backgroundColor: t.status.positive.background },
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
    marginBottom: space.lg,
  },
  progressContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginBottom: space.lg,
  },
  progressText: {
    ...typography.footnote,
    fontVariant: ['tabular-nums' as const],
    color: t.text.secondary,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    width: '100%' as const,
    padding: space.md,
    marginBottom: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  errorText: {
    ...typography.footnote,
    color: t.status.negative.text,
    flex: 1,
  },
  actions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  button: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
    textAlign: 'center' as const,
  },
});

export function UpdatePrompt({ asModal = true }: UpdatePromptProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const {
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    error,
    downloadProgress,
    downloadUpdate,
    applyUpdate,
    dismissUpdate,
    isEnabled,
  } = useOTAUpdates();

  // Auto-download when update is available
  useEffect(() => {
    if (isUpdateAvailable && !isDownloading && !isUpdatePending) {
      downloadUpdate();
    }
  }, [isUpdateAvailable, isDownloading, isUpdatePending, downloadUpdate]);

  // Auto-apply when update is pending (downloaded)
  // Uncomment this for automatic updates without user prompt:
  // useEffect(() => {
  //   if (isUpdatePending) {
  //     applyUpdate();
  //   }
  // }, [isUpdatePending, applyUpdate]);

  // Don't show anything if no update or updates disabled
  if (!isEnabled || (!isUpdateAvailable && !isUpdatePending)) {
    return null;
  }

  const percent = downloadProgress > 0 ? Math.round(downloadProgress * 100) : null;

  const renderButton = (label: string, onPress: () => void, primary: boolean) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed && (primary ? styles.primaryButtonPressed : styles.secondaryButtonPressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={primary ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );

  const content = (
    <View style={styles.container} accessibilityViewIsModal={asModal}>
      <View
        style={[styles.iconContainer, isUpdatePending ? styles.iconPositive : styles.iconInformative]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <MaterialCommunityIcons
          name={isUpdatePending ? 'check-circle-outline' : 'information-outline'}
          size={iconSize.xl}
          color={isUpdatePending ? t.status.positive.text : t.status.informative.text}
        />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {isUpdatePending ? tr('components.update.ready') : tr('components.update.available')}
      </Text>

      <Text style={styles.description}>
        {isDownloading
          ? tr('components.update.downloadingDescription')
          : isUpdatePending
            ? tr('components.update.readyDescription')
            : tr('components.update.availableDescription')}
      </Text>

      {isDownloading && (
        <View
          style={styles.progressContainer}
          accessible
          accessibilityLabel={percent !== null ? tr('components.update.downloadingPercentLabel', { percent }) : tr('components.update.downloadingLabel')}
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator size="small" color={t.brand.tint} />
          <Text style={styles.progressText}>
            {percent !== null ? tr('components.update.downloadingPercent', { percent }) : tr('components.update.downloading')}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorRow} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
          <Text style={styles.errorText}>
            {tr('components.update.downloadFailed')}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        {isUpdatePending
          ? [renderButton(tr('components.update.later'), dismissUpdate, false), renderButton(tr('components.update.restart'), applyUpdate, true)]
          : !isDownloading && [
              renderButton(tr('components.update.notNow'), dismissUpdate, false),
              renderButton(tr('components.update.download'), downloadUpdate, true),
            ]}
      </View>
    </View>
  );

  if (asModal) {
    return (
      <Portal>
        <Modal
          visible={isUpdateAvailable || isUpdatePending}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={dismissUpdate}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissUpdate}
              accessible={false}
              importantForAccessibility="no"
            />
            {content}
          </View>
        </Modal>
      </Portal>
    );
  }

  return content;
}

export default UpdatePrompt;
