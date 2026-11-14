/**
 * DocumentSuccessDialog - Success confirmation modal
 *
 * SAP Fiori dialog (docs/STYLE_GUIDE.md §13.9, wizard §14.3): surface.sheet,
 * radius.card, shadow[4] over overlay.scrim, success icon in status.positive.
 *
 * Displays success confirmation after document creation/update.
 * Provides actions for creating another, sharing PDF, printing, and viewing list.
 */

import React from 'react';
import { View, Text, Modal } from 'react-native';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { fontWeight, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatCurrency, formatFinancialYear, formatNumber } from '@/utils/formatters';
import { localizeDigits, t as tr, formatIdentifier } from '@/i18n';
import type { DocumentEntity } from '@/i18n/entities';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from './DialogFrame';

export type DocumentType = 'GRN' | 'Dispatch' | 'Invoice';

export interface DocumentData {
  documentNo: string;
  customerName: string;
  date?: string;
  totalAmount?: number;
  finYear?: string;
  itemCount?: number;
  /** The quantity in all the lines (GRN created or updated, dispatch created); drawn after Items. */
  totalQuantity?: number;
  /** The order lines this save changed (orders.effect texts); drawn under the message when there are any. */
  orderNotes?: string[];
  /** Plain notices drawn under the message as one warning strip (a GRN saved by staff: items without a rate yet). */
  notices?: string[];
}

interface DocumentSuccessDialogProps {
  isVisible: boolean;
  /** Which document was saved. Selects whole-sentence texts in both languages. */
  entity?: DocumentEntity;
  /** Older name of `entity` ('GRN' | 'Dispatch' | 'Invoice'). Used when `entity` is not given. */
  documentType?: DocumentType;
  documentData: DocumentData | null;
  onCreateAnother: () => void;
  onViewList: () => void;
  onPrint?: () => void;
  onSharePDF: () => void;
  isShareLoading?: boolean;
  /** Why the last share failed; shown in the dialog above the buttons until the next try. GRN does not pass it. */
  shareError?: string | null;
  isEditMode?: boolean;
}

const DOCUMENT_ENTITIES: Record<DocumentType, DocumentEntity> = { GRN: 'grn', Dispatch: 'dispatch', Invoice: 'invoice' };
const DOCUMENT_NOUN_KEYS = { grn: 'common.grn', dispatch: 'common.dispatch', invoice: 'common.invoice' } as const;
const DOCUMENT_NUMBER_KEYS = {
  grn: 'common.grnNumber',
  dispatch: 'common.dispatchNumber',
  invoice: 'common.invoiceNumber',
} as const;

/** The texts for one kind of document. Called while rendering, so they follow the language. */
const getDocumentConfig = (entity: DocumentEntity, isEditMode: boolean) => ({
  noun: tr(DOCUMENT_NOUN_KEYS[entity]),
  title: tr(isEditMode ? `components.documentSuccess.${entity}.updatedTitle` : `components.documentSuccess.${entity}.createdTitle`),
  message: tr(isEditMode ? `components.documentSuccess.${entity}.updatedMessage` : `components.documentSuccess.${entity}.createdMessage`),
  listLabel: tr(`components.documentSuccess.${entity}.listLabel`),
  createText: tr(isEditMode ? `components.documentSuccess.${entity}.editAnother` : `components.documentSuccess.${entity}.createAnother`),
  numberLabel: tr(DOCUMENT_NUMBER_KEYS[entity]),
  printLabel: tr(`components.documentSuccess.${entity}.printLabel`),
});

