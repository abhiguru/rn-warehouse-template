/**
 * GRNAutocomplete - bottom sheet to pick the GRN an invoice is raised for.
 *
 * Style guide §13.3 (search field plus suggestion list, "No matches" empty
 * state, match shown in bold) and §13.9 (bottom sheet on surface.sheet with
 * radius.sheet top corners, grab handle, shadow[4] over the scrim; Android
 * back closes it).
 *
 * The sheet holds a field, so it follows style guide §5.2: the Modal draws
 * under the navigation bar and a KeyboardAvoidingView lifts the sheet over the
 * keyboard, so the list is never covered by it.
 */
import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { InvoiceableGrn } from '@/types/invoice.types';
import { getInvoiceableGrns } from '@/features/invoice/services/invoiceFormService';
import { formatCount, formatDate, formatSpokenDate, toDate } from '@/utils/formatters';
import { normalizeDigits, t as tr, formatIdentifier } from '@/i18n';
import { createLogger } from '@/utils/logger';
import type { TextInputRef } from '@/types/nativeRefs';

const log = createLogger('GRNAutocomplete');

interface GRNAutocompleteProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (grn: InvoiceableGrn) => void;
  /** The GRN the form holds now: marked with a check where it is in the list. */
  currentValue?: { id: string } | null;
  /**
   * Edit: the invoice's own GRN. It is invoiced already, so it is not among the
   * GRNs that can be invoiced; it is listed first ("Current GRN" while it is the one chosen,
   * "Saved GRN" after the invoice moved to another). Choosing it while it is the current one only
   * closes the sheet; after a change it is selected, so that the form can go back to it.
   */
  pinnedGrn?: Pick<InvoiceableGrn, 'id' | 'gr_no' | 'customer_name'> | null;
  /** The sheet has finished closing (iOS `onDismiss`): a question about the pick may open from here. */
  onDismissed?: () => void;
}

const formatGrnDate = (value: string): string => (toDate(value) ? formatDate(value) : '');

const makeStyles = (t: ThemeTokens) => ({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.overlay.scrim,
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden' as const,
    ...t.shadow[4],
  },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.border.separator,
    marginTop: space.sm,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: layout.marginCompact,
    marginBottom: space.md,
    paddingLeft: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
    minHeight: touchTarget,
  },
  searchIcon: {
    marginRight: space.sm,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
  },
  clearButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  resultsCount: {
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.sm,
    backgroundColor: t.background.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.separator,
  },
  resultsCountText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  listContainer: {
    flexGrow: 1,
    paddingBottom: space.lg,
  },
  grnItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: layout.objectCellMinHeight,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    gap: space.md,
    backgroundColor: t.surface.sheet,
  },
  grnItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  grnItemSelected: {
    backgroundColor: t.surface.selected,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
    marginLeft: layout.marginCompact,
  },
  grnContent: {
    flex: 1,
    gap: space.xxs,
  },
  grnNumber: {
    ...typography.headline,
    color: t.text.primary,
  },
  customerName: {
    ...typography.subhead,
    color: t.text.primary,
  },
  metaText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  bold: {
    fontWeight: fontWeight.bold,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  emptyTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptyDescription: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    marginTop: space.md,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  retryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  retryText: {
    ...typography.callout,
    color: t.brand.tint,
  },
});

/** Shows the part of `text` that matches `query` in bold (style guide §14.6). */
function HighlightedText({ text, query, style, boldStyle }: {
  text: string;
  query: string;
  style: StyleProp<TextStyle>;
  boldStyle: StyleProp<TextStyle>;
}) {
  // Digits typed as ૦-૯ match numbers shown in 0-9.
  const q = normalizeDigits(query.trim());
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) {
    return <Text style={style} numberOfLines={2}>{text}</Text>;
  }
  return (
    <Text style={style} numberOfLines={2}>
      {text.slice(0, index)}
      <Text style={boldStyle}>{text.slice(index, index + q.length)}</Text>
      {text.slice(index + q.length)}
    </Text>
  );
}

