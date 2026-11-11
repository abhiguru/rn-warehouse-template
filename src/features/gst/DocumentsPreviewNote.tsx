/**
 * "This makes ..." on the review step (WH-151): the document type(s) the server will make from the chosen lines, with its
 * tax split. Shown only once the facility has saved GST details (before that every document is a plain Invoice and nothing
 * changes). A refusal of the preview (the edit needs two documents) is shown in its own words before the person saves.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/useTheme';
import { layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { t as tr } from '@/i18n';
import { docTypeKey } from '@/features/gst/docType';
import { stateNameOf } from '@/features/gst/indianStates';
import type { PreviewDocument } from '@/services/gstService';
import type { PreviewState } from './useDocumentsPreview';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    box: {
      backgroundColor: t.status.informative.background,
      borderColor: t.status.informative.border,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: space.lg,
      marginHorizontal: layout.marginCompact,
      marginBottom: space.md,
      gap: space.xs,
    },
    headline: { ...typography.callout, color: t.text.primary },
    line: { ...typography.footnote, color: t.text.secondary, fontVariant: ['tabular-nums'] },
    failed: { ...typography.footnote, color: t.status.negative.text },
  });

const amount = (value: number | null): string => (value === null ? '' : formatInvoiceAmount(value));

function taxLines(doc: PreviewDocument, withTotal: boolean): string[] {
  const lines: string[] = [];
  const head = `${tr(docTypeKey(doc.docType))}`;
  if (withTotal && doc.total !== null) lines.push(tr('gst.review.totalLine', { type: head, total: amount(doc.total) }));
  if (doc.taxHead === 'cgst_sgst') lines.push(tr('gst.review.cgstSgst', { cgst: amount(doc.cgst), sgst: amount(doc.sgst) }));
  else if (doc.taxHead === 'igst') lines.push(tr('gst.review.igst', { igst: amount(doc.igst) }));
  if (doc.taxHead && doc.tax === 0) lines.push(tr('gst.review.gstZero'));
  if (doc.taxHead && doc.placeOfSupply) lines.push(tr('gst.review.placeOfSupply', { state: stateNameOf(doc.placeOfSupply) }));
  return lines;
}

interface Props {
  state: PreviewState;
  /** The form has a discount: the preview's totals are before it, so they are not shown (the Charges section has the total). */
  hasDiscount: boolean;
}

export function DocumentsPreviewNote({ state, hasDiscount }: Props) {
  const styles = useThemedStyles(makeStyles);
  if (state.status === 'off') return null;
  if (state.status === 'loading') return null;
  if (state.status === 'failed') {
    return (
      <View style={styles.box} testID="invoice-documents-preview">
        <Text style={styles.failed} accessibilityRole="alert">{state.message || tr('gst.review.previewFailed')}</Text>
      </View>
    );
  }
  const { documents, typeChanges } = state.preview;
  // Before GST details are saved every document is a plain Invoice, as it always was: nothing to announce.
  if (documents.length === 0 || documents.every((doc) => doc.docType === 'invoice')) return null;

  let headline: string;
  if (documents.length > 1) {
    const taxable = documents.find((doc) => doc.docType === 'tax_invoice');
    const exempt = documents.find((doc) => doc.docType === 'bill_of_supply');
    headline = tr('gst.review.makesTwo', {
      taxable: (taxable ?? documents[0]).itemNames.join(', '),
      exempt: (exempt ?? documents[1]).itemNames.join(', '),
    });
  } else {
    const only = documents[0];
    const type = tr(docTypeKey(only.docType));
    if (typeChanges) headline = tr('gst.review.nowMakes', { type: type.toLowerCase() });
    else if (only.docType === 'bill_of_supply') headline = tr('gst.review.makesOneWhy', { items: only.itemNames.join(', ') });
    else headline = tr('gst.review.makesOne', { type: type.toLowerCase() });
  }
  return (
    <View style={styles.box} testID="invoice-documents-preview" accessible accessibilityLabel={headline}>
      <Text style={styles.headline}>{headline}</Text>
      {documents.flatMap((doc, index) =>
        taxLines(doc, !hasDiscount).map((line, i) => (
          <Text key={`${index}-${i}`} style={styles.line}>{line}</Text>
        ))
      )}
    </View>
  );
}
