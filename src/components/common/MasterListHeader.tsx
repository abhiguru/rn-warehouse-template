/**
 * MasterListHeader: the top of the Customers, Items and Users lists (style
 * guide §14.1, §14.6). The stack header above it carries the title only.
 *
 *   search field   ListSearchField: 300 ms, at least two characters
 *   count line     "91 items", wraps at large text, read out when it changes
 *   refresh strip  "Couldn't refresh items. …" with "Try again", when set
 *
 * Draw it above the list, not as the list's header, so it shows in every state
 * of the list (loading, error, empty, nothing matches) and a search can always
 * be changed or cleared. It has no text of its own apart from "Try again":
 * callers pass translated strings.
 *
 * @example
 * <MasterListHeader
 *   listKey="items"
 *   search={search}
 *   onSearch={setSearch}
 *   placeholder={t('items.list.searchPlaceholder')}
 *   loading={isFetching}
 *   countText={formatCount(total, 'item')}
 *   refreshError={refreshFailed ? { message: t('items.list.refreshFailed', { time }), onRetry: refetch } : undefined}
 * />
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { ListSearchField } from '@/features/filters/components/ListSearchField';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { Button } from '@/components/ui/Button';

export interface MasterListHeaderProps {
  /** Key of the list's recent searches (for example 'customers', 'items', 'users'). */
  listKey: string;
  /** The search in effect. */
  search: string;
  /** Called with the search to apply: after 300 ms, and only with two or more characters (or '' to clear). */
  onSearch: (text: string) => void;
  /** Placeholder and spoken name of the field, translated ("Search items"). */
  placeholder: string;
  /** The list is loading results for the current search: the field shows a spinner. */
  loading?: boolean;
  /** The count line under the field, translated ("91 items"); left out when not set. */
  countText?: string;
  /** A reload failed and the list shown is older: the message and what "Try again" does. */
  refreshError?: { message: string; onRetry: () => void };
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    paddingTop: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  count: {
    ...typography.footnote,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.sm,
  },
  refresh: {
    paddingHorizontal: layout.marginCompact,
    paddingBottom: space.sm,
  },
  retry: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.sm,
  },
});

export function MasterListHeader({
  listKey,
  search,
  onSearch,
  placeholder,
  loading = false,
  countText,
  refreshError,
}: MasterListHeaderProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <ListSearchField listKey={listKey} value={search} onSearch={onSearch} placeholder={placeholder} loading={loading} />
      {countText ? (
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {countText}
        </Text>
      ) : null}
      {refreshError ? (
        <View style={styles.refresh}>
          <InlineValidation variant="error" message={refreshError.message} />
          <Button type="tertiary" onPress={refreshError.onRetry} style={styles.retry}>
            {translate('common.retry')}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export default MasterListHeader;
