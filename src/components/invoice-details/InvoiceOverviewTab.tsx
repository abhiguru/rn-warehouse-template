/**
 * InvoiceOverviewTab Component
 *
 * Uses shared overview tab components for consistent Fiori styling
 * Includes unique sections for customer details, GRN reference, and financial summary
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  FIORI,
  overviewStyles,
  useOverviewColors,
  SectionHeader,
  NotesSection,
  ActionsSection,
} from '@/components/common/overview-tab';
import { useListColors } from '@/hooks/useListColors';
import { formatCurrency } from '@/utils/formatters';

// ============================================================================
// TYPES
// ============================================================================
interface CustomerDetails {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst?: string;
  pan?: string;
  email?: string;
  mobile?: string;
}

interface GRNDetails {
  id: string;
  number: string;
  date: string;
  supervisor_name?: string;
  registration?: string;
}

interface FinancialSummary {
  subtotal: number;
  discount: number;
  labour: number;
  tax_amount: number;
  total: number;
}

interface InvoiceOverviewTabProps {
  customer_details?: CustomerDetails;
  grn_details?: GRNDetails;
  financial_summary: FinancialSummary;
  financial_year?: string;
  notes?: string;
  invoice_number?: string;
  invoice_id?: string;
  on_view_grn?: (grn_id: string) => void;
  on_edit_invoice?: () => void;
  on_delete_invoice?: () => void;
  can_edit?: boolean;
  can_delete?: boolean;
  is_deleting?: boolean;
  on_share_pdf?: () => void;
  is_share_loading?: boolean;
  on_print?: () => void;
  is_print_loading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const InvoiceOverviewTab: React.FC<InvoiceOverviewTabProps> = ({
  customer_details,
  grn_details,
  financial_summary,
  financial_year,
  notes,
  invoice_number,
  invoice_id,
  on_view_grn,
  on_edit_invoice,
  on_delete_invoice,
  can_edit = true,
  can_delete,
  is_deleting = false,
  on_share_pdf,
  is_share_loading = false,
  on_print,
  is_print_loading = false,
}) => {
  const colorStyles = useOverviewColors();
  const colors = useListColors();

  // Dynamic styles for invoice-specific components
  const dynamicStyles = useMemo(() => StyleSheet.create({
    customerDetailsContainer: {
      paddingHorizontal: FIORI.dimensions.cardPadding,
      paddingBottom: FIORI.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    taxChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.gray50,
      paddingHorizontal: FIORI.spacing.md,
      paddingVertical: FIORI.spacing.xs,
      borderRadius: 16,
      gap: FIORI.spacing.xs,
    },
    taxChipLabel: {
      ...FIORI.typography.caption,
      color: colors.gray600,
      fontWeight: '600',
    },
    taxChipValue: {
      ...FIORI.typography.caption,
      color: colors.gray900,
      fontWeight: '500',
    },
    grnDetailsContainer: {
      paddingHorizontal: FIORI.dimensions.cardPadding,
      paddingBottom: FIORI.dimensions.cardPadding,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
    },
    financialContainer: {
      paddingHorizontal: FIORI.dimensions.cardPadding,
      paddingBottom: FIORI.dimensions.cardPadding,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
    },
    financialRowTotal: {
      paddingTop: FIORI.spacing.md,
      marginTop: FIORI.spacing.sm,
      borderTopWidth: 2,
      borderTopColor: colors.cellDivider,
    },
    financialLabel: {
      ...FIORI.typography.body,
      color: colors.gray600,
    },
    financialValue: {
      ...FIORI.typography.bodyMedium,
      color: colors.gray900,
    },
    financialLabelTotal: {
      ...FIORI.typography.headline,
      color: colors.gray900,
    },
    financialValueTotal: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.success,
    },
  }), [colors]);

  const handlePhonePress = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmailPress = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const handleGRNPress = () => {
    if (grn_details && on_view_grn) {
      on_view_grn(grn_details.id);
    }
  };

  // Invoice-specific Customer Card with address and tax details
  const CustomerCard = () => {
    if (!customer_details) return null;

    return (
      <View style={[overviewStyles.card, colorStyles.card]}>
        {/* Object Cell Header */}
        <View style={overviewStyles.objectCellHeader}>
          <View style={[overviewStyles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Icon name="account" size={24} color={colors.primary} />
          </View>
          <View style={overviewStyles.objectCellContent}>
            <Text style={[overviewStyles.objectCellLabel, colorStyles.objectCellLabel]}>Customer</Text>
            <Text style={[overviewStyles.objectCellHeadline, colorStyles.objectCellHeadline]}>{customer_details.name}</Text>
          </View>
        </View>

        {/* Address & Tax Info */}
        {(customer_details.address || customer_details.city || customer_details.gst || customer_details.pan) && (
          <View style={dynamicStyles.customerDetailsContainer}>
            {(customer_details.address || customer_details.city) && (
              <View style={overviewStyles.detailRow}>
                <Icon name="map-marker" size={18} color={colorStyles.iconTertiary} />
                <Text style={[overviewStyles.detailText, colorStyles.detailText]}>
                  {[
                    customer_details.address,
                    customer_details.city,
                    customer_details.state,
                    customer_details.pincode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
            )}

            {(customer_details.gst || customer_details.pan) && (
              <View style={styles.taxChipsRow}>
                {customer_details.gst && (
                  <View style={dynamicStyles.taxChip}>
                    <Text style={dynamicStyles.taxChipLabel}>GST</Text>
                    <Text style={dynamicStyles.taxChipValue}>{customer_details.gst}</Text>
                  </View>
                )}
                {customer_details.pan && (
                  <View style={dynamicStyles.taxChip}>
                    <Text style={dynamicStyles.taxChipLabel}>PAN</Text>
                    <Text style={dynamicStyles.taxChipValue}>{customer_details.pan}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Contact Actions */}
        {(customer_details.mobile || customer_details.email) && (
          <View style={[overviewStyles.contactActionsContainer, colorStyles.contactActionsContainer]}>
            {customer_details.mobile && (
              <Pressable
                style={({ pressed }) => [
                  overviewStyles.contactAction,
                  pressed && colorStyles.contactActionPressed,
                ]}
                onPress={() => handlePhonePress(customer_details.mobile!)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${customer_details.name}`}
              >
                <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                  <Icon name="phone" size={18} color={colorStyles.iconSuccess} />
                </View>
                <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>{customer_details.mobile}</Text>
                <Icon name="chevron-right" size={20} color={colorStyles.iconTertiary} />
              </Pressable>
            )}

            {customer_details.email && (
              <Pressable
                style={({ pressed }) => [
                  overviewStyles.contactAction,
                  customer_details.mobile && overviewStyles.contactActionBorder,
                  customer_details.mobile && colorStyles.contactActionBorder,
                  pressed && colorStyles.contactActionPressed,
                ]}
                onPress={() => handleEmailPress(customer_details.email!)}
                accessibilityRole="button"
                accessibilityLabel={`Email ${customer_details.name}`}
              >
                <View style={[overviewStyles.contactActionIcon, colorStyles.contactActionIcon]}>
                  <Icon name="email" size={18} color={colorStyles.iconInfo} />
                </View>
                <Text style={[overviewStyles.contactActionText, colorStyles.contactActionText]}>{customer_details.email}</Text>
                <Icon name="chevron-right" size={20} color={colorStyles.iconTertiary} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  // GRN Reference Card with navigation
  const GRNReferenceCard = () => {
    if (!grn_details) return null;

    return (
      <Pressable
        style={({ pressed }) => [
          overviewStyles.card,
          colorStyles.card,
          pressed && on_view_grn && colorStyles.cardPressed,
        ]}
        onPress={handleGRNPress}
        disabled={!on_view_grn}
        accessibilityRole="button"
        accessibilityLabel={`View GRN ${grn_details.number}`}
      >
        <View style={overviewStyles.objectCellHeader}>
          <View style={[overviewStyles.avatar, { backgroundColor: colors.tealLight }]}>
            <Icon name="receipt" size={24} color={colors.teal} />
          </View>
          <View style={overviewStyles.objectCellContent}>
            <Text style={[overviewStyles.objectCellLabel, colorStyles.objectCellLabel]}>Linked GRN</Text>
            <Text style={[overviewStyles.objectCellHeadline, colorStyles.objectCellHeadline]}>{grn_details.number}</Text>
          </View>
          {on_view_grn && (
            <Icon name="chevron-right" size={24} color={colors.primary} />
          )}
        </View>

        <View style={dynamicStyles.grnDetailsContainer}>
          <View style={overviewStyles.detailRow}>
            <Icon name="file-document-outline" size={18} color={colorStyles.iconTertiary} />
            <Text style={[overviewStyles.detailText, colorStyles.detailText]}>GRN No: {grn_details.number}</Text>
          </View>
          <View style={overviewStyles.detailRow}>
            <Icon name="calendar" size={18} color={colorStyles.iconTertiary} />
            <Text style={[overviewStyles.detailText, colorStyles.detailText]}>
              {new Date(grn_details.date).toLocaleDateString('en-US', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
          {grn_details.supervisor_name && (
            <View style={overviewStyles.detailRow}>
              <Icon name="account-tie" size={18} color={colorStyles.iconTertiary} />
              <Text style={[overviewStyles.detailText, colorStyles.detailText]}>{grn_details.supervisor_name}</Text>
            </View>
          )}
          {grn_details.registration && (
            <View style={overviewStyles.detailRow}>
              <Icon name="truck" size={18} color={colorStyles.iconTertiary} />
              <Text style={[overviewStyles.detailText, colorStyles.detailText]}>{grn_details.registration}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  // Financial Summary Card
  const FinancialSummaryCard = () => (
    <View style={[overviewStyles.card, colorStyles.card]}>
      <View style={overviewStyles.objectCellHeader}>
        <View style={[overviewStyles.avatar, { backgroundColor: colors.successLight }]}>
          <Icon name="currency-inr" size={24} color={colors.success} />
        </View>
        <View style={overviewStyles.objectCellContent}>
          <Text style={[overviewStyles.objectCellLabel, colorStyles.objectCellLabel]}>Financial Summary</Text>
          {financial_year && (
            <Text style={[overviewStyles.objectCellSubheadline, colorStyles.objectCellSubheadline]}>FY {financial_year}</Text>
          )}
        </View>
      </View>

      <View style={dynamicStyles.financialContainer}>
        <View style={styles.financialRow}>
          <Text style={dynamicStyles.financialLabel}>Subtotal</Text>
          <Text style={dynamicStyles.financialValue}>{formatCurrency(financial_summary.subtotal)}</Text>
        </View>

        {financial_summary.discount > 0 && (
          <View style={styles.financialRow}>
            <Text style={dynamicStyles.financialLabel}>Discount</Text>
            <Text style={[dynamicStyles.financialValue, { color: colors.error }]}>
              - {formatCurrency(financial_summary.discount)}
            </Text>
          </View>
        )}

        {financial_summary.labour > 0 && (
          <View style={styles.financialRow}>
            <Text style={dynamicStyles.financialLabel}>Labour Charges</Text>
            <Text style={dynamicStyles.financialValue}>{formatCurrency(financial_summary.labour)}</Text>
          </View>
        )}

        <View style={styles.financialRow}>
          <Text style={dynamicStyles.financialLabel}>Tax Amount</Text>
          <Text style={[dynamicStyles.financialValue, { color: colors.primary }]}>
            {formatCurrency(financial_summary.tax_amount)}
          </Text>
        </View>

        <View style={[styles.financialRow, dynamicStyles.financialRowTotal]}>
          <Text style={dynamicStyles.financialLabelTotal}>Total Amount</Text>
          <Text style={dynamicStyles.financialValueTotal}>{formatCurrency(financial_summary.total)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={[overviewStyles.container, colorStyles.container]}
      contentContainerStyle={overviewStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: CUSTOMER */}
      {customer_details && (
        <>
          <SectionHeader title="Customer" />
          <CustomerCard />
        </>
      )}

      {/* SECTION: LINKED GRN */}
      {grn_details && (
        <>
          <SectionHeader title="Reference" />
          <GRNReferenceCard />
        </>
      )}

      {/* SECTION: FINANCIAL SUMMARY */}
      <SectionHeader title="Financial Summary" />
      <FinancialSummaryCard />

      {/* SECTION: NOTES */}
      {notes && <NotesSection note={notes} />}

      {/* SECTION: ACTIONS */}
      <ActionsSection
        entityType="Invoice"
        entityNumber={invoice_number}
        entityId={invoice_id || 'invoice'}
        onSharePDF={on_share_pdf}
        isShareLoading={is_share_loading}
        onPrint={on_print}
        isPrintLoading={is_print_loading}
        onEdit={on_edit_invoice}
        canEdit={can_edit}
        canDelete={can_delete}
        onDelete={on_delete_invoice}
        isDeleting={is_deleting}
      />

      {/* Bottom Spacing */}
      <View style={overviewStyles.bottomSpacer} />
    </ScrollView>
  );
};

// ============================================================================
// INVOICE-SPECIFIC STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  taxChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI.spacing.sm,
    marginTop: FIORI.spacing.sm,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: FIORI.spacing.sm,
  },
});
