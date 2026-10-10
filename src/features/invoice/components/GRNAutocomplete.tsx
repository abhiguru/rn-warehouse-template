/**
 * GRNAutocomplete - bottom sheet to pick the GRN an invoice is raised for.
 *
 * Style guide §13.3 (search field plus suggestion list, "No matches" empty
 * state, match shown in bold) and §13.9 (bottom sheet on surface.sheet with
 * radius.sheet top corners, grab handle, shadow[4] over the scrim; Android
 * back closes it).
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
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { formatCount, formatDate, toDate } from '@/utils/formatters';

interface GRNAutocompleteProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (grn: InvoiceableGrn) => void;
  currentValue?: InvoiceableGrn | null;
}

const formatGrnDate = (value: string): string => (toDate(value) ? formatDate(value, 'short') : '');

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
  const q = query.trim();
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
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [grns, setGrns] = useState<InvoiceableGrn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Search GRNs function
  const performSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await getInvoiceableGrns(query.trim() || undefined);

      if (response.success && response.data) {
        setGrns(response.data);
      } else {
        setGrns([]);
        setHasError(!response.success);
      }
    } catch (error) {
      console.error('[GRNAutocomplete] Search error:', error);
      setGrns([]);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle search query change with debouncing
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Set new timeout for debounced search
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(text);
      }, 300); // 300ms debounce
    },
    [performSearch]
  );

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
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    onClose();
  }, [onClose]);

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
          accessibilityLabel={`GRN ${item.gr_no}, ${item.customer_name}${date ? `, ${date}` : ''}`}
          accessibilityState={{ selected: isSelected }}
        >
          <Icon name="package-down" size={iconSize.lg} color={t.icon.secondary} />
          <View style={styles.grnContent}>
            <HighlightedText
              text={`GRN ${item.gr_no}`}
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

  // Render empty, loading and error states
  const renderEmptyState = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyState} accessibilityRole="progressbar" accessibilityLabel="Loading GRNs">
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.emptyDescription}>Loading GRNs that can be invoiced…</Text>
        </View>
      );
    }

    if (hasError) {
      return (
        <View style={styles.emptyState}>
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load GRNs</Text>
          <Text style={styles.emptyDescription}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={() => performSearch(searchQuery)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    const query = searchQuery.trim();
    return (
      <View style={styles.emptyState}>
        <Icon name="package-down" size={iconSize.hero} color={t.icon.secondary} />
        <Text style={styles.emptyTitle}>
          {query ? 'No matches' : 'No GRNs to invoice'}
        </Text>
        <Text style={styles.emptyDescription}>
          {query
            ? `No GRNs match "${query}". Try fewer letters.`
            : 'GRNs with dispatched items that are not yet invoiced appear here.'}
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
      statusBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
        {/* Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close GRN list"
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
            <Text style={styles.headerTitle} accessibilityRole="header">Select GRN</Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
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
              placeholder="Search GRN number or customer"
              placeholderTextColor={t.text.placeholder}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search GRN number or customer"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  performSearch('');
                }}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
              </Pressable>
            )}
          </View>

          {/* Results Count */}
          {grns.length > 0 && (
            <View style={styles.resultsCount}>
              <Text style={styles.resultsCountText}>
                {formatCount(grns.length, 'GRN')}
              </Text>
            </View>
          )}

          {/* GRN List */}
          <FlatList
            data={grns}
            keyExtractor={(item: InvoiceableGrn) => item.id}
            renderItem={renderGRNItem}
            ItemSeparatorComponent={renderSeparator}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={renderEmptyState}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          />
        </View>
      </View>
    </Modal>
  );
};
