/**
 * SupervisorBottomSheet
 *
 * Bottom sheet for selecting supervisors/admins with search.
 * Uses the generic SearchableBottomSheet component.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { getSupabaseClient } from '@/config/supabaseConfig';
import { SearchableBottomSheet } from '@/components/common';
import { useListColors } from '@/hooks/useListColors';

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

export const SupervisorBottomSheet: React.FC<SupervisorBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    supervisorItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      minHeight: theme.touchTarget.minimum,
    },
    supervisorName: {
      fontSize: theme.fontSize.base,
      color: colors.textPrimary,
      fontWeight: theme.fontWeight.medium,
    },
    metaText: {
      fontSize: theme.fontSize.sm,
      color: colors.textSecondary,
    },
  }), [colors]);

  // Search function for supervisors using RPC
  const searchSupervisors = useCallback(
    async (query: string): Promise<Supervisor[]> => {
      console.log('[SupervisorBottomSheet] Searching supervisors with query:', query);

      const { data, error } = await getSupabaseClient().rpc('get_supervisors', {
        search_query: query,
      });

      if (error) {
        console.error('[SupervisorBottomSheet] RPC error:', error);
        return [];
      }

      // Debug: Log raw response
      if (__DEV__) {
        console.log('[SupervisorBottomSheet] Raw RPC response:', JSON.stringify(data, null, 2));
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
      <TouchableOpacity
        style={dynamicStyles.supervisorItem}
        onPress={() => onItemSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.supervisorContent}>
          <Text style={dynamicStyles.supervisorName}>{item.name}</Text>
          {item.phone && (
            <View style={styles.supervisorMeta}>
              <Icon name="phone" size={14} color={colors.textSecondary} />
              <Text style={dynamicStyles.metaText}>{item.phone}</Text>
            </View>
          )}
        </View>
        <Icon name="account" size={24} color={colors.textTertiary} />
      </TouchableOpacity>
    ),
    [dynamicStyles, colors]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Supervisor) => item.id, []);

  return (
    <SearchableBottomSheet<Supervisor>
      isVisible={isVisible}
      onClose={onClose}
      onSelect={onSelect}
      title="Select Supervisor"
      placeholder="Search supervisors by name..."
      searchFn={searchSupervisors}
      renderItem={renderSupervisorItem}
      keyExtractor={keyExtractor}
      currentValue={currentValue}
      backdropOpacity={0.4}
      emptyInitialText="Search for a supervisor"
      emptySubText="Type at least 2 characters to find supervisors or admins"
    />
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  supervisorContent: {
    flex: 1,
  },
  supervisorMeta: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
