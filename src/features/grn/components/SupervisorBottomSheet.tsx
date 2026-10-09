/**
 * SupervisorBottomSheet
 *
 * Bottom sheet for selecting supervisors/admins with search.
 * Uses the generic SearchableBottomSheet component.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { SearchableBottomSheet } from '@/components/common';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, space, typography, touchTarget } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { Avatar } from '@/components/ui';
import { formatMobile } from '@/utils/formatters';

interface Supervisor {
  id: string;
  name: string;
  phone?: string;
}

interface SupervisorBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (supervisor: Supervisor) => void;
  currentValue?: {
    id: string;
    name: string;
  };
}

const makeStyles = (t: ThemeTokens) => ({
  supervisorItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: Math.max(touchTarget, layout.rowMinHeight),
    backgroundColor: t.surface.sheet,
  },
  supervisorItemPressed: { backgroundColor: t.surface.cardPressed },
  supervisorContent: { flex: 1 },
  supervisorMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  supervisorName: { ...typography.headline, color: t.text.primary },
  metaText: { ...typography.subhead, color: t.text.secondary, fontVariant: ['tabular-nums' as const] },
});

export const SupervisorBottomSheet: React.FC<SupervisorBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Search function for supervisors using RPC
  const searchSupervisors = useCallback(
    async (query: string): Promise<Supervisor[]> => {
      console.log(
        '[SupervisorBottomSheet] Searching supervisors with query:',
        query
      );

      const { data, error } = await (
        await getAuthenticatedClient()
      ).rpc('get_supervisors', {
        search_query: query,
      });

      if (error) {
        console.error('[SupervisorBottomSheet] RPC error:', error);
        return [];
      }

      // Debug: Log raw response
      if (__DEV__) {
        console.log(
          '[SupervisorBottomSheet] Raw RPC response:',
          JSON.stringify(data, null, 2)
        );
      }

      // Handle both direct array and wrapped response formats
      // Backend may return: [...] or { data: [...], success: true } or { supervisors: [...] }
      let supervisorArray: any[] = [];
      if (Array.isArray(data)) {
        supervisorArray = data;
      } else if (data?.data && Array.isArray(data.data)) {
        supervisorArray = data.data;
      } else if (data?.supervisors && Array.isArray(data.supervisors)) {
        supervisorArray = data.supervisors;
      }

      if (supervisorArray.length > 0) {
        // Map using snake_case field names from backend
        return supervisorArray.map((user: any) => ({
          id: user.id || user.user_id || '',
          name: user.name || user.full_name || user.display_name || '',
          phone: user.phone || user.phone_number || '',
        }));
      }
      return [];
    },
    []
  );

  // Render supervisor item
  const renderSupervisorItem = useCallback(
    (item: Supervisor, onItemSelect: (item: Supervisor) => void) => (
      <Pressable
        style={({ pressed }) => [styles.supervisorItem, pressed && styles.supervisorItemPressed]}
        onPress={() => onItemSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={item.phone ? `${item.name}, ${formatMobile(item.phone)}` : item.name}
      >
        <Avatar name={item.name} id={item.id || null} />
        <View style={styles.supervisorContent}>
          <Text style={styles.supervisorName} numberOfLines={2}>{item.name}</Text>
          {item.phone ? (
            <View style={styles.supervisorMeta}>
              <Icon name="phone-outline" size={iconSize.sm} color={t.icon.secondary} />
              <Text style={styles.metaText}>{formatMobile(item.phone)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    ),
    [styles, t]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Supervisor) => item.id, []);

  return (
    <SearchableBottomSheet<Supervisor>
      isVisible={isVisible}
      onClose={onClose}
      onSelect={onSelect}
      title="Select supervisor"
      placeholder="Search supervisors by name"
      searchFn={searchSupervisors}
      renderItem={renderSupervisorItem}
      keyExtractor={keyExtractor}
      currentValue={currentValue}
      emptyInitialText="Search for a supervisor"
      emptySubText="Type at least 2 characters to find supervisors or admins"
    />
  );
};
