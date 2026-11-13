/**
 * The Payments tab of Invoice details (WH-143): the status tag, "Paid X of Y · Due Z", one row per payment and, for
 * administrators and supervisors, Record payment, and Edit and Delete on each payment recorded in the app. Every figure is
 * what the server sent (`get_invoice_detail`); nothing is added up here. The tab is shown only while payments are on.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { ImportedTag } from '@/components/ui/ImportedTag';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t } from '@/i18n';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { formatDate } from '@/utils/formatters';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import {
  formatMoney,
  getInvoicePayments,
  newPaymentRequestId,
  runPaymentWrite,
  type InvoicePayments,
  type PaymentRecord,
  type PaymentRefusal,
  type PaymentWriteDone,
} from '@/services/paymentsService';
import { PaymentStatusTag } from './PaymentStatusTag';
import { PaymentFormModal } from './PaymentFormModal';

interface PaymentsTabProps {
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice total, as the server holds it (shown in "Paid X of Y"). */
  total: number;
  cancelled: boolean;
  /** Administrators and supervisors: Record payment, Edit and Delete. */
  canManage: boolean;
}

const MODE_LABEL = {
  cash: 'payments.modes.cash',
  upi: 'payments.modes.upi',
  bank_transfer: 'payments.modes.bank_transfer',
  cheque: 'payments.modes.cheque',
  other: 'payments.modes.other',
} as const;

const makeStyles = (th: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: th.background.base },
  content: { paddingHorizontal: layout.marginCompact, paddingTop: space.lg, paddingBottom: space.xxxl, gap: space.md },
  summary: { backgroundColor: th.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, ...th.shadow[2] },
  summaryText: { ...typography.subhead, color: th.text.primary },
  row: { backgroundColor: th.surface.card, borderRadius: radius.card, padding: space.lg, gap: space.xs, ...th.shadow[2] },
  rowTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, gap: space.md },
  rowDate: { ...typography.subhead, color: th.text.primary, fontWeight: fontWeight.semibold },
  rowAmount: { ...typography.headline, color: th.text.primary, fontVariant: ['tabular-nums' as const] },
  rowMeta: { ...typography.footnote, color: th.text.secondary },
  importedTag: { alignSelf: 'flex-start' as const, marginTop: space.xs },
  actions: { flexDirection: 'row' as const, gap: space.sm, marginTop: space.xs },
  action: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
  },
  actionText: { ...typography.callout, color: th.brand.tint },
  actionDanger: { ...typography.callout, color: th.status.negative.text },
  empty: { ...typography.subhead, color: th.text.secondary, textAlign: 'center' as const, paddingVertical: space.xl },
  error: { ...typography.subhead, color: th.status.negative.text, textAlign: 'center' as const },
  center: { alignItems: 'center' as const, gap: space.md, paddingVertical: space.xl },
});

