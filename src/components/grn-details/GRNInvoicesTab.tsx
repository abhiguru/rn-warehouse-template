/**
 * GRNInvoicesTab Component
 *
 * Invoice summary and list for GRN
 * Features:
 * - Summary cards with total amounts
 * - List of invoice numbers
 * - Material Design 3 styling
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useListColors } from '@/hooks/useListColors';

// Using snake_case to match backend RPC types
interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  total_with_tax?: number;
  invoice_numbers: string[];
}

interface GRNInvoicesTabProps {
  invoiceSummary: InvoiceSummary;
}

export const GRNInvoicesTab: React.FC<GRNInvoicesTabProps> = ({
  invoiceSummary,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  const { total_invoices, total_amount, total_with_tax, invoice_numbers } = invoiceSummary;

  if (total_invoices === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.cellBackground }]}>
        <View style={styles.emptyIconContainer}>
          <Icon name="file-document-outline" size={64} color={colors.gray400} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.gray900 }]}>No Invoices</Text>
        <Text style={[styles.emptySubtitle, { color: colors.gray600 }]}>
          No invoices have been generated for this GRN yet
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.cellBackground }]} contentContainerStyle={styles.contentContainer}>
      {/* Summary Cards */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.gray600 }]}>Financial Summary</Text>

        <View style={styles.summaryGrid}>
          {/* Total Invoices */}
          <Card mode="elevated" style={[styles.summaryCard, { backgroundColor: colors.cellBackground }]}>
            <Card.Content style={styles.summaryCardContent}>
              <View style={[styles.iconContainer, { backgroundColor: colors.tealLight }]}>
                <Icon name="file-document-multiple" size={24} color={colors.teal} />
              </View>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>{total_invoices}</Text>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Total Invoices</Text>
            </Card.Content>
          </Card>

          {/* Base Amount */}
          <Card mode="elevated" style={[styles.summaryCard, { backgroundColor: colors.cellBackground }]}>
            <Card.Content style={styles.summaryCardContent}>
              <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
                <Icon name="currency-inr" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.summaryValue, { color: colors.gray900 }]}>₹{total_amount.toLocaleString()}</Text>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Base Amount</Text>
            </Card.Content>
          </Card>

          {/* Total with Tax */}
          <Card mode="elevated" style={[styles.summaryCard, styles.summaryCardFull, { backgroundColor: colors.cellBackground }]}>
            <Card.Content style={styles.summaryCardContent}>
              <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
                <Icon name="cash-multiple" size={24} color={colors.success} />
              </View>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                ₹{(total_with_tax || 0).toLocaleString()}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.gray600 }]}>Total with Tax</Text>
            </Card.Content>
          </Card>
        </View>
      </View>

      {/* Invoice Numbers List */}
      {invoice_numbers.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.gray600 }]}>Invoice Numbers</Text>
          <Card mode="outlined" style={[styles.listCard, { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider }]}>
            <Card.Content>
              {invoice_numbers.map((invoiceNo, index) => (
                <View
                  key={invoiceNo}
                  style={[
                    styles.invoiceRow,
                    index < invoice_numbers.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
                  ]}
                >
                  <View style={styles.invoiceLeft}>
                    <View style={[styles.invoiceNumberCircle, { backgroundColor: colors.gray100 }]}>
                      <Text style={[styles.invoiceNumberText, { color: colors.gray600 }]}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.invoiceNumber, { color: colors.gray900 }]}>{invoiceNo}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.gray500} />
                </View>
              ))}
            </Card.Content>
          </Card>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  // Summary Grid
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
  },
  summaryCardFull: {
    minWidth: '100%',
  },
  summaryCardContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'center',
  },

  // Invoice List
  listCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  invoiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  invoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  invoiceNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  invoiceNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyIconContainer: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
