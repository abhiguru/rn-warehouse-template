/**
 * InvoiceBreakdownTab Component
 *
 * Saved invoice amounts and related documents (style guide §13.11):
 * key-value rows with right-aligned tabular amounts, discounts in
 * status.positive.text with a minus sign, tax listed separately and the total
 * in headline weight. Related GRN and dispatch references are tappable rows.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { savedInvoiceAmounts, formatInvoiceAmount, formatInvoiceDeduction } from '@/utils/invoiceCalculations';
import { t as tr, formatIdentifier } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================
interface ChargesBreakdown {
  subtotal: number;
  discount: number;
  labour: number;
  tax_amount: number;
  total: number;
}

interface RelatedDocument {
  id: string;
  number: string;
  type: 'grn' | 'dispatch';
}

interface InvoiceBreakdownTabProps {
  breakdown: ChargesBreakdown;
  related_documents?: RelatedDocument[];
  on_view_grn?: (grn_id: string) => void;
  on_view_dispatch?: (dispatch_id: string) => void;
}

// ============================================================================
// STYLES
// ============================================================================
const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  content: { paddingHorizontal: layout.marginCompact, paddingTop: space.md },
  bottomSpacer: { height: space.xxxl },
  sectionHeader: { paddingTop: space.lg, paddingBottom: space.sm },
  sectionHeaderText: {
    ...typography.footnote,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.md,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
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
  cardTitle: { ...typography.headline, color: t.text.primary, flex: 1 },
  breakdownContainer: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  breakdownRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    minHeight: layout.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  breakdownRowTotal: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  breakdownLabel: { ...typography.body, color: t.text.secondary, flex: 1 },
  breakdownRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md },
  breakdownPercent: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  breakdownValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  discountValue: { color: t.status.positive.text },
  breakdownLabelTotal: { ...typography.headline, color: t.text.primary, flex: 1 },
  breakdownValueTotal: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  documentsContainer: { paddingVertical: space.xs },
  docSection: { paddingTop: space.sm },
  docSectionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },
  docSectionTitle: {
    ...typography.footnote,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  docButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
    minHeight: touchTarget,
  },
  docButtonPressed: { backgroundColor: t.surface.cardPressed },
  docNumber: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flex: 1,
    fontVariant: ['tabular-nums' as const],
  },
});

type Styles = ReturnType<typeof makeStyles>;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
const SectionHeader = ({ title, styles }: { title: string; styles: Styles }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText} accessibilityRole="header">{title}</Text>
  </View>
);

const BreakdownRow = ({
  label,
  percent,
  value,
  isDiscount = false,
  styles,
}: {
  label: string;
  percent?: number;
  value: string;
  isDiscount?: boolean;
  styles: Styles;
}) => (
  <View
    style={styles.breakdownRow}
    accessible
    accessibilityLabel={`${label}, ${value}${percent !== undefined ? `, ${tr('invoice.breakdown.percentOfTotalA11y', { percent })}` : ''}`}
  >
    <Text style={styles.breakdownLabel}>{label}</Text>
    <View style={styles.breakdownRight}>
      {percent !== undefined && <Text style={styles.breakdownPercent}>{tr('invoice.label.percent', { value: percent })}</Text>}
      <Text style={[styles.breakdownValue, isDiscount && styles.discountValue]}>{value}</Text>
    </View>
  </View>
);

// ============================================================================
// COMPONENT
// ============================================================================
export const InvoiceBreakdownTab: React.FC<InvoiceBreakdownTabProps> = ({
  breakdown,
  related_documents = [],
  on_view_grn,
  on_view_dispatch,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const calculatePercentage = (amount: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((amount / total) * 100);
  };

  const handleDocumentPress = (doc: RelatedDocument) => {
    if (doc.type === 'grn' && on_view_grn) {
      on_view_grn(doc.id);
    } else if (doc.type === 'dispatch' && on_view_dispatch) {
      on_view_dispatch(doc.id);
    }
  };

  // Calculate percentages
  const saved = savedInvoiceAmounts(breakdown);
  const subtotalPercent = calculatePercentage(saved.netBeforeTax, breakdown.total);
  const taxPercent = calculatePercentage(breakdown.tax_amount, breakdown.total);
  const isDiscount = breakdown.discount > 0;
  const adjustmentValue = isDiscount
    ? formatInvoiceDeduction(saved.adjustmentAmount)
    : `+${formatInvoiceAmount(saved.adjustmentAmount)}`;

  const grnDocs = related_documents.filter(doc => doc.type === 'grn');
  const dispatchDocs = related_documents.filter(doc => doc.type === 'dispatch');

  const renderDocumentButton = (
    doc: RelatedDocument,
    iconName: string,
    hasNavigation: boolean,
  ) => (
    <Pressable
      key={doc.id}
      style={({ pressed }) => [styles.docButton, pressed && hasNavigation && styles.docButtonPressed]}
      onPress={() => handleDocumentPress(doc)}
      disabled={!hasNavigation}
      accessibilityRole="button"
      accessibilityLabel={tr(doc.type === 'grn' ? 'invoice.label.viewGrnNumber' : 'invoice.breakdown.viewDispatchA11y', { number: formatIdentifier(doc.number) })}
      accessibilityState={{ disabled: !hasNavigation }}
    >
      <Icon name={iconName} size={iconSize.md} color={t.icon.secondary} />
      <Text style={styles.docNumber}>{tr(doc.type === 'grn' ? 'invoice.label.grnNumber' : 'invoice.label.dispatchNumber', { number: formatIdentifier(doc.number) })}</Text>
      {hasNavigation && (
        <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
      )}
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: CHARGES BREAKDOWN */}
      <SectionHeader title={tr('invoice.breakdown.chargesBreakdown')} styles={styles} />
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Icon name="chart-pie" size={iconSize.lg} color={t.brand.tint} />
          </View>
          <Text style={styles.cardTitle}>{tr('invoice.breakdown.savedAmounts')}</Text>
        </View>

        <View style={styles.breakdownContainer}>
          <BreakdownRow
            label={tr('invoice.label.netBeforeTax')}
            percent={subtotalPercent}
            value={formatInvoiceAmount(saved.netBeforeTax)}
            styles={styles}
          />

          {saved.hasAdjustment && (
            <BreakdownRow
              label={tr(saved.isSurcharge ? 'invoice.label.surchargeIncluded' : 'invoice.label.discountIncluded')}
              value={adjustmentValue}
              isDiscount={isDiscount}
              styles={styles}
            />
          )}

          {breakdown.labour > 0 && (
            <BreakdownRow
              label={tr('invoice.label.labourIncluded')}
              value={formatInvoiceAmount(breakdown.labour)}
              styles={styles}
            />
          )}

          <BreakdownRow
            label={tr('invoice.label.tax')}
            percent={taxPercent}
            value={formatInvoiceAmount(breakdown.tax_amount)}
            styles={styles}
          />

          <View
            style={[styles.breakdownRow, styles.breakdownRowTotal]}
            accessible
            accessibilityLabel={`${tr('invoice.label.totalAmount')}, ${formatInvoiceAmount(breakdown.total)}`}
          >
            <Text style={styles.breakdownLabelTotal}>{tr('invoice.label.totalAmount')}</Text>
            <Text style={styles.breakdownValueTotal}>{formatInvoiceAmount(breakdown.total)}</Text>
          </View>
        </View>
      </View>

      {/* SECTION: RELATED DOCUMENTS */}
      {related_documents.length > 0 && (
        <>
          <SectionHeader title={tr('invoice.breakdown.relatedDocuments')} styles={styles} />
          <View style={styles.card}>
            <View style={styles.documentsContainer}>
              {grnDocs.length > 0 && (
                <View style={styles.docSection}>
                  <Text style={styles.docSectionTitle} accessibilityRole="header">{tr('invoice.breakdown.grns')}</Text>
                  {grnDocs.map(doc => renderDocumentButton(doc, 'package-down', !!on_view_grn))}
                </View>
              )}

              {dispatchDocs.length > 0 && (
                <View style={[styles.docSection, grnDocs.length > 0 && styles.docSectionBorder]}>
                  <Text style={styles.docSectionTitle} accessibilityRole="header">{tr('invoice.breakdown.dispatches')}</Text>
                  {dispatchDocs.map(doc =>
                    renderDocumentButton(doc, 'truck-delivery-outline', !!on_view_dispatch)
                  )}
                </View>
              )}
            </View>
          </View>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};
