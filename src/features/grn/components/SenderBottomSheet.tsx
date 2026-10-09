/**
 * SenderBottomSheet
 *
 * Bottom sheet for selecting senders (customers) with search and recent items.
 * Uses the generic SearchableBottomSheet component.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { searchService } from '@/services/search-service';
import { SearchableBottomSheet } from '@/components/common';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography, touchTarget } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const RECENT_SENDERS_KEY = 'recent_senders';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface SenderBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  currentValue?: {
    id: string;
    name: string;
  };
}

/** Stable avatar colour index from an id, so a sender keeps the same colour. */
function avatarIndex(id: string, count: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % count;
}

const makeStyles = (t: ThemeTokens) => ({
  customerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: Math.max(touchTarget, layout.rowMinHeight),
    backgroundColor: t.surface.sheet,
  },
  customerItemPressed: { backgroundColor: t.surface.cardPressed },
  customerAvatar: {
    width: layout.avatar.sm + space.sm,
    height: layout.avatar.sm + space.sm,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  customerAvatarText: {
    ...typography.headline,
    color: t.mode === 'dark' ? t.overlay.onImage : t.text.primary,
  },
  customerContent: { flex: 1 },
  customerMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  customerName: { ...typography.headline, color: t.text.primary },
  metaText: { ...typography.subhead, color: t.text.secondary, flexShrink: 1 },
});

export const SenderBottomSheet: React.FC<SenderBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Search function
  const searchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    console.log('[SenderBottomSheet] Searching customers with query:', query);
    const results = await searchService.searchCustomers(query);

    if (results && results.length > 0) {
      return results.map((result) => ({
        id: result.value,
        name: result.label,
        phone: '',
        email: '',
        address: result.detail || '',
      }));
    }
    return [];
  }, []);

  // Render customer item
  const renderCustomerItem = useCallback(
    (item: Customer, onItemSelect: (item: Customer) => void) => (
      <Pressable
        style={({ pressed }) => [styles.customerItem, pressed && styles.customerItemPressed]}
        onPress={() => onItemSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={item.address ? `${item.name}, ${item.address}` : item.name}
      >
        <View
          style={[styles.customerAvatar, { backgroundColor: t.avatar[avatarIndex(item.id, t.avatar.length)] }]}
          accessible={false}
          importantForAccessibility="no"
        >
          <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.customerContent}>
          <Text style={styles.customerName} numberOfLines={2}>{item.name}</Text>
          {item.address ? (
            <View style={styles.customerMeta}>
              <Icon name="map-marker-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          ) : null}
        </View>
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      </Pressable>
    ),
    [styles, t]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Customer) => item.id, []);

  return (
    <SearchableBottomSheet<Customer>
      isVisible={isVisible}
      onClose={onClose}
      onSelect={onSelect}
      title="Select sender"
      placeholder="Search customers..."
      searchFn={searchCustomers}
      renderItem={renderCustomerItem}
      keyExtractor={keyExtractor}
      currentValue={currentValue}
      recentItemsKey={RECENT_SENDERS_KEY}
      maxRecentItems={5}
      emptyInitialText="Search for a sender"
      emptySubText="Type at least 2 characters to find customers"
    />
  );
};
