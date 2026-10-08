import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { InvoiceableGrn } from '@/types/invoice.types';
import { getInvoiceableGrns } from '@/features/invoice/services/invoiceFormService';

interface GRNAutocompleteProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (grn: InvoiceableGrn) => void;
  currentValue?: InvoiceableGrn | null;
}

export const GRNAutocomplete: React.FC<GRNAutocompleteProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentValue,
}) => {
  const { colors: themeColors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [grns, setGrns] = useState<InvoiceableGrn[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Search GRNs function
  const performSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const response = await getInvoiceableGrns(query.trim() || undefined);

      if (response.success && response.data) {
        setGrns(response.data);
      } else {
        setGrns([]);
      }
    } catch (error) {
      console.error('[GRNAutocomplete] Search error:', error);
      setGrns([]);
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
    ({ item, index }: { item: InvoiceableGrn; index: number }) => {
      const isSelected = currentValue?.id === item.id;
      const isLast = index === grns.length - 1;

      return (
        <TouchableOpacity
          style={[
            styles.grnItem,
            {
              backgroundColor: isDarkMode ? themeColors.gray[100] : themeColors.white,
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: themeColors.gray[200],
            },
            isSelected && {
              backgroundColor: isDarkMode ? themeColors.orange[100] : themeColors.orange[50],
              borderLeftWidth: 4,
              borderLeftColor: themeColors.primary,
            },
          ]}
          onPress={() => handleGRNSelect(item)}
          activeOpacity={0.7}
        >
          <View style={styles.grnContent}>
            <View style={styles.grnHeader}>
              <View style={[styles.grnNumberBadge, { backgroundColor: themeColors.primary }]}>
                <Text style={[styles.grnNumber, { color: themeColors.white }]}>{item.gr_no}</Text>
              </View>
              {isSelected && (
                <Icon name="check-circle" size={22} color={themeColors.primary} />
              )}
            </View>
            <Text style={[styles.customerName, { color: themeColors.gray[900] }]}>{item.customer_name}</Text>
            <View style={styles.grnMeta}>
              <View style={[styles.metaBadge, { backgroundColor: themeColors.gray[100] }]}>
                <Icon name="calendar" size={12} color={themeColors.gray[500]} />
                <Text style={[styles.metaText, { color: themeColors.gray[600] }]}>
                  {new Date(item.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [currentValue, handleGRNSelect, isDarkMode, themeColors, grns.length]
  );

  // Render empty state
  const renderEmptyState = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.emptyTitle, { color: themeColors.gray[700] }]}>
            Loading invoiceable GRNs...
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Icon name="package-variant-closed" size={48} color={themeColors.gray[300]} />
        <Text style={[styles.emptyTitle, { color: themeColors.gray[700] }]}>
          {searchQuery.trim() ? 'No GRNs Found' : 'No Invoiceable GRNs'}
        </Text>
        <Text style={[styles.emptyDescription, { color: themeColors.gray[500] }]}>
          {searchQuery.trim()
            ? 'Try adjusting your search query'
            : 'No GRNs with dispatched items available for invoicing'}
        </Text>
      </View>
    );
  }, [isLoading, searchQuery, themeColors]);

  // Background color for modal
  const bgColor = isDarkMode ? themeColors.gray[50] : themeColors.white;

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
        <Pressable style={styles.backdrop} onPress={handleClose} />

        {/* Bottom Sheet Content */}
        <View style={[
          styles.sheetContainer,
          {
            backgroundColor: bgColor,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }
        ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.gray[200] }]}>
            <Icon name="clipboard-text" size={24} color={themeColors.primary} />
            <Text style={[styles.headerTitle, { color: themeColors.gray[900] }]}>Select GRN</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color={themeColors.gray[500]} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={[styles.searchContainer, {
            backgroundColor: isDarkMode ? themeColors.gray[200] : themeColors.gray[50],
            borderColor: themeColors.gray[300],
          }]}>
            <Icon name="magnify" size={20} color={themeColors.gray[500]} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: themeColors.gray[900] }]}
              placeholder="Search by GR No or Customer..."
              placeholderTextColor={themeColors.gray[400]}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  performSearch('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close-circle" size={20} color={themeColors.gray[400]} />
              </TouchableOpacity>
            )}
          </View>

          {/* Results Count */}
          {grns.length > 0 && (
            <View style={[styles.resultsCount, { backgroundColor: themeColors.gray[50], borderBottomColor: themeColors.gray[200] }]}>
              <Text style={[styles.resultsCountText, { color: themeColors.gray[600] }]}>
                {grns.length} GRN{grns.length !== 1 ? 's' : ''} found
              </Text>
            </View>
          )}

          {/* GRN List */}
          <FlatList
            data={grns}
            keyExtractor={(item: InvoiceableGrn) => item.id}
            renderItem={renderGRNItem}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={renderEmptyState}
            style={{ backgroundColor: bgColor }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  resultsCount: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  resultsCountText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContainer: {
    flexGrow: 1,
    paddingBottom: theme.spacing.lg,
  },
  grnItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  grnContent: {
    gap: theme.spacing.xs,
  },
  grnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  grnNumberBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  grnNumber: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  grnMeta: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: 4,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
});
