/**
 * GRNDispatchesTab Component
 *
 * Displays dispatches grouped by GRN item with collapsible accordion sections.
 * Each item section contains a data table showing dispatches for that item.
 */

import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { DispatchRecord } from '@/services/grn-detail-service';
import { GRNItem } from './GRNItemsTab';
import { GRNItemDispatchTable } from './GRNItemDispatchTable';
import { t as tr } from '@/i18n';

interface GRNDispatchesTabProps {
  /** GRN items array */
  items: GRNItem[];
  /** Dispatches grouped by item ID */
  dispatchesByItem: Record<string, DispatchRecord[]>;
  /** Loading state */
  loading?: boolean;
  /** Visible failure state; never represent a failed request as empty history. */
  error?: string | null;
  /** Retry the failed history request. */
  onRetry?: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  contentContainer: {
    padding: layout.marginCompact,
    paddingBottom: space.xxxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.md,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.xxxl,
    backgroundColor: t.background.base,
  },
  emptyIcon: {
    marginBottom: space.lg,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
    textAlign: 'center' as const,
  },
  emptyMessage: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    marginTop: space.xl,
    minHeight: touchTarget,
    minWidth: 120,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryText: {
    ...typography.callout,
    color: t.brand.tint,
  },
});

export const GRNDispatchesTab: React.FC<GRNDispatchesTabProps> = ({
  items,
  dispatchesByItem,
  loading = false,
  error = null,
  onRetry,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (loading) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel={tr('grn.dispatches.loadingLabel')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('grn.dispatches.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="alert-circle-outline"
          size={iconSize.hero}
          color={t.status.negative.text}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle} accessibilityRole="header">
          {tr('grn.dispatches.loadFailedTitle')}
        </Text>
        <Text style={styles.emptyMessage}>{error}</Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('grn.dispatches.retryLabel')}
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Check if there are any dispatches at all
  const hasAnyDispatches = Object.values(dispatchesByItem).some(
    (dispatches) => dispatches.length > 0
  );

  if (!hasAnyDispatches) {
    return (
      <View style={styles.emptyContainer}>
        <Icon
          name="truck-delivery-outline"
          size={iconSize.hero}
          color={t.icon.secondary}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>{tr('grn.dispatches.emptyTitle')}</Text>
        <Text style={styles.emptyMessage}>
          {tr('grn.dispatches.emptyMessage')}
        </Text>
      </View>
    );
  }

  // Find first item with dispatches to auto-expand
  const firstItemWithDispatches = items.find(
    (item) => (dispatchesByItem[item.id] || []).length > 0
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => {
        const itemDispatches = dispatchesByItem[item.id] || [];
        const isFirstWithDispatches = item.id === firstItemWithDispatches?.id;

        return (
          <GRNItemDispatchTable
            key={item.id}
            item={item}
            dispatches={itemDispatches}
            defaultExpanded={isFirstWithDispatches}
          />
        );
      })}
    </ScrollView>
  );
};

export default GRNDispatchesTab;