export const GRNAutocomplete: React.FC<GRNAutocompleteProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
  pinnedGrn,
  onDismissed,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts the searches; an answer is used only while its search is the latest.
  const searchRequest = useRef(0);
  const inputRef = useRef<TextInputRef>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [grns, setGrns] = useState<InvoiceableGrn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Search GRNs function
  const performSearch = useCallback(async (query: string) => {
    const request = ++searchRequest.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await getInvoiceableGrns(normalizeDigits(query.trim()) || undefined);
      // A later search (or closing the sheet) has taken this one's place.
      if (request !== searchRequest.current) return;

      if (response.success && response.data) {
        setGrns(response.data);
      } else {
        setGrns([]);
        setHasError(!response.success);
      }
    } catch (error) {
      log.error('Search error:', error);
      if (request !== searchRequest.current) return;
      setGrns([]);
      setHasError(true);
    } finally {
      if (request === searchRequest.current) setIsLoading(false);
    }
  }, []);

  const cancelPendingSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  // Handle search query change with debouncing
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);

      // The answer to an earlier query is not wanted any more.
      searchRequest.current += 1;
      cancelPendingSearch();

      // Set new timeout for debounced search
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(text);
      }, 300); // 300ms debounce
    },
    [performSearch, cancelPendingSearch]
  );

  // Clear the field: the full list returns, and a search still waiting to start is dropped.
  const handleClear = useCallback(() => {
    cancelPendingSearch();
    setSearchQuery('');
    void performSearch('');
  }, [cancelPendingSearch, performSearch]);

  // Handle GRN selection
  const handleGRNSelect = useCallback(
    (grn: InvoiceableGrn) => {
      Keyboard.dismiss();
      onSelect(grn);
      onClose();
    },
    [onSelect, onClose]
  );

  // Handle close
  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setSearchQuery('');
    setGrns([]);
    searchRequest.current += 1;
    cancelPendingSearch();
    onClose();
  }, [onClose, cancelPendingSearch]);

  // Load initial GRNs and auto-focus search input when modal opens
  useEffect(() => {
    if (isVisible) {
      setSearchQuery('');
      performSearch('');
      // Auto-focus the search input after modal animation completes
      const focusTimeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 400);
      return () => clearTimeout(focusTimeout);
    }
  }, [isVisible, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Render GRN item
  const renderGRNItem = useCallback(
    ({ item }: { item: InvoiceableGrn }) => {
      const isSelected = currentValue?.id === item.id;
      const date = formatGrnDate(item.date);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.grnItem,
            isSelected && styles.grnItemSelected,
            pressed && styles.grnItemPressed,
          ]}
          onPress={() => handleGRNSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={`${tr('invoice.label.grnNumber', { number: formatIdentifier(item.gr_no) })}, ${item.customer_name}${date ? `, ${formatSpokenDate(item.date)}` : ''}`}
          accessibilityState={{ selected: isSelected }}
        >
          <Icon name="package-down" size={iconSize.lg} color={t.icon.secondary} />
          <View style={styles.grnContent}>
            <HighlightedText
              text={tr('invoice.label.grnNumber', { number: formatIdentifier(item.gr_no) })}
              query={searchQuery}
              style={styles.grnNumber}
              boldStyle={styles.bold}
            />
            <HighlightedText
              text={item.customer_name}
              query={searchQuery}
              style={styles.customerName}
              boldStyle={styles.bold}
            />
            {!!date && <Text style={styles.metaText}>{date}</Text>}
          </View>
          {isSelected && (
            <Icon name="check" size={iconSize.md} color={t.brand.tint} />
          )}
        </Pressable>
      );
    },
    [currentValue, handleGRNSelect, searchQuery, styles, t]
  );

  const renderSeparator = useCallback(() => <View style={styles.divider} />, [styles]);

  // The invoice's own GRN (edit): listed first while it matches what is typed.
  const pinnedMatches = (() => {
    if (!pinnedGrn) return false;
    const query = normalizeDigits(searchQuery.trim()).toLowerCase();
    if (!query) return true;
    return `${pinnedGrn.gr_no} ${pinnedGrn.customer_name}`.toLowerCase().includes(query);
  })();
  const pinnedIsCurrent = !!pinnedGrn && currentValue?.id === pinnedGrn.id;
  const pinnedRow = pinnedGrn && pinnedMatches ? (
    <View>
      <Pressable
        style={({ pressed }) => [styles.grnItem, pinnedIsCurrent && styles.grnItemSelected, pressed && styles.grnItemPressed]}
        onPress={pinnedIsCurrent ? handleClose : () => handleGRNSelect(pinnedGrn as InvoiceableGrn)}
        accessibilityRole="button"
        accessibilityLabel={tr(pinnedIsCurrent ? 'invoice.grnPicker.currentGrnA11y' : 'invoice.grnPicker.savedGrnA11y', { number: formatIdentifier(pinnedGrn.gr_no) })}
        accessibilityState={{ selected: pinnedIsCurrent }}
        testID="grn-picker-current"
      >
        <Icon name="package-down" size={iconSize.lg} color={t.icon.secondary} />
        <View style={styles.grnContent}>
          <Text style={styles.grnNumber} numberOfLines={2}>
            {tr('invoice.label.grnNumber', { number: formatIdentifier(pinnedGrn.gr_no) })}
          </Text>
          <Text style={styles.customerName} numberOfLines={2}>{pinnedGrn.customer_name}</Text>
          <Text style={styles.metaText}>{tr(pinnedIsCurrent ? 'invoice.grnPicker.currentGrn' : 'invoice.grnPicker.savedGrn')}</Text>
        </View>
        {pinnedIsCurrent && <Icon name="check" size={iconSize.md} color={t.brand.tint} />}
      </Pressable>
      <View style={styles.divider} />
    </View>
  ) : undefined;

  // Render empty, loading and error states
  const renderEmptyState = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyState} accessibilityRole="progressbar" accessibilityLabel={tr('invoice.grnPicker.loadingA11y')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyDescription}>{tr('invoice.grnPicker.loading')}</Text>
        </View>
      );
    }

    if (hasError) {
      return (
        <View style={styles.emptyState}>
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle}>{tr('invoice.grnPicker.loadFailedTitle')}</Text>
          <Text style={styles.emptyDescription}>{tr('common.checkConnection')}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={() => performSearch(searchQuery)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{tr('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }

    const query = searchQuery.trim();
    return (
      <View style={styles.emptyState}>
        <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>
          {query ? tr('invoice.grnPicker.noMatchesTitle') : tr('invoice.grnPicker.emptyTitle')}
        </Text>
        <Text style={styles.emptyDescription}>
          {query
            ? tr('invoice.grnPicker.noMatch', { search: query })
            : tr('invoice.grnPicker.emptyText')}
        </Text>
      </View>
    );
  }, [hasError, isLoading, performSearch, searchQuery, styles, t]);

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      onDismiss={onDismissed}
      statusBarTranslucent={true}
      navigationBarTranslucent
    >
      <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
        {/* Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel={tr('invoice.grnPicker.closeListA11y')}
        />

        {/* Bottom Sheet Content */}
        <View
          style={[
            styles.sheetContainer,
            { marginTop: insets.top + space.lg, paddingBottom: insets.bottom },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} accessibilityRole="header">{tr('invoice.form.selectGrn')}</Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={tr('common.close')}
            >
              <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
            </Pressable>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder={tr('invoice.grnPicker.searchPlaceholder')}
              placeholderTextColor={t.text.placeholder}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={tr('invoice.grnPicker.searchPlaceholder')}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={handleClear}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel={tr('common.clearSearch')}
              >
                <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
            )}
          </View>

          {/* Results Count: a live region, so a screen reader hears the count change as the person types */}
          <View accessibilityLiveRegion="polite" testID="grn-picker-count">
            {grns.length > 0 && (
              <View style={styles.resultsCount}>
                <Text style={styles.resultsCountText}>
                  {formatCount(grns.length, 'GRN')}
                </Text>
              </View>
            )}
          </View>

          {/* GRN List */}
          <FlatList
            data={grns}
            keyExtractor={(item: InvoiceableGrn) => item.id}
            renderItem={renderGRNItem}
            ItemSeparatorComponent={renderSeparator}
            contentContainerStyle={styles.listContainer}
            ListHeaderComponent={pinnedRow}
            ListEmptyComponent={renderEmptyState}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