const makeStyles = (t: ThemeTokens) => ({
  rest: { alignSelf: 'stretch' as const, marginTop: space.lg },
  orderNotes: {
    marginBottom: space.xl,
  },
  detailsContainer: {
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginBottom: space.xxl,
    backgroundColor: t.background.base,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.xs,
  },
  detailLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  detailValue: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flexShrink: 1,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  totalRow: {
    marginTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalLabel: {
    ...typography.headline,
    color: t.text.primary,
  },
  totalValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  // The share error (InlineValidation, a message strip, guide 13.9): the dialog's gap under it
  errorStrip: {
    marginBottom: space.md,
  },
});

export const DocumentSuccessDialog: React.FC<DocumentSuccessDialogProps> = ({
  isVisible,
  entity,
  documentType,
  documentData,
  onCreateAnother,
  onViewList,
  onPrint,
  onSharePDF,
  isShareLoading = false,
  shareError = null,
  isEditMode = false,
}) => {
  // Hooks must be called before any early returns
  const styles = useThemedStyles(makeStyles);

  const config = getDocumentConfig(entity ?? DOCUMENT_ENTITIES[documentType ?? 'GRN'], isEditMode);

  // Early return after hooks
  if (!documentData) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
    >
      <DialogOverlay>
        <DialogCard
          accessibilityLabel={tr('components.documentSuccess.dialogLabel', { title: config.title, noun: config.noun, number: formatIdentifier(documentData.documentNo) })}
        >
          <DialogBody>
            <DialogHeading tone="success" title={config.title} message={config.message} />
            <View style={styles.rest}>
            {documentData.orderNotes && documentData.orderNotes.length > 0 ? (
              <View style={styles.orderNotes} testID="document-success-order-notes">
                <InlineValidation
                  variant="warning"
                  message={`${tr('orders.effect.doneLead')}\n${documentData.orderNotes.map((line) => `• ${line}`).join('\n')}`}
                />
              </View>
            ) : null}

            {documentData.notices && documentData.notices.length > 0 ? (
              <View style={styles.orderNotes} testID="document-success-notices">
                <InlineValidation variant="warning" message={documentData.notices.join('\n')} />
              </View>
            ) : null}

            {/* Document details */}
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{config.numberLabel}</Text>
                <Text style={styles.detailValue}>{documentData.documentNo}</Text>
              </View>

              {documentData.finYear && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{tr('components.documentSuccess.financialYear')}</Text>
                  <Text style={styles.detailValue}>{formatFinancialYear(documentData.finYear)}</Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{tr('common.customer')}</Text>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {documentData.customerName}
                </Text>
              </View>

              {documentData.date && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{tr('common.date')}</Text>
                  <Text style={styles.detailValue}>{documentData.date}</Text>
                </View>
              )}

              {documentData.itemCount !== undefined && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{tr('common.items')}</Text>
                  <Text style={styles.detailValue}>{localizeDigits(String(documentData.itemCount))}</Text>
                </View>
              )}

              {documentData.totalQuantity !== undefined && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{tr('components.documentSuccess.totalQuantity')}</Text>
                  <Text style={styles.detailValue}>{formatNumber(documentData.totalQuantity)}</Text>
                </View>
              )}

              {documentData.totalAmount !== undefined && (
                <View style={[styles.detailRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>{tr('components.documentSuccess.totalAmount')}</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(documentData.totalAmount, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* A share that failed (message strip, style guide 13.9): a toast would sit under this dialog */}
            {shareError ? (
              <View style={styles.errorStrip} testID="document-success-share-error">
                <InlineValidation variant="error" message={shareError} />
              </View>
            ) : null}

            </View>
          </DialogBody>

          {/* Actions: stacked, the action first */}
          <DialogActions stacked>
            <DialogButton stacked role="primary" label={config.listLabel} onPress={onViewList} />
            {onPrint && (
              <DialogButton stacked icon="printer-outline" label={tr('common.print')} accessibilityLabel={config.printLabel} onPress={onPrint} />
            )}
            <DialogButton
              stacked
              icon="share-variant-outline"
              label={tr('components.sharePdf')}
              busy={isShareLoading}
              busyLabel={tr('components.preparingPdf')}
              onPress={onSharePDF}
            />
            <DialogButton stacked icon="plus" label={config.createText} onPress={onCreateAnother} />
          </DialogActions>
        </DialogCard>
      </DialogOverlay>
    </Modal>
  );
};

export default DocumentSuccessDialog;
