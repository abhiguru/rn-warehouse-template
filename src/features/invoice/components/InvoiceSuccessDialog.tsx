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
import { View, Text, Modal } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { SavedInvoiceData } from '@/types/invoice.types';
import { invoiceLabelOf } from '@/utils/invoiceLabel';
import { t as tr, formatIdentifier } from '@/i18n';
import { formatFinancialYear } from '@/utils/formatters';
import { asDocType, docTypeKey } from '@/features/gst/docType';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from '@/components/DialogFrame';

interface InvoiceSuccessDialogProps {
  isVisible: boolean;
  invoiceData: SavedInvoiceData | null;
  onCreateAnother: () => void;
  onViewList: () => void;
  onPrint?: () => void;
  onSharePDF?: () => void;
  isShareLoading?: boolean;
  /** The sharing failed: drawn inside the dialog, because a message on the screen under it is hidden by it. */
  shareError?: string | null;
  isEditMode?: boolean;
  /** The dialog has finished closing (iOS `onDismiss`): the next Modal may open from here. */
  onDismissed?: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  rest: { alignSelf: 'stretch' as const, marginTop: space.lg },
  detailsCard: {
    backgroundColor: t.background.base,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.lg,
  },
  errorStrip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    marginBottom: space.lg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  errorStripText: {
    ...typography.subhead,
    flex: 1,
    color: t.status.negative.text,
  },
  totalNote: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.lg,
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
});

