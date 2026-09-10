/**
 * Force Update Modal Component
 *
 * Displays a blocking modal when the app version is below the minimum required.
 * Users cannot dismiss this modal - they must update the app to continue.
 *
 * @module components/ForceUpdateModal
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Platform,
  useColorScheme,
} from 'react-native';
import { Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useForceUpdate } from '@/hooks/useForceUpdate';
import { colors, darkColors } from '@/theme';

/**
 * Force Update Modal
 *
 * Shows a full-screen blocking modal when app needs to be updated.
 * This modal cannot be dismissed - the user must update to continue.
 *
 * The modal only appears when:
 * 1. Config has been loaded (isConfigLoaded is true)
 * 2. minimumVersion is set in config
 * 3. Current app version is lower than minimumVersion
 *
 * @example
 * ```tsx
 * // Place this near the root of your app
 * <ForceUpdateModal />
 * ```
 */
export function ForceUpdateModal() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

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
      transparent={false}
      statusBarTranslucent
      // No onRequestClose - modal cannot be dismissed
    >
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? themeColors.gray[50] : themeColors.white },
        ]}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: themeColors.orange[50] },
            ]}
          >
            <MaterialCommunityIcons
              name="cellphone-arrow-down"
              size={64}
              color={themeColors.primary}
            />
          </View>

          {/* Title */}
          <Text
            style={[
              styles.title,
              { color: themeColors.gray[900] },
            ]}
          >
            Update Required
          </Text>

          {/* Description */}
          <Text
            style={[
              styles.description,
              { color: themeColors.gray[600] },
            ]}
          >
            A new version of the app is available. Please update to continue
            using the app.
          </Text>

          {/* Version info */}
          <View
            style={[
              styles.versionContainer,
              { backgroundColor: isDark ? themeColors.gray[100] : themeColors.gray[50] },
            ]}
          >
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: themeColors.gray[500] }]}>
                Current version:
              </Text>
              <Text style={[styles.versionValue, { color: themeColors.gray[700] }]}>
                {currentVersion}
              </Text>
            </View>
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: themeColors.gray[500] }]}>
                Required version:
              </Text>
              <Text style={[styles.versionValue, { color: themeColors.primary }]}>
                {minimumVersion}
              </Text>
            </View>
          </View>

          {/* Update button */}
          <Button
            mode="contained"
            onPress={openStore}
            style={styles.updateButton}
            contentStyle={styles.updateButtonContent}
            labelStyle={styles.updateButtonLabel}
            buttonColor={themeColors.primary}
            icon={Platform.OS === 'ios' ? 'apple' : 'google-play'}
          >
            {Platform.OS === 'ios' ? 'Update on App Store' : 'Update on Play Store'}
          </Button>

          {/* Security notice */}
          <View style={styles.securityNotice}>
            <MaterialCommunityIcons
              name="shield-check"
              size={16}
              color={themeColors.semantic.success}
            />
            <Text
              style={[
                styles.securityText,
                { color: themeColors.gray[500] },
              ]}
            >
              This update includes important security improvements
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  versionContainer: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  versionLabel: {
    fontSize: 14,
  },
  versionValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  updateButton: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 16,
  },
  updateButtonContent: {
    height: 52,
  },
  updateButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  securityText: {
    fontSize: 13,
  },
});

export default ForceUpdateModal;
