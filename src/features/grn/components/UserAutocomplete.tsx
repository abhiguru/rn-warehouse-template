/**
 * UserAutocomplete - User search autocomplete
 *
 * Uses RemoteAutocompleteInput (Generic Autocomplete) for consistent UX.
 * Provides user-specific data fetching and rendering with role badges.
 *
 * @module features/grn/components/UserAutocomplete
 */

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { useThemedStyles } from '@/hooks/useTheme';
import { space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

// ============================================================================
// TYPES
// ============================================================================

interface User {
  id: string;
  name: string;
  phone?: string;
}

interface UserAutocompleteProps {
  value?: { id: string; name: string };
  onChange: (user: { id: string; name: string }) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  helperText?: string;
  zIndex?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const UserAutocomplete: React.FC<UserAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Search supervisors',
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  zIndex = 1000,
}) => {
  const styles = useThemedStyles(makeStyles);

  // Fetch supervisors using RPC (bypasses RLS)
  const fetchUsers = useCallback(async (query: string): Promise<User[]> => {
    if (query.length < 2) {
      return [];
    }

    try {
      const { data, error: rpcError } = await (
        await getAuthenticatedClient()
      ).rpc('get_supervisors', {
        search_query: query,
      });

      if (rpcError) {
        console.error('[UserAutocomplete] RPC error:', rpcError);
        return [];
      }

      return (data || []).map(
        (user: { id: string; name: string; phone: string }) => ({
          id: user.id,
          name: user.name,
          phone: user.phone || '',
        })
      );
    } catch (err) {
      console.error('[UserAutocomplete] Search error:', err);
      return [];
    }
  }, []);

  // Handle user selection
  const handleSelect = useCallback(
    (user: User | null) => {
      if (user) {
        onChange({ id: user.id, name: user.name });
      } else {
        onChange({ id: '', name: '' });
      }
    },
    [onChange]
  );

  // Render dropdown item
  const renderItem = useCallback((user: User) => {
    return (
      <View style={styles.itemContainer}>
        <Text style={styles.itemName} numberOfLines={1}>
          {user.name}
        </Text>
        {user.phone ? <Text style={styles.phoneText}>{user.phone}</Text> : null}
      </View>
    );
  }, [styles]);

  // Key extractor
  const keyExtractor = useCallback((user: User) => user.id, []);

  return (
    <RemoteAutocompleteInput<User>
      value={value?.name || ''}
      label={label}
      placeholder={placeholder}
      helperText={helperText}
      error={error}
      required={required}
      fetchData={fetchUsers}
      onSelect={handleSelect}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      zIndex={zIndex}
      editable={!disabled}
      minChars={2}
      debounceMs={300}
      emptyText="No matches"
    />
  );
};

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  itemContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  itemName: { ...typography.headline, color: t.text.primary, flex: 1 },
  phoneText: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
    marginLeft: space.sm,
  },
});

export default UserAutocomplete;
