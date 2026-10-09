/**
 * InvoiceOverviewTab Component
 *
 * Overview of an invoice (style guide §14.2): customer, linked GRN, financial
 * summary (§13.11), notes and actions. Uses the shared overview-tab section
 * header, notes and actions components.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  SectionHeader,
  NotesSection,
  ActionsSection,
} from '@/components/common/overview-tab';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { savedInvoiceAmounts, formatInvoiceAmount, formatInvoiceDeduction } from '@/utils/invoiceCalculations';

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

const formatDisplayDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  content: { paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  bottomSpacer: { height: space.xxxl },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.md,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  cardPressed: { backgroundColor: t.surface.cardPressed },
  objectCellHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    minHeight: layout.objectCellMinHeight,
  },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
    backgroundColor: t.brand.subtle,
  },
  objectCellContent: { flex: 1 },
  objectCellLabel: { ...typography.footnote, color: t.text.secondary, marginBottom: space.xxs },
  objectCellHeadline: { ...typography.headline, color: t.text.primary },
  objectCellSubheadline: { ...typography.subhead, color: t.text.secondary, marginTop: space.xxs },
  detailsContainer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
    gap: space.sm,
  },
  detailRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  detailText: { ...typography.subhead, color: t.text.primary, flex: 1 },
  taxChipsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  taxChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
    paddingHorizontal: space.md,
    paddingVertical: space.s6,
    borderRadius: radius.pill,
    gap: space.xs,
  },
  taxChipLabel: { ...typography.caption1, color: t.status.neutral.text, fontWeight: fontWeight.semibold },
  taxChipValue: { ...typography.caption1, color: t.text.primary, fontVariant: ['tabular-nums' as const] },
  contactAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: touchTarget,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  contactActionText: { ...typography.body, color: t.brand.tint, flex: 1 },
  financialRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
  },
  financialLabel: { ...typography.body, color: t.text.secondary, flexShrink: 1 },
  financialValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  discountValue: { color: t.status.positive.text },
  financialRowTotal: {
    paddingTop: space.md,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  financialLabelTotal: { ...typography.headline, color: t.text.primary },
  financialValueTotal: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
});

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
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

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
  const renderCustomerCard = () => {
    if (!customer_details) return null;

    return (
      <View style={styles.card}>
        <View style={styles.objectCellHeader} accessible accessibilityLabel={`Customer, ${customer_details.name}`}>
          <View style={styles.avatar}>
            <Icon name="account-outline" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <View style={styles.objectCellContent}>
            <Text style={styles.objectCellLabel}>Customer</Text>
            <Text style={styles.objectCellHeadline} numberOfLines={2}>{customer_details.name}</Text>
          </View>
        </View>

        {/* Address & Tax Info */}
        {(customer_details.address || customer_details.city || customer_details.gst || customer_details.pan) && (
          <View style={styles.detailsContainer}>
            {(customer_details.address || customer_details.city) && (
              <View style={styles.detailRow}>
                <Icon name="map-marker-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.detailText}>
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
                  <View style={styles.taxChip} accessible accessibilityLabel={`GST ${customer_details.gst}`}>
                    <Text style={styles.taxChipLabel} maxFontSizeMultiplier={1.6}>GST</Text>
                    <Text style={styles.taxChipValue} maxFontSizeMultiplier={1.6}>{customer_details.gst}</Text>
                  </View>
                )}
                {customer_details.pan && (
                  <View style={styles.taxChip} accessible accessibilityLabel={`PAN ${customer_details.pan}`}>
                    <Text style={styles.taxChipLabel} maxFontSizeMultiplier={1.6}>PAN</Text>
                    <Text style={styles.taxChipValue} maxFontSizeMultiplier={1.6}>{customer_details.pan}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Contact Actions */}
        {customer_details.mobile && (
          <Pressable
            style={({ pressed }) => [styles.contactAction, pressed && styles.cardPressed]}
            onPress={() => handlePhonePress(customer_details.mobile!)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${customer_details.name}, ${customer_details.mobile}`}
          >
            <Icon name="phone-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.contactActionText}>{customer_details.mobile}</Text>
            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}

        {customer_details.email && (
          <Pressable
            style={({ pressed }) => [styles.contactAction, pressed && styles.cardPressed]}
            onPress={() => handleEmailPress(customer_details.email!)}
            accessibilityRole="button"
            accessibilityLabel={`Email ${customer_details.name}, ${customer_details.email}`}
          >
            <Icon name="email-outline" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.contactActionText}>{customer_details.email}</Text>
            <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}
      </View>
    );
  };

  // GRN Reference Card with navigation
  const renderGRNReferenceCard = () => {
    if (!grn_details) return null;
    const grnDate = formatDisplayDate(grn_details.date);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && on_view_grn && styles.cardPressed]}
        onPress={handleGRNPress}
        disabled={!on_view_grn}
        accessibilityRole={on_view_grn ? 'button' : undefined}
        accessibilityLabel={`GRN ${grn_details.number}${grnDate ? `, ${grnDate}` : ''}`}
        accessibilityHint={on_view_grn ? 'Opens the GRN' : undefined}
      >
        <View style={styles.objectCellHeader}>
          <View style={styles.avatar}>
            <Icon name="package-down" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <View style={styles.objectCellContent}>
            <Text style={styles.objectCellLabel}>Linked GRN</Text>
            <Text style={styles.objectCellHeadline}>{`GRN ${grn_details.number}`}</Text>
          </View>
          {on_view_grn && (
            <Icon name="chevron-right" size={iconSize.lg} color={t.icon.secondary} />
          )}
        </View>

        {(grnDate || grn_details.supervisor_name || grn_details.registration) && (
          <View style={styles.detailsContainer}>
            {grnDate ? (
              <View style={styles.detailRow}>
                <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.detailText}>{grnDate}</Text>
              </View>
            ) : null}
            {grn_details.supervisor_name && (
              <View style={styles.detailRow}>
                <Icon name="account-tie-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.detailText}>{grn_details.supervisor_name}</Text>
              </View>
            )}
            {grn_details.registration && (
              <View style={styles.detailRow}>
                <Icon name="truck-outline" size={iconSize.md} color={t.icon.secondary} />
                <Text style={styles.detailText}>{grn_details.registration}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const saved = savedInvoiceAmounts(financial_summary);
  const isDiscount = saved.adjustmentLabel === 'Discount';
  const adjustmentText = isDiscount
    ? formatInvoiceDeduction(saved.adjustmentAmount)
    : `+${formatInvoiceAmount(saved.adjustmentAmount)}`;

  const renderFinancialRow = (label: string, value: string, valueStyle?: object) => (
    <View style={styles.financialRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.financialLabel}>{label}</Text>
      <Text style={[styles.financialValue, valueStyle]}>{value}</Text>
    </View>
  );

  // Financial Summary Card
  const renderFinancialSummaryCard = () => (
    <View style={styles.card}>
      <View style={styles.objectCellHeader}>
        <View style={styles.avatar}>
          <Icon name="currency-inr" size={iconSize.lg} color={t.brand.tint} />
        </View>
        <View style={styles.objectCellContent}>
          <Text style={styles.objectCellHeadline}>Amounts</Text>
          {financial_year && (
            <Text style={styles.objectCellSubheadline}>{`Financial year ${financial_year}`}</Text>
          )}
        </View>
      </View>

      <View style={styles.detailsContainer}>
        {renderFinancialRow('Net before tax', formatInvoiceAmount(saved.netBeforeTax))}

        {saved.hasAdjustment &&
          renderFinancialRow(
            `${saved.adjustmentLabel} (included)`,
            adjustmentText,
            isDiscount ? styles.discountValue : undefined
          )}

        {financial_summary.labour > 0 &&
          renderFinancialRow('Labour (included)', formatInvoiceAmount(financial_summary.labour))}

        {renderFinancialRow('Tax', formatInvoiceAmount(financial_summary.tax_amount))}

        <View
          style={[styles.financialRow, styles.financialRowTotal]}
          accessible
          accessibilityLabel={`Total amount, ${formatInvoiceAmount(financial_summary.total)}`}
        >
          <Text style={styles.financialLabelTotal}>Total amount</Text>
          <Text style={styles.financialValueTotal}>{formatInvoiceAmount(financial_summary.total)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: CUSTOMER */}
      {customer_details && (
        <>
          <SectionHeader title="Customer" />
          {renderCustomerCard()}
        </>
      )}

      {/* SECTION: LINKED GRN */}
      {grn_details && (
        <>
          <SectionHeader title="Reference" />
          {renderGRNReferenceCard()}
        </>
      )}

      {/* SECTION: FINANCIAL SUMMARY */}
      <SectionHeader title="Financial summary" />
      {renderFinancialSummaryCard()}

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
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};