export const InvoiceSuccessDialog: React.FC<InvoiceSuccessDialogProps> = ({
  isVisible,
  invoiceData,
  onCreateAnother,
  onViewList,
  onPrint,
  onSharePDF,
  isShareLoading = false,
  shareError = null,
  isEditMode = false,
  onDismissed,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  if (!invoiceData) return null;
  const invoiceLabel = invoiceLabelOf(invoiceData.invoice_label, invoiceData.invoice_no);

  // WH-151: a save that made two documents (a tax invoice and a bill of supply) names both, each with its own total.
  const documents = invoiceData.documents && invoiceData.documents.length > 1 ? invoiceData.documents : null;
  const docType = asDocType(invoiceData.doc_type);
  const title = isEditMode ? tr('invoice.success.updatedTitle') : tr('invoice.success.savedTitle');
  const message = documents
    ? tr('gst.saved.twoNumbers', {
        first: formatIdentifier(invoiceLabelOf(documents[0].invoice_label, documents[0].inv_no)),
        firstType: tr(docTypeKey(documents[0].doc_type)),
        second: formatIdentifier(invoiceLabelOf(documents[1].invoice_label, documents[1].inv_no)),
        secondType: tr(docTypeKey(documents[1].doc_type)),
      })
    : isEditMode
    ? tr('invoice.success.updatedMessage', { number: formatIdentifier(invoiceLabel) })
    : tr('invoice.success.savedMessage', { number: formatIdentifier(invoiceLabel) });
  // The total is the one the server stored. When it could not be read back
  // after the save, no amount is shown: the form's own figure is an estimate.
  const totalKnown = typeof invoiceData.total === 'number';
  const total = totalKnown ? formatInvoiceAmount(invoiceData.total) : '';
  // The server accepts a total within 1 of the one confirmed, so a difference of 1 or less is not worth a note.
  const { total: storedTotal, estimated_total: estimatedTotal } = invoiceData;
  const totalDiffers =
    !documents &&
    typeof storedTotal === 'number' && typeof estimatedTotal === 'number' && Math.abs(estimatedTotal - storedTotal) > 1;

  const stacked = 1 + (onSharePDF ? 1 : 0) + (onPrint ? 1 : 0) + (isEditMode ? 0 : 1) >= 3;
  const viewButton = (
    <DialogButton
      stacked={stacked}
      role="primary"
      label={tr(isEditMode ? 'invoice.success.viewInvoice' : 'invoice.success.viewInvoices')}
      onPress={onViewList}
    />
  );

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
      onDismiss={onDismissed}
      statusBarTranslucent
    >
      <DialogOverlay safeArea>
        <DialogCard>
          <DialogBody>
            <DialogHeading tone="success" title={title} message={message} />
            <View style={styles.rest}>
            <View
              style={styles.detailsCard}
              accessible
              accessibilityLabel={tr(totalKnown ? 'invoice.success.detailsWithTotalA11y' : 'invoice.success.detailsA11y', {
                number: formatIdentifier(invoiceLabel),
                year: formatFinancialYear(invoiceData.fin_year),
                customer: invoiceData.customer_name,
                total,
              })}
            >
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{tr('common.invoiceNumber')}</Text>
                <Text style={styles.detailValue}>{invoiceLabel}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{tr('invoice.label.financialYear')}</Text>
                <Text style={styles.detailValue}>{formatFinancialYear(invoiceData.fin_year)}</Text>
              </View>

              <View style={styles.detailRowVertical}>
                <Text style={styles.detailLabel}>{tr('common.customer')}</Text>
                <Text style={styles.detailValueCustomer} numberOfLines={2}>
                  {invoiceData.customer_name}
                </Text>
              </View>

              {documents
                ? documents.map((doc) => (
                    <View key={doc.invoice_id} style={styles.totalRow} testID={`invoice-saved-document-${doc.inv_no}`}>
                      <Text style={styles.totalLabel}>{`${formatIdentifier(invoiceLabelOf(doc.invoice_label, doc.inv_no))} · ${tr(docTypeKey(doc.doc_type))}`}</Text>
                      <Text style={styles.totalValue}>{typeof doc.total === 'number' ? formatInvoiceAmount(doc.total) : ''}</Text>
                    </View>
                  ))
                : null}
              {!documents && docType !== 'invoice' ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{tr('gst.detail.type')}</Text>
                  <Text style={styles.detailValue}>{tr(docTypeKey(docType))}</Text>
                </View>
              ) : null}
              {!documents && totalKnown && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{tr('common.total')}</Text>
                  <Text style={styles.totalValue}>{total}</Text>
                </View>
              )}
            </View>

            {!documents && !totalKnown && <Text style={styles.totalNote}>{tr('invoice.success.totalNotRead')}</Text>}
            {totalDiffers && (
              <Text style={styles.totalNote}>
                {tr('invoice.success.totalDiffers', { estimate: formatInvoiceAmount(estimatedTotal) })}
              </Text>
            )}

            {!!shareError && (
              <View style={styles.errorStrip} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="invoice-share-error">
                <MaterialCommunityIcons name="alert-circle" size={iconSize.md} color={t.status.negative.text} />
                <Text style={styles.errorStripText}>{shareError}</Text>
              </View>
            )}

            </View>
          </DialogBody>

          {/* Actions: three or more are stacked, the action first; two sit side by side, the action last */}
          <DialogActions stacked={stacked}>
            {stacked ? viewButton : null}
            {onSharePDF && (
              <DialogButton
                stacked={stacked}
                icon="share-variant-outline"
                label={tr('invoice.success.sharePdf')}
                busyLabel={tr('invoice.success.preparingPdf')}
                accessibilityLabel={isShareLoading ? tr('invoice.success.preparingPdfA11y') : tr('invoice.success.sharePdfA11y')}
                busy={isShareLoading}
                onPress={onSharePDF}
              />
            )}
            {onPrint && <DialogButton stacked={stacked} icon="printer-outline" label={tr('invoice.print.title')} onPress={onPrint} />}
            {/* In edit mode "another" would only return to the list, the
                same as "View invoices", so it is not offered. */}
            {!isEditMode && <DialogButton stacked={stacked} label={tr('invoice.success.createAnother')} onPress={onCreateAnother} />}
            {stacked ? null : viewButton}
          </DialogActions>
        </DialogCard>
      </DialogOverlay>
    </Modal>
  );
};
