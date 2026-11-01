/**
 * "This facility's server needs an update" screen
 *
 * Full-screen state (docs/STYLE_GUIDE.md §13.9) shown when the facility's backend says (`schemaHead` of its public
 * configuration) that it is older than `MIN_BACKEND_MIGRATION` (src/config/backendFeatures.ts, src/config/backendTooOld.ts).
 * The person cannot fix it from the app: it says to ask the facility, and Back leaves, as on the "Update the app" screen
 * it is modelled on (src/components/AppTooOldScreen.tsx).
 */

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { StateActionButton } from '@/components/ErrorBoundary';
import { t as tr } from '@/i18n';

export interface BackendTooOldScreenProps {
  /** Leaves the screen (back to the facility choice or to My facilities). */
  onClose: () => void;
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
  actions: { alignSelf: 'stretch' as const, gap: space.sm },
});

const BackendTooOldScreen: React.FC<BackendTooOldScreenProps> = ({ onClose }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <MaterialCommunityIcons
            name="server-network-off"
            size={iconSize.hero}
            color={t.status.informative.text}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.title} accessibilityRole="header">
            {tr('components.backendTooOld.title')}
          </Text>
          <Text style={styles.message}>{tr('components.backendTooOld.message')}</Text>
          <View style={styles.actions}>
            <StateActionButton fullWidth label={tr('common.back')} onPress={onClose} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default BackendTooOldScreen;