export function PaymentsTab({ invoiceId, invoiceNumber, total, cancelled, canManage }: PaymentsTabProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const [data, setData] = useState<InvoicePayments | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState<PaymentRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const next = await getInvoicePayments(invoiceId);
      if (mine !== request.current) return;
      setData(next);
      setFailed(false);
    } catch {
      if (mine === request.current) setFailed(true);
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);

  const openRecord = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (payment: PaymentRecord) => {
    setEditing(payment);
    setFormOpen(true);
  };

  const onDone = (done: PaymentWriteDone, edited: boolean) => {
    setFormOpen(false);
    showToast(edited ? t('payments.updated') : t('payments.saved', { amount: done.amountText, number: formatIdentifier(done.invoiceNumber ?? invoiceNumber) }));
    void load();
  };

  const onRefused = (refusal: PaymentRefusal, closed: boolean) => {
    // The figures on screen are read again whenever the server's answer says they are out of date.
    if (refusal.reload) void load();
    if (closed) {
      setFormOpen(false);
      showAlert(t('payments.section.title'), refusal.message);
    }
  };

  const confirmDelete = async () => {
    const payment = deleting;
    if (!payment || deleteBusy) return;
    setDeleteBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const outcome = await runPaymentWrite(
        { kind: 'delete', args: { p_id: payment.id, p_expected_updated_at: payment.updatedAt } },
        newPaymentRequestId('delete'),
        controller.signal,
        () => undefined
      );
      if (controller.signal.aborted || 'left' in outcome) return;
      setDeleting(null);
      if (outcome.ok) showToast(t('payments.deleted'));
      else showAlert(t('payments.section.title'), outcome.refusal.message);
      void load();
    } finally {
      abort.current = null;
      setDeleteBusy(false);
    }
  };

  const figures = data;
  const dueText = figures?.dueAmount !== null && figures?.dueAmount !== undefined ? formatMoney(figures.dueAmount) : undefined;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} testID="payments-tab">
        {loading ? <ActivityIndicator color={th.brand.tint} accessibilityLabel={t('common.loading')} /> : null}
        {!loading && failed && !data ? (
          <View style={styles.center}>
            <Text style={styles.error} accessibilityRole="alert">{t('payments.section.loadFailed')}</Text>
            <Button type="secondary" onPress={() => { setLoading(true); void load(); }}>{t('common.retry')}</Button>
          </View>
        ) : null}
        {data ? (
          <>
            <View style={styles.summary}>
              <PaymentStatusTag status={data.status} testID="payments-status" />
              {data.paidAmount !== null && data.dueAmount !== null ? (
                <Text style={styles.summaryText} testID="payments-summary">
                  {t('payments.paidOfTotal', { paid: formatMoney(data.paidAmount), total: formatMoney(total), due: formatMoney(data.dueAmount) })}
                </Text>
              ) : null}
              {canManage && !cancelled ? (
                <Button onPress={openRecord} testID="payment-record">{t('payments.record')}</Button>
              ) : null}
            </View>
            {data.payments.length === 0 ? <Text style={styles.empty}>{t('payments.section.none')}</Text> : null}
            {data.payments.map(payment => (
              <View key={payment.id} style={styles.row} testID={`payment-row-${payment.id}`}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowDate}>{formatDate(payment.paidOn)}</Text>
                  <Text style={styles.rowAmount}>{formatMoney(payment.amount)}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {payment.mode ? t(MODE_LABEL[payment.mode]) : t('payments.section.fromAccounting')}
                  {payment.note ? ` · ${payment.note}` : ''}
                </Text>
                {payment.imported ? <ImportedTag style={styles.importedTag} testID={`payment-imported-${payment.id}`} /> : null}
                {payment.enteredByName ? <Text style={styles.rowMeta}>{t('payments.section.enteredBy', { name: payment.enteredByName })}</Text> : null}
                {canManage && payment.recordedInApp && !payment.imported ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.action} onPress={() => openEdit(payment)} accessibilityRole="button" testID={`payment-edit-${payment.id}`}>
                      <Icon name="pencil-outline" size={iconSize.md} color={th.brand.tint} />
                      <Text style={styles.actionText}>{t('common.edit')}</Text>
                    </Pressable>
                    <Pressable style={styles.action} onPress={() => setDeleting(payment)} accessibilityRole="button" testID={`payment-delete-${payment.id}`}>
                      <Icon name="delete-outline" size={iconSize.md} color={th.status.negative.text} />
                      <Text style={styles.actionDanger}>{t('common.delete')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
      <PaymentFormModal
        visible={formOpen}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        dueText={dueText}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDone={onDone}
        onRefused={onRefused}
      />
      <ConfirmDialog
        visible={deleting !== null}
        title={deleting ? t('payments.deleteTitle', { amount: formatMoney(deleting.amount), date: formatDate(deleting.paidOn) }) : ''}
        message=""
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

export default PaymentsTab;
