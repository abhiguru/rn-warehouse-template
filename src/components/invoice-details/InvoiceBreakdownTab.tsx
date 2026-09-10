/**
 * InvoiceBreakdownTab Component - 100% SAP Fiori Compliant
 *
 * Breakdown tab showing charges breakdown and related documents
 * Based on SAP Fiori for iOS Design Guidelines
 *
 * @see design/sap-fiori-specs/13-card.md
 * @see design/sap-fiori-specs/01-object-cell.md
 *
 * Features:
 * - Visual breakdown of charges
 * - Percentage distribution with color indicators
 * - Related GRN and Dispatch references (tappable)
 * - Fiori Card pattern
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatCurrency } from '@/utils/formatters';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI DESIGN TOKENS (Static values only - colors are dynamic)
// Based on SAP Fiori for iOS Design Guidelines
// ============================================================================
const FIORI_STATIC = {
  // Chart Colors (static - semantic meaning)
  chartColors: {
    subtotal: '#0057D2', // Blue for subtotal
    labour: '#8B5CF6', // Purple for labour
    tax: '#f69000', // Orange for tax
    discount: '#D32030', // Red for discount
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
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
    bodyMedium: {
      fontSize: 15,
      fontWeight: '500' as const,
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
    touchTarget: 44,
    avatarSize: 48,
    dotSize: 12,
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
// COMPONENT
// ============================================================================
export const InvoiceBreakdownTab: React.FC<InvoiceBreakdownTabProps> = ({
  breakdown,
  related_documents = [],
  on_view_grn,
  on_view_dispatch,
}) => {
  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.gray50,
    },
    sectionHeaderText: {
      ...FIORI_STATIC.typography.sectionHeader,
      color: colors.gray600,
    },
    card: {
      backgroundColor: colors.cellBackground,
      borderRadius: FIORI_STATIC.dimensions.cardRadius,
      borderWidth: 1,
      borderColor: colors.cellDivider,
      marginBottom: FIORI_STATIC.spacing.md,
      overflow: 'hidden',
      ...FIORI_STATIC.shadows.card,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: FIORI_STATIC.dimensions.cardPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    cardTitle: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: FIORI_STATIC.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    breakdownRowTotal: {
      paddingTop: FIORI_STATIC.spacing.lg,
      marginTop: FIORI_STATIC.spacing.sm,
      borderTopWidth: 2,
      borderTopColor: colors.cellDivider,
      borderBottomWidth: 0,
    },
    breakdownLabel: {
      ...FIORI_STATIC.typography.body,
      color: colors.gray600,
    },
    breakdownPercent: {
      ...FIORI_STATIC.typography.bodyMedium,
      color: colors.gray500,
      minWidth: 40,
      textAlign: 'right',
    },
    breakdownValue: {
      ...FIORI_STATIC.typography.bodyMedium,
      color: colors.gray900,
      minWidth: 100,
      textAlign: 'right',
    },
    breakdownLabelTotal: {
      ...FIORI_STATIC.typography.headline,
      color: colors.gray900,
    },
    breakdownValueTotal: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.success,
    },
    docSectionBorder: {
      paddingTop: FIORI_STATIC.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.cellDivider,
    },
    docSectionTitle: {
      ...FIORI_STATIC.typography.caption,
      color: colors.gray600,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: FIORI_STATIC.spacing.sm,
    },
    docButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.gray50,
      padding: FIORI_STATIC.spacing.md,
      borderRadius: 8,
      gap: FIORI_STATIC.spacing.md,
      marginBottom: FIORI_STATIC.spacing.sm,
      minHeight: FIORI_STATIC.dimensions.touchTarget,
    },
    docButtonPressed: {
      backgroundColor: colors.gray100,
    },
    docNumber: {
      flex: 1,
      ...FIORI_STATIC.typography.bodyMedium,
      color: colors.gray900,
    },
  }), [colors]);

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
  const subtotalPercent = calculatePercentage(breakdown.subtotal, breakdown.total);
  const taxPercent = calculatePercentage(breakdown.tax_amount, breakdown.total);
  const labourPercent = breakdown.labour > 0 ? calculatePercentage(breakdown.labour, breakdown.total) : 0;
  const discountPercent = breakdown.discount > 0 ? calculatePercentage(breakdown.discount, breakdown.total) : 0;

  const grnDocs = related_documents.filter(doc => doc.type === 'grn');
  const dispatchDocs = related_documents.filter(doc => doc.type === 'dispatch');

  // Section Header - Fiori Spec
  const SectionHeader = ({ title }: { title: string }) => (
    <View style={styles.sectionHeader}>
      <Text style={dynamicStyles.sectionHeaderText}>{title.toUpperCase()}</Text>
    </View>
  );

  // Breakdown Row Component
  const BreakdownRow = ({
    color,
    label,
    percent,
    amount,
    isNegative = false,
  }: {
    color: string;
    label: string;
    percent: number;
    amount: number;
    isNegative?: boolean;
  }) => (
    <View style={dynamicStyles.breakdownRow}>
      <View style={styles.breakdownLeft}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <Text style={dynamicStyles.breakdownLabel}>{label}</Text>
      </View>
      <View style={styles.breakdownRight}>
        <Text style={dynamicStyles.breakdownPercent}>{percent}%</Text>
        <Text style={[dynamicStyles.breakdownValue, isNegative && { color: colors.error }]}>
          {isNegative ? '- ' : ''}{formatCurrency(amount)}
        </Text>
      </View>
    </View>
  );

  // Document Button Component
  const DocumentButton = ({
    doc,
    iconName,
    iconColor,
    label,
    hasNavigation,
  }: {
    doc: RelatedDocument;
    iconName: string;
    iconColor: string;
    label: string;
    hasNavigation: boolean;
  }) => (
    <Pressable
      style={({ pressed }) => [
        dynamicStyles.docButton,
        pressed && dynamicStyles.docButtonPressed,
      ]}
      onPress={() => handleDocumentPress(doc)}
      disabled={!hasNavigation}
      accessibilityRole="button"
      accessibilityLabel={`View ${label} ${doc.number}`}
    >
      <View style={[styles.docIconContainer, { backgroundColor: `${iconColor}15` }]}>
        <Icon name={iconName} size={20} color={iconColor} />
      </View>
      <Text style={dynamicStyles.docNumber}>{label} {doc.number}</Text>
      {hasNavigation && (
        <Icon name="chevron-right" size={20} color={colors.primary} />
      )}
    </Pressable>
  );

  return (
    <ScrollView
      style={dynamicStyles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ================================================================
          SECTION: CHARGES BREAKDOWN
      ================================================================ */}
      <SectionHeader title="Charges Breakdown" />
      <View style={dynamicStyles.card}>
        {/* Card Header */}
        <View style={dynamicStyles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Icon name="chart-pie" size={24} color={colors.primary} />
          </View>
          <Text style={dynamicStyles.cardTitle}>Cost Distribution</Text>
        </View>

        {/* Breakdown Rows */}
        <View style={styles.breakdownContainer}>
          {/* Subtotal */}
          <BreakdownRow
            color={FIORI_STATIC.chartColors.subtotal}
            label="Subtotal"
            percent={subtotalPercent}
            amount={breakdown.subtotal}
          />

          {/* Discount */}
          {breakdown.discount > 0 && (
            <BreakdownRow
              color={FIORI_STATIC.chartColors.discount}
              label="Discount"
              percent={discountPercent}
              amount={breakdown.discount}
              isNegative
            />
          )}

          {/* Labour */}
          {breakdown.labour > 0 && (
            <BreakdownRow
              color={FIORI_STATIC.chartColors.labour}
              label="Labour Charges"
              percent={labourPercent}
              amount={breakdown.labour}
            />
          )}

          {/* Tax */}
          <BreakdownRow
            color={FIORI_STATIC.chartColors.tax}
            label="Tax Amount"
            percent={taxPercent}
            amount={breakdown.tax_amount}
          />

          {/* Total */}
          <View style={[dynamicStyles.breakdownRow, dynamicStyles.breakdownRowTotal]}>
            <Text style={dynamicStyles.breakdownLabelTotal}>Total Amount</Text>
            <Text style={dynamicStyles.breakdownValueTotal}>
              {formatCurrency(breakdown.total)}
            </Text>
          </View>
        </View>
      </View>

      {/* ================================================================
          SECTION: RELATED DOCUMENTS
      ================================================================ */}
      {related_documents.length > 0 && (
        <>
          <SectionHeader title="Related Documents" />
          <View style={dynamicStyles.card}>
            {/* Card Header */}
            <View style={dynamicStyles.cardHeader}>
              <View style={[styles.avatar, { backgroundColor: colors.blueLight }]}>
                <Icon name="file-document-multiple" size={24} color={colors.blue} />
              </View>
              <Text style={dynamicStyles.cardTitle}>Linked Documents</Text>
            </View>

            {/* Documents List */}
            <View style={styles.documentsContainer}>
              {/* GRN Documents */}
              {grnDocs.length > 0 && (
                <View style={styles.docSection}>
                  <Text style={dynamicStyles.docSectionTitle}>Goods Receipt Notes</Text>
                  {grnDocs.map((doc) => (
                    <DocumentButton
                      key={doc.id}
                      doc={doc}
                      iconName="receipt"
                      iconColor={colors.blue}
                      label="GRN"
                      hasNavigation={!!on_view_grn}
                    />
                  ))}
                </View>
              )}

              {/* Dispatch Documents */}
              {dispatchDocs.length > 0 && (
                <View style={[styles.docSection, grnDocs.length > 0 && dynamicStyles.docSectionBorder]}>
                  <Text style={dynamicStyles.docSectionTitle}>Dispatches</Text>
                  {dispatchDocs.map((doc) => (
                    <DocumentButton
                      key={doc.id}
                      doc={doc}
                      iconName="truck-delivery"
                      iconColor={colors.primary}
                      label="DISP"
                      hasNavigation={!!on_view_dispatch}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        </>
      )}

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
};

// ============================================================================
// STYLES (Static layout only - colors are in dynamicStyles)
// ============================================================================
const styles = StyleSheet.create({
  // Container
  content: {
    paddingHorizontal: FIORI_STATIC.spacing.lg,
    paddingTop: FIORI_STATIC.spacing.md,
  },
  bottomSpacer: {
    height: 32,
  },

  // Section Header - Fiori Spec
  sectionHeader: {
    paddingTop: FIORI_STATIC.spacing.lg,
    paddingBottom: FIORI_STATIC.spacing.sm,
  },

  // Card - Fiori Card Spec
  avatar: {
    width: FIORI_STATIC.dimensions.avatarSize,
    height: FIORI_STATIC.dimensions.avatarSize,
    borderRadius: FIORI_STATIC.dimensions.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: FIORI_STATIC.spacing.md,
  },

  // Breakdown Container
  breakdownContainer: {
    padding: FIORI_STATIC.dimensions.cardPadding,
  },

  // Breakdown Rows
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorDot: {
    width: FIORI_STATIC.dimensions.dotSize,
    height: FIORI_STATIC.dimensions.dotSize,
    borderRadius: FIORI_STATIC.dimensions.dotSize / 2,
    marginRight: FIORI_STATIC.spacing.md,
  },
  breakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIORI_STATIC.spacing.lg,
  },

  // Documents Container
  documentsContainer: {
    padding: FIORI_STATIC.dimensions.cardPadding,
  },
  docSection: {
    marginBottom: FIORI_STATIC.spacing.md,
  },

  // Document Button
  docIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
