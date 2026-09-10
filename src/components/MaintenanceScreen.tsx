/**
 * Maintenance Mode Screen
 *
 * SAP Fiori Design System - Empty State Component
 * Spec: design/sap-fiori-specs/12-empty-state.md
 *
 * Displayed when the app is in maintenance mode.
 * Shows maintenance message with support contact info.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSupport, useEnvironment } from '@/hooks/useConfig';
import { colors, darkColors } from '@/theme';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/12-empty-state.md
// ============================================================================
const FIORI = {
  // Container
  container: {
    padding: 24,
  },
  // Illustration
  illustration: {
    containerSize: 120,
    iconSize: 64,
  },
  // Typography
  typography: {
    title: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
    description: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '600' as const },
    sectionText: { fontSize: 12, fontWeight: '400' as const, lineHeight: 18 },
    footer: { fontSize: 12, fontWeight: '400' as const },
    envInfo: { fontSize: 11, fontWeight: '500' as const },
  },
  // Button
  button: {
    height: 44,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  // Spacing
  spacing: {
    illustrationToTitle: 24,
    titleToDescription: 8,
    descriptionToContent: 24,
    contentGap: 16,
    buttonGap: 8,
  },
} as const;

const MaintenanceScreen: React.FC = () => {
  const support = useSupport();
  const environment = useEnvironment();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const handleEmailPress = () => {
    if (support?.email) {
      Linking.openURL(`mailto:${support.email}`);
    }
  };

  const handlePhonePress = () => {
    if (support?.phone) {
      Linking.openURL(`tel:${support.phone}`);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.white }]}
      accessible={true}
      accessibilityLabel="Maintenance screen. The app is currently under maintenance."
    >
      <View style={styles.content}>
        {/* Illustration - Fiori Information State */}
        <View
          style={[
            styles.illustrationContainer,
            { backgroundColor: themeColors.fiori.semantic.criticalLight },
          ]}
          accessible={false}
        >
          <Ionicons
            name="construct-outline"
            size={FIORI.illustration.iconSize}
            color={themeColors.fiori.semantic.critical}
          />
        </View>

        {/* Title */}
        <Text
          style={[styles.title, { color: themeColors.fiori.text.primary }]}
          accessibilityRole="header"
        >
          Under Maintenance
        </Text>

        {/* Description */}
        <Text
          style={[styles.description, { color: themeColors.fiori.text.secondary }]}
        >
          We're currently performing scheduled maintenance to improve your
          experience. We'll be back online shortly.
        </Text>

        {/* Support Info - Fiori Card style */}
        {support && (support.email || support.phone) && (
          <View style={[styles.supportSection, { backgroundColor: themeColors.gray[50] }]}>
            <Ionicons
              name="help-circle-outline"
              size={20}
              color={themeColors.fiori.text.secondary}
              style={styles.sectionIcon}
            />
            <View style={styles.sectionContent}>
              <Text
                style={[styles.sectionTitle, { color: themeColors.fiori.text.primary }]}
              >
                Need Help?
              </Text>

              {support.email && (
                <Pressable
                  style={({ pressed }) => [
                    styles.supportRow,
                    pressed && { backgroundColor: themeColors.gray[100] },
                  ]}
                  onPress={handleEmailPress}
                  accessibilityRole="button"
                  accessibilityLabel={`Email support at ${support.email}`}
                  accessibilityHint="Opens email app"
                >
                  <Ionicons
                    name="mail-outline"
                    size={16}
                    color={themeColors.primary}
                    style={styles.supportIcon}
                  />
                  <Text style={[styles.supportText, { color: themeColors.primary }]}>
                    {support.email}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={themeColors.gray[400]}
                  />
                </Pressable>
              )}

              {support.phone && (
                <Pressable
                  style={({ pressed }) => [
                    styles.supportRow,
                    pressed && { backgroundColor: themeColors.gray[100] },
                  ]}
                  onPress={handlePhonePress}
                  accessibilityRole="button"
                  accessibilityLabel={`Call support at ${support.phone}`}
                  accessibilityHint="Opens phone app"
                >
                  <Ionicons
                    name="call-outline"
                    size={16}
                    color={themeColors.primary}
                    style={styles.supportIcon}
                  />
                  <Text style={[styles.supportText, { color: themeColors.primary }]}>
                    {support.phone}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={themeColors.gray[400]}
                  />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Environment Info */}
        {environment && (
          <View style={styles.envSection}>
            <Text style={[styles.envLabel, { color: themeColors.fiori.text.tertiary }]}>
              {environment.name} • v{environment.version}
            </Text>
            {environment.buildDate && (
              <Text style={[styles.envDate, { color: themeColors.fiori.text.tertiary }]}>
                Built: {new Date(environment.buildDate).toLocaleString()}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: themeColors.gray[200] }]}>
        <Ionicons
          name="heart-outline"
          size={14}
          color={themeColors.fiori.text.tertiary}
          style={styles.footerIcon}
        />
        <Text style={[styles.footerText, { color: themeColors.fiori.text.tertiary }]}>
          Thank you for your patience!
        </Text>
      </View>
    </View>
  );
};

// ============================================================================
// Styles - SAP Fiori Design System
// Colors are applied dynamically in JSX for dark mode support
// ============================================================================
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: FIORI.container.padding,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Illustration Container - 120x120pt per Fiori spec
  illustrationContainer: {
    width: FIORI.illustration.containerSize,
    height: FIORI.illustration.containerSize,
    borderRadius: FIORI.illustration.containerSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI.spacing.illustrationToTitle,
  },

  // Title - 20pt Semibold
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    marginBottom: FIORI.spacing.titleToDescription,
    textAlign: 'center',
  },

  // Description - 14pt Regular
  description: {
    fontSize: FIORI.typography.description.fontSize,
    fontWeight: FIORI.typography.description.fontWeight,
    lineHeight: FIORI.typography.description.lineHeight,
    textAlign: 'center',
    marginBottom: FIORI.spacing.descriptionToContent,
    maxWidth: 320,
  },

  // Support Section - Fiori Card style
  supportSection: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: FIORI.spacing.contentGap,
    width: '100%',
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  sectionContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: FIORI.typography.sectionTitle.fontSize,
    fontWeight: FIORI.typography.sectionTitle.fontWeight,
    marginBottom: 12,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginBottom: 4,
    minHeight: 44, // Fiori touch target
  },
  supportIcon: {
    marginRight: 12,
  },
  supportText: {
    flex: 1,
    fontSize: FIORI.typography.sectionText.fontSize,
    fontWeight: '500',
    lineHeight: FIORI.typography.sectionText.lineHeight,
  },

  // Environment Info
  envSection: {
    marginTop: FIORI.spacing.contentGap,
    alignItems: 'center',
  },
  envLabel: {
    fontSize: FIORI.typography.envInfo.fontSize,
    fontWeight: FIORI.typography.envInfo.fontWeight,
  },
  envDate: {
    fontSize: FIORI.typography.envInfo.fontSize,
    marginTop: 4,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingVertical: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerIcon: {
    marginRight: 6,
  },
  footerText: {
    fontSize: FIORI.typography.footer.fontSize,
    fontWeight: FIORI.typography.footer.fontWeight,
    fontStyle: 'italic',
  },
});

export default MaintenanceScreen;
