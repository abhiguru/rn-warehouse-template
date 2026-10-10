/**
 * SupervisorBottomSheet
 *
 * Bottom sheet for selecting supervisors/admins with search.
 * Uses the generic SearchableBottomSheet component.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { SearchableBottomSheet } from '@/components/common';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, space, typography, touchTarget } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { Avatar } from '@/components/ui';
import { t as tr } from '@/i18n';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('grn');

// A colleague is picked by name. The answer also carries each person's mobile
// number; it is not kept and not shown, because it is not needed to pick one.
interface Supervisor {
  id: string;
  name: string;
}

/**
 * The rows of a `get_supervisors` answer, as id and name only. The server may
 * answer `[...]`, `{ data: [...] }` or `{ supervisors: [...] }`.
 */
export const toSupervisors = (data: any): Supervisor[] => {
  let supervisorArray: any[] = [];
  if (Array.isArray(data)) {
    supervisorArray = data;
  } else if (data?.data && Array.isArray(data.data)) {
    supervisorArray = data.data;
  } else if (data?.supervisors && Array.isArray(data.supervisors)) {
    supervisorArray = data.supervisors;
  }
  return supervisorArray.map((user: any) => ({
    id: user.id || user.user_id || '',
    name: user.name || user.full_name || user.display_name || '',
  }));
};

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
  supervisorName: { ...typography.headline, color: t.text.primary },
});

export const SupervisorBottomSheet: React.FC<SupervisorBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  const styles = useThemedStyles(makeStyles);

  // Search function for supervisors using RPC
  const searchSupervisors = useCallback(
    async (query: string): Promise<Supervisor[]> => {

      const { data, error } = await (
        await getAuthenticatedClient()
      ).rpc('get_supervisors', {
        search_query: query,
      });

      if (error) {
        log.error('RPC error', loggableError(error));
        return [];
      }

      return toSupervisors(data);
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
        accessibilityLabel={item.name}
      >
        <Avatar name={item.name} id={item.id || null} />
        <View style={styles.supervisorContent}>
          <Text style={styles.supervisorName} numberOfLines={2}>{item.name}</Text>
        </View>
      </Pressable>
    ),
    [styles]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Supervisor) => item.id, []);

  return (
    <SearchableBottomSheet<Supervisor>
      isVisible={isVisible}
      onClose={onClose}
      onSelect={onSelect}
      title={tr('grn.pickers.supervisorTitle')}
      placeholder={tr('grn.pickers.supervisorPlaceholder')}
      searchFn={searchSupervisors}
      renderItem={renderSupervisorItem}
      keyExtractor={keyExtractor}
      currentValue={currentValue}
      emptyInitialText={tr('grn.pickers.supervisorEmptyInitial')}
      emptySubText={tr('grn.pickers.supervisorEmptySub')}
    />
  );
};
