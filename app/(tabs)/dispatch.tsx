/**
 * Dispatch Tab
 *
 * Displays the list of dispatches using DispatchFlashList.
 * Auth is handled by the parent (tabs)/_layout.tsx.
 *
 * Features:
 * - FlashList for optimal scroll performance
 * - Memoized list items prevent unnecessary re-renders
 * - Stable callbacks for better performance
 * - Floating create button for roles that can create (guide 14.1)
 */

import React, { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { DispatchFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles } from '@/hooks/useTheme';
import { Fab } from '@/components/ui/Fab';
import { t } from '@/i18n';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
});

export default function DispatchTab() {
  const styles = useThemedStyles(makeStyles);
  const { canCreate } = usePermissions();

  const handleCreateDispatch = useCallback(() => {
    router.push('/dispatch-form/step1');
  }, []);

  return (
    <View style={styles.container}>
      <ListErrorBoundary listName="dispatches">
        <DispatchFlashList />
      </ListErrorBoundary>
      {canCreate && (
        <Fab label={t('lists.dispatch.create')} onPress={handleCreateDispatch} testID="create-dispatch-fab" />
      )}
    </View>
  );
}
