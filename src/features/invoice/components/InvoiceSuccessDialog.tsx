/**
 * InvoiceSuccessDialog - shown after an invoice is saved.
 *
 * Style guide §13.9 (dialogs) and §14.3 (wizard): surface.sheet over the scrim,
 * radius.card, shadow[4], success icon in status.positive.text, title3 title,
 * the document number and total, and the follow-up actions. The Android back
 * button closes it (same as "View invoices"). "Create another invoice" is
 * offered only when creating; after an edit it would just return to the list.
 */

import React from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
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
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { SavedInvoiceData } from '@/types/invoice.types';
import { t as tr } from '@/i18n';

interface InvoiceSuccessDialogProps {
  isVisible: boolean;
  invoiceData: SavedInvoiceData | null;
  onCreateAnother: () => void;
  onViewList: () => void;
  onPrint?: () => void;
  onSharePDF?: () => void;
  isShareLoading?: boolean;
  isEditMode?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: layout.marginCompact,
  },
  dialog: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '100%' as const,
    ...t.shadow[4],
  },
  content: {
    padding: space.xxl,
  },
  iconContainer: {
    alignSelf: 'center' as const,
    width: touchTarget + space.lg,
    height: touchTarget + space.lg,
    borderRadius: radius.pill,
    backgroundColor: t.status.positive.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: space.lg,
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  message: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.lg,
  },
  detailsCard: {
    backgroundColor: t.background.base,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.xxl,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.xs,
  },
  detailRowVertical: {
    paddingVertical: space.xs,
  },
  detailLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  detailValue: {
    ...typography.body,
    color: t.text.primary,
    flexShrink: 1,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  detailValueCustomer: {
    ...typography.headline,
    color: t.text.primary,
    marginTop: space.xxs,
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalLabel: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
  },
  totalValue: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  buttonContainer: {
    gap: space.sm,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: 'transparent',
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  buttonBusy: {
    opacity: t.interaction.disabledOpacity,
  },
});

export const InvoiceSuccessDialog: React.FC<InvoiceSuccessDialogProps> = ({
  isVisible,
  invoiceData,
  onCreateAnother,
  onViewList,
  onPrint,
  onSharePDF,
  isShareLoading = false,
  isEditMode = false,
}) => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (!invoiceData) return null;

  const title = isEditMode ? tr('invoice.success.updatedTitle') : tr('invoice.success.savedTitle');
  const message = isEditMode
    ? tr('invoice.success.updatedMessage', { number: String(invoiceData.invoice_no) })
    : tr('invoice.success.savedMessage', { number: String(invoiceData.invoice_no) });
  const total = formatInvoiceAmount(invoiceData.total);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
      statusBarTranslucent
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <View style={styles.dialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.iconContainer} accessible={false} importantForAccessibility="no">
              <MaterialCommunityIcons name="check-circle" size={iconSize.xl} color={t.status.positive.text} />
            </View>

            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.message}>{message}</Text>

            <View
              style={styles.detailsCard}
              accessible
              accessibilityLabel={tr('invoice.success.detailsA11y', {
                number: String(invoiceData.invoice_no),
                year: invoiceData.fin_year,
                customer: invoiceData.customer_name,
                total,
              })}
            >
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{tr('common.invoiceNumber')}</Text>
                <Text style={styles.detailValue}>{invoiceData.invoice_no}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{tr('invoice.label.financialYear')}</Text>
                <Text style={styles.detailValue}>{invoiceData.fin_year}</Text>
              </View>

              <View style={styles.detailRowVertical}>
                <Text style={styles.detailLabel}>{tr('common.customer')}</Text>
                <Text style={styles.detailValueCustomer} numberOfLines={2}>
                  {invoiceData.customer_name}
                </Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{tr('common.total')}</Text>
                <Text style={styles.totalValue}>{total}</Text>
              </View>
            </View>

            <View style={styles.buttonContainer}>
              <Pressable
                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.primaryButtonPressed]}
                onPress={onViewList}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>{tr('invoice.success.viewInvoices')}</Text>
              </Pressable>

              {onSharePDF && (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                    isShareLoading && styles.buttonBusy,
                  ]}
                  onPress={onSharePDF}
                  disabled={isShareLoading}
                  accessibilityRole="button"
                  accessibilityLabel={isShareLoading ? tr('invoice.success.preparingPdfA11y') : tr('invoice.success.sharePdfA11y')}
                  accessibilityState={{ busy: isShareLoading, disabled: isShareLoading }}
                >
                  {isShareLoading ? (
                    <ActivityIndicator size="small" color={t.brand.tint} />
                  ) : (
                    <MaterialCommunityIcons name="share-variant-outline" size={iconSize.md} color={t.brand.tint} />
                  )}
                  <Text style={styles.secondaryButtonText}>{isShareLoading ? tr('invoice.success.preparingPdf') : tr('invoice.success.sharePdf')}</Text>
                </Pressable>
              )}

              {onPrint && (
                <Pressable
                  style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                  onPress={onPrint}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="printer-outline" size={iconSize.md} color={t.brand.tint} />
                  <Text style={styles.secondaryButtonText}>{tr('invoice.print.title')}</Text>
                </Pressable>
              )}

              {/* In edit mode "another" would only return to the list, the
                  same as "View invoices", so it is not offered. */}
              {!isEditMode && (
                <Pressable
                  style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                  onPress={onCreateAnother}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>{tr('invoice.success.createAnother')}</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
