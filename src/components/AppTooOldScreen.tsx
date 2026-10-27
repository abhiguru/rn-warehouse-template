/**
 * "Update the app" screen
 *
 * Full-screen state (docs/STYLE_GUIDE.md §13.9) shown when the facility needs a newer app than this one
 * (`minimumClientVersion` of its public configuration; src/config/appTooOld.ts). Both sign-in paths show it:
 * the facility chosen by its address (src/components/OperatorServerSelection.tsx, app/_layout.tsx) and a facility
 * opened from My facilities (app/facilities.tsx). It names the two versions and, when the facility publishes a
 * link for the update, opens it. Without a link it says to ask the facility.
 */

import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { StateActionButton } from '@/components/ErrorBoundary';
import type { AppTooOldInfo } from '@/config/appTooOld';
import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';

export interface AppTooOldScreenProps extends AppTooOldInfo {
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

const AppTooOldScreen: React.FC<AppTooOldScreenProps> = ({ minimum, current, updateUrl, onClose }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const openUpdate = () => {
    if (!updateUrl) return;
    // The link is the facility's; if the phone cannot open it, the person is told, not left with a dead button.
    Linking.openURL(updateUrl).catch(() => showAlert(tr('components.appTooOld.title'), tr('components.appTooOld.noLink')));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <MaterialCommunityIcons
            name="cellphone-arrow-down"
            size={iconSize.hero}
            color={t.status.informative.text}
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.title} accessibilityRole="header">
            {tr('components.appTooOld.title')}
          </Text>
          <Text style={styles.message}>{tr('components.appTooOld.message', { minimum, current })}</Text>
          {updateUrl ? null : <Text style={styles.message}>{tr('components.appTooOld.noLink')}</Text>}
          <View style={styles.actions}>
            {updateUrl ? (
              <StateActionButton
                fullWidth
                icon="open-in-new"
                label={tr('components.appTooOld.update')}
                onPress={openUpdate}
                accessibilityHint={tr('components.appTooOld.updateHint')}
              />
            ) : null}
            <StateActionButton
              fullWidth
              variant={updateUrl ? 'secondary' : 'primary'}
              label={tr('common.back')}
              onPress={onClose}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AppTooOldScreen;
