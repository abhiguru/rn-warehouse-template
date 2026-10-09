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
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DispatchFlashList } from '@/components/lists';
import { ListErrorBoundary } from '@/components/list/ListErrorBoundary';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, type ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  // Floating create button (guide 14.1): brand.fill, shadow[3], 56 px,
  // bottom right above the tab bar.
  fab: {
    position: 'absolute' as const,
    right: layout.marginCompact,
    bottom: layout.marginCompact,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: t.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...t.shadow[3],
  },
  fabPressed: {
    backgroundColor: t.brand.fillPressed,
  },
});

export default function DispatchTab() {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={handleCreateDispatch}
          accessibilityRole="button"
          accessibilityLabel="Create dispatch"
          testID="create-dispatch-fab"
        >
          <Icon name="plus" size={iconSize.lg} color={t.brand.onFill} />
        </Pressable>
      )}
    </View>
  );
}
