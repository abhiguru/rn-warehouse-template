/**
 * Record payment / Edit payment (WH-143): Date, Amount, Mode, Note. A full-screen form. The server alone checks the
 * amount against what is due, the dates and the version of an edit; the form shows its refusals in the app's words next to
 * the field they are about and keeps what was typed. A save whose answer is lost locks the form until the server has said
 * what became of it (rule W22).
 */
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t } from '@/i18n';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { REFUSAL } from '@/utils/serverRefusal';
import { parseLocalISODate, todayInIST, toLocalISODate } from '@/utils/formatters';
import {
  PAYMENT_MODES,
  PAYMENT_NOTE_MAX,
  amountForServer,
  newPaymentRequestId,
  runPaymentWrite,
  type PaymentMode,
  type PaymentOutcome,
  type PaymentRecord,
  type PaymentRefusal,
  type PaymentWrite,
  type PaymentWriteDone,
} from '@/services/paymentsService';

export interface PaymentFormModalProps {
  visible: boolean;
  invoiceId: string;
  invoiceNumber: string;
  /** The server's due figure, already worded ("₹600.00"), shown as a hint. */
  dueText?: string;
  /** The payment being edited; null records a new one. */
  editing: PaymentRecord | null;
  onClose: () => void;
  /** The server saved it. */
  onDone: (done: PaymentWriteDone, edited: boolean) => void;
  /** The server refused. `closed` says whether the form closed itself (what it showed is out of date). */
  onRefused: (refusal: PaymentRefusal, closed: boolean) => void;
}

const MODE_LABEL = {
  cash: 'payments.modes.cash',
  upi: 'payments.modes.upi',
  bank_transfer: 'payments.modes.bank_transfer',
  cheque: 'payments.modes.cheque',
  other: 'payments.modes.other',
} as const;

const makeStyles = (th: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: th.background.base },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingLeft: space.xs,
    paddingRight: layout.marginCompact,
    minHeight: touchTarget + space.md,
    backgroundColor: th.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border.divider,
    gap: space.sm,
  },
  headerText: { flex: 1 },
  kicker: { ...typography.footnote, color: th.text.secondary },
  title: { ...typography.headline, color: th.text.primary },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center' as const, justifyContent: 'center' as const },
  body: { paddingHorizontal: layout.marginCompact, paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },
  label: { ...typography.footnote, color: th.text.secondary, marginBottom: space.xs },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: th.border.button,
  },
  chipOn: { backgroundColor: th.brand.subtle, borderColor: th.brand.tint },
  chipText: { ...typography.callout, color: th.text.primary },
  banner: { ...typography.subhead, color: th.status.negative.text },
  notice: { ...typography.subhead, color: th.text.secondary },
  footer: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.sm,
    backgroundColor: th.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: th.border.divider,
  },
});

const today = (): Date => todayInIST();

