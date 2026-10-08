/**
 * DispatchInvoicesTab Component - 100% SAP Fiori Compliant
 *
 * Invoices tab showing invoice summary for the dispatch
 * Features:
 * - Summary cards with totals in Fiori style
 * - List of invoice numbers
 * - Dynamic colors for dark mode support
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency } from '@/utils/formatters';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// ============================================================================
const FIORI_STATIC = {
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  typography: {
    headline: {
      fontSize: 17,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
  },
  dimensions: {
    cardRadius: 12,
    cardPadding: 16,
  },
  shadows: {
    card: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }) as ViewStyle,
  },
} as const;

// Using snake_case to match backend RPC types
export interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  invoice_numbers?: number[];
}

interface DispatchInvoicesTabProps {
  invoiceSummary: InvoiceSummary;
}

export const DispatchInvoicesTab: React.FC<DispatchInvoicesTabProps> = ({
  invoiceSummary,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray50,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.cardRadius,
      padding: FIORI_STATIC.spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cellDivider,
      ...FIORI_STATIC.shadows.card,
    },
    summaryLabel: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
      textAlign: 'center',
    },
    invoicesSection: {
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.cardRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      overflow: 'hidden',
      ...FIORI_STATIC.shadows.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
      paddingVertical: FIORI_STATIC.spacing.sm,
      backgroundColor: colors.gray50,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
      gap: 6,
    },
    sectionTitle: {
      ...FIORI_STATIC.typography.sectionHeader,
      color: colors.gray600,
    },
    invoiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: FIORI_STATIC.dimensions.cardPadding,
      paddingVertical: FIORI_STATIC.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    invoiceIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: FIORI_STATIC.spacing.sm,
    },
    invoiceNumberText: {
      ...FIORI_STATIC.typography.body,
      fontWeight: '600' as const,
      color: colors.gray900,
    },
    invoiceSubtext: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray500,
      marginTop: 1,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: FIORI_STATIC.spacing.xl,
      minHeight: 400,
      backgroundColor: colors.gray50,
    },
    emptyTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
      marginBottom: FIORI_STATIC.spacing.sm,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
      textAlign: 'center',
      lineHeight: 20,
    },
  }), [colors]);

  const renderEmpty = () => (
    <View style={dynamicStyles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Icon name="file-document-outline" size={56} color={colors.gray500} />
      </View>
      <Text style={dynamicStyles.emptyTitle}>No invoices found</Text>
      <Text style={dynamicStyles.emptySubtitle}>
        No invoices are associated with this dispatch yet
      </Text>
    </View>
  );

  if (invoiceSummary.total_invoices === 0) {
    return renderEmpty();
  }

  const invoiceNumbers = invoiceSummary.invoice_numbers || [];

  return (
    <ScrollView
      style={dynamicStyles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary Cards */}
      <View style={styles.summaryGrid}>
        {/* Total Invoices */}
        <View style={dynamicStyles.summaryCard}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.tealLight }]}>
            <Icon name="file-document-multiple" size={20} color={colors.teal} />
          </View>
          <Text style={[styles.summaryValue, { color: colors.teal }]}>
            {invoiceSummary.total_invoices}
          </Text>
          <Text style={dynamicStyles.summaryLabel}>
            {invoiceSummary.total_invoices === 1 ? 'Invoice' : 'Invoices'}
          </Text>
        </View>

        {/* Total Amount */}
        <View style={dynamicStyles.summaryCard}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.successLight }]}>
            <Icon name="currency-inr" size={20} color={colors.success} />
          </View>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {formatCurrency(invoiceSummary.total_amount)}
          </Text>
          <Text style={dynamicStyles.summaryLabel}>Total Amount</Text>
        </View>
      </View>

      {/* Invoice Numbers List */}
      {invoiceNumbers.length > 0 && (
        <View style={dynamicStyles.invoicesSection}>
          <View style={dynamicStyles.sectionHeader}>
            <Icon name="receipt" size={16} color={colors.gray600} />
            <Text style={dynamicStyles.sectionTitle}>Invoice Numbers</Text>
          </View>
          <View style={styles.invoicesList}>
            {invoiceNumbers.map((invoiceNo, index) => (
              <View
                key={index}
                style={[
                  dynamicStyles.invoiceCard,
                  index === invoiceNumbers.length - 1 && styles.invoiceCardLast
                ]}
              >
                <View style={dynamicStyles.invoiceIconCircle}>
                  <Icon name="file-document" size={16} color={colors.primary} />
                </View>
                <View style={styles.invoiceInfo}>
                  <Text style={dynamicStyles.invoiceNumberText}>Invoice #{invoiceNo}</Text>
                  <Text style={dynamicStyles.invoiceSubtext}>Tap to view details</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.gray500} />
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
};

// Static styles (layout only - colors are in dynamicStyles)
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    paddingTop: FIORI_STATIC.spacing.md,
    paddingBottom: FIORI_STATIC.spacing.xl,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: FIORI_STATIC.spacing.sm,
    marginBottom: FIORI_STATIC.spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: FIORI_STATIC.spacing.sm,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  invoicesList: {
    paddingVertical: FIORI_STATIC.spacing.sm,
  },
  invoiceCardLast: {
    borderBottomWidth: 0,
  },
  invoiceInfo: {
    flex: 1,
  },
  emptyIconContainer: {
    marginBottom: FIORI_STATIC.spacing.md,
  },
});
