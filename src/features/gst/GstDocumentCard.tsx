/**
 * The GST facts of an invoice document on its details screen (WH-151): the type, the document made together with it (a
 * two-document save), the place of supply, the tax split and the numbers it was made with. Every figure is the server's
 * (`get_invoice_data` header: doc_type, linked_invoice, gst); nothing is worked out here. Shown for the five types on a
 * backend with migration 173, except that an 'invoice' has no tax facts and shows only its type.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { StatusTag } from '@/components/ui/StatusTag';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { formatIdentifier, t as tr } from '@/i18n';
import { asDocType, docTypeKey } from '@/features/gst/docType';
import { stateNameOf } from '@/features/gst/indianStates';
import type { InvoiceDetail } from '@/services/invoice-service';

const makeStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface.card, borderRadius: radius.card, marginBottom: space.md, overflow: 'hidden', ...t.shadow[2] },
    body: { padding: space.lg, gap: space.sm },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
    label: { ...typography.body, color: t.text.secondary, flexShrink: 1 },
    value: { ...typography.body, color: t.text.primary, textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
    note: { ...typography.footnote, color: t.text.secondary },
    link: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget, paddingHorizontal: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.divider },
    linkText: { ...typography.body, color: t.brand.tint, flex: 1 },
  });

const amount = (value: unknown): string | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? formatInvoiceAmount(n) : null;
};

interface Props {
  header: Pick<InvoiceDetail, 'doc_type' | 'linked_invoice' | 'gst'>;
  /** Opens the other document of a pair. */
  onOpenLinked?: (invoiceId: string) => void;
}

export function GstDocumentCard({ header, onOpenLinked }: Props) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const docType = asDocType(header.doc_type);
  const gst = header.gst ?? null;
  const linked = header.linked_invoice ?? null;

  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (gst) {
    const place = gst.place_of_supply?.name || stateNameOf(gst.place_of_supply?.code ?? null);
    if (place) rows.push({ key: 'place', label: tr('gst.detail.placeOfSupply'), value: place });
    if (gst.tax_head === 'cgst_sgst') {
      const cgst = amount(gst.cgst_amount);
      const sgst = amount(gst.sgst_amount);
      if (cgst) rows.push({ key: 'cgst', label: tr('gst.detail.cgst'), value: cgst });
      if (sgst) rows.push({ key: 'sgst', label: tr('gst.detail.sgst'), value: sgst });
    } else if (gst.tax_head === 'igst') {
      const igst = amount(gst.igst_amount);
      if (igst) rows.push({ key: 'igst', label: tr('gst.detail.igst'), value: igst });
    }
    if (gst.supplier?.gstin) rows.push({ key: 'supplier', label: tr('gst.detail.supplierGstin'), value: formatIdentifier(gst.supplier.gstin) });
    if (gst.customer?.gstin) rows.push({ key: 'customer', label: tr('gst.detail.customerGstin'), value: formatIdentifier(gst.customer.gstin) });
    if (gst.sac_storage) rows.push({ key: 'sacStorage', label: tr('gst.detail.sacStorage'), value: formatIdentifier(gst.sac_storage) });
    if (gst.sac_labour) rows.push({ key: 'sacLabour', label: tr('gst.detail.sacLabour'), value: formatIdentifier(gst.sac_labour) });
  }

  const linkedLabel = linked
    ? tr('gst.detail.madeWith', { number: formatIdentifier(String(linked.inv_no)), type: tr(docTypeKey(linked.doc_type)) })
    : null;

  return (
    <View style={styles.card} testID="invoice-gst-card">
      <View style={styles.body}>
        <View style={styles.tagRow}>
          <StatusTag status="informative" icon="file-document-outline" label={tr(docTypeKey(docType))} />
        </View>
        {rows.map((row) => (
          <View key={row.key} style={styles.row} accessible accessibilityLabel={`${row.label}, ${row.value}`}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
        {docType === 'bill_of_supply' || docType === 'invoice_cum_bos' ? <Text style={styles.note}>{tr('gst.detail.exemptNote')}</Text> : null}
        {gst?.reverse_charge === false ? <Text style={styles.note}>{tr('gst.detail.reverseCharge')}</Text> : null}
      </View>
      {linked && linkedLabel ? (
        <Pressable
          style={styles.link}
          onPress={onOpenLinked ? () => onOpenLinked(linked.id) : undefined}
          disabled={!onOpenLinked}
          accessibilityRole="button"
          accessibilityLabel={tr('gst.detail.openLinked', { number: formatIdentifier(String(linked.inv_no)) })}
          testID="invoice-gst-linked"
        >
          <Icon name="link-variant" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.linkText}>{linkedLabel}</Text>
          <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