export function PaymentFormModal({ visible, invoiceId, invoiceNumber, dueText, editing, onClose, onDone, onRefused }: PaymentFormModalProps) {
  const styles = useThemedStyles(makeStyles);
  const th = useTokens();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState<Date>(today());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ date?: string; amount?: string; banner?: string }>({});
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [asking, setAsking] = useState<'discard' | 'leave' | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sending = useRef(false);

  // Each opening starts from the payment being edited, or from today with nothing entered.
  useEffect(() => {
    if (!visible) return;
    setDate(editing ? parseLocalISODate(editing.paidOn) : today());
    setAmount(editing ? editing.amount.toFixed(2) : '');
    setMode(editing?.mode ?? 'cash');
    setNote(editing?.note ?? '');
    setErrors({});
    setAsking(null);
    setSaving(false);
    setLocked(false);
  }, [visible, editing]);

  useEffect(() => () => abort.current?.abort(), []);

  const dirty = editing
    ? toLocalISODate(date) !== editing.paidOn || amount !== editing.amount.toFixed(2) || mode !== (editing.mode ?? 'cash') || note !== (editing.note ?? '')
    : amount !== '' || note !== '' || mode !== 'cash' || toLocalISODate(date) !== toLocalISODate(today());

  const requestClose = () => {
    if (locked) setAsking('leave');
    else if (saving) return;
    else if (dirty) setAsking('discard');
    else onClose();
  };

  const save = async () => {
    if (sending.current) return;
    const exact = amountForServer(amount);
    if (exact === null) {
      setErrors({ amount: t('payments.form.amountRequired') });
      return;
    }
    const paidOn = toLocalISODate(date);
    const trimmedNote = note.trim();
    const common = { p_paid_on: paidOn, p_amount: exact, p_mode: mode, p_note: trimmedNote === '' ? null : trimmedNote };
    const write: PaymentWrite = editing
      ? { kind: 'update', args: { p_id: editing.id, p_expected_updated_at: editing.updatedAt, ...common } }
      : { kind: 'record', args: { p_invoice_id: invoiceId, ...common } };
    sending.current = true;
    setSaving(true);
    setErrors({});
    const controller = new AbortController();
    abort.current = controller;
    let outcome: PaymentOutcome;
    try {
      outcome = await runPaymentWrite(write, newPaymentRequestId(write.kind), controller.signal, setLocked);
    } finally {
      abort.current = null;
      sending.current = false;
    }
    if (controller.signal.aborted) return;
    setSaving(false);
    if ('left' in outcome) return;
    if (outcome.ok) {
      onDone(outcome.done, editing !== null);
      return;
    }
    const { refusal } = outcome;
    if (refusal.keepForm) {
      const field =
        refusal.reason === REFUSAL.PAYMENT_OVER_DUE
          ? 'amount'
          : refusal.reason === REFUSAL.PAYMENT_DATE_FUTURE || refusal.reason === REFUSAL.PAYMENT_BEFORE_INVOICE
            ? 'date'
            : 'banner';
      setErrors({ [field]: refusal.message });
      onRefused(refusal, false);
    } else {
      onRefused(refusal, true);
    }
  };

  const leave = () => {
    abort.current?.abort();
    setAsking(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose} presentationStyle="fullScreen">
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.close} onPress={requestClose} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="payment-form-close">
            <Icon name="close" size={iconSize.lg} color={th.icon.primary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{t(editing ? 'payments.edit' : 'payments.record')}</Text>
            <Text style={styles.title} numberOfLines={1}>{t('payments.form.title', { number: formatIdentifier(invoiceNumber) })}</Text>
          </View>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {locked ? <Text style={styles.notice} accessibilityLiveRegion="polite">{t('payments.form.waiting')}</Text> : null}
            {errors.banner ? <Text style={styles.banner} accessibilityRole="alert">{errors.banner}</Text> : null}
            <DatePickerInput
              label={t('payments.form.date')}
              value={date}
              onChange={next => { setDate(next); setErrors(e => ({ ...e, date: undefined })); }}
              disabled={saving}
              error={errors.date}
              required
            />
            <Input
              label={t('payments.form.amount')}
              value={amount}
              onChangeText={next => { setAmount(next); setErrors(e => ({ ...e, amount: undefined })); }}
              keyboardType="decimal-pad"
              numeric
              editable={!saving}
              error={errors.amount}
              helperText={dueText ? t('payments.form.dueNow', { due: dueText }) : undefined}
              required
              selectTextOnFocus
              testID="payment-amount"
            />
            <View>
              <Text style={styles.label}>{t('payments.form.mode')}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {PAYMENT_MODES.map(value => (
                  <Pressable
                    key={value}
                    disabled={saving}
                    onPress={() => setMode(value)}
                    style={[styles.chip, mode === value && styles.chipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: mode === value }}
                    testID={`payment-mode-${value}`}
                  >
                    <Text style={styles.chipText}>{t(MODE_LABEL[value])}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Input
              label={t('payments.form.note')}
              value={note}
              onChangeText={setNote}
              placeholder={t('payments.form.notePlaceholder')}
              maxLength={PAYMENT_NOTE_MAX}
              showCharacterCount
              editable={!saving}
              testID="payment-note"
            />
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
            <Button onPress={() => void save()} loading={saving} disabled={saving} testID="payment-save">
              {t('payments.form.save')}
            </Button>
          </View>
        </KeyboardAvoidingView>
        <ConfirmDialog
          visible={asking !== null}
          title={t(asking === 'leave' ? 'payments.form.leaveTitle' : 'payments.form.discardTitle')}
          message={t(asking === 'leave' ? 'payments.form.leaveBody' : 'payments.form.discardBody')}
          confirmText={t(asking === 'leave' ? 'payments.form.leave' : 'payments.form.discard')}
          cancelText={t('payments.form.keep')}
          variant="warning"
          onConfirm={leave}
          onCancel={() => setAsking(null)}
        />
      </View>
    </Modal>
  );
}
