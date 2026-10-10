/**
 * Invalid Route Screen
 *
 * PR12 Fix: Displays error when route parameters are invalid.
 * Used with useValidatedRouteParams hook. Full-screen state per
 * docs/STYLE_GUIDE.md §13.9.
 */

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { StateActionButton } from '@/components/ErrorBoundary';
import { t as tr } from '@/i18n';

export interface InvalidRouteScreenProps {
  /** Technical cause. Shown in development builds only. */
  error?: string | null;
  /** Title for the screen */
  title?: string;
  /** Custom message below the title */
  message?: string;
  /** Whether to show a back button */
  showBackButton?: boolean;
  /** Custom back action (defaults to router.back()) */
  onBack?: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.xxxl,
  },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignItems: 'center' as const },
  icon: { marginBottom: space.lg },
  title: { ...typography.title2, color: t.text.primary, textAlign: 'center' as const, marginBottom: space.sm },
  message: { ...typography.body, color: t.text.secondary, textAlign: 'center' as const, marginBottom: space.xxl },
  devStrip: {
    alignSelf: 'stretch' as const,
    backgroundColor: t.status.negative.background,
    borderColor: t.status.negative.border,
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space.md,
    marginBottom: space.xxl,
  },
  devLabel: { ...typography.footnote, fontWeight: fontWeight.semibold, color: t.status.negative.text },
  devText: { ...typography.footnote, color: t.status.negative.text },
});

export function InvalidRouteScreen({
  error,
  title: titleProp,
  message: messageProp,
  showBackButton = true,
  onBack,
}: InvalidRouteScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const title = titleProp ?? tr('components.invalidRoute.title');
  const message = messageProp ?? tr('components.invalidRoute.message');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitle: tr('common.back'),
          headerShown: true,
        }}
      />
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.column}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={iconSize.hero}
              color={t.status.negative.text}
              style={styles.icon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />

            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>

            <Text style={styles.message}>{message}</Text>

            {__DEV__ && error ? (
              <View style={styles.devStrip}>
                <Text style={styles.devLabel}>{tr('components.devDetails')}</Text>
                <Text style={styles.devText} selectable>
                  {error}
                </Text>
              </View>
            ) : null}

            {showBackButton && (
              <StateActionButton
                icon="arrow-left"
                label={tr('common.goBack')}
                onPress={handleBack}
                accessibilityLabel={tr('common.goBack')}
              />
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

export default InvalidRouteScreen;
