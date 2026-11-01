/**
 * CancelInvoiceDialog: the sheet that asks why an invoice is cancelled (server migration 134). The reason is required,
 * 3 to 500 characters once trimmed; the counter counts the characters the server counts. The dialog keeps what was
 * typed while a cancel is sent, and is emptied each time it is opened again.
 */
import React, { useEffect, useState } from 'react';
import { ConfirmInputDialog } from '@/components/ConfirmInputDialog';
import { formatNumber } from '@/utils/formatters';
import { t as tr, formatIdentifier } from '@/i18n';
import {
  CANCEL_REASON_MAX,
  CANCEL_REASON_MIN,
  cancelReasonLength,
  cancelReasonProblem,
} from '@/features/invoice/utils/cancelReason';

interface CancelInvoiceDialogProps {
  visible: boolean;
  invoiceNumber: number | string;
  customerName?: string | null;
  busy?: boolean;
  /** The typed reason, as typed (the service trims it). Only called when it is acceptable. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function CancelInvoiceDialog({ visible, invoiceNumber, customerName, busy = false, onConfirm, onCancel }: CancelInvoiceDialogProps) {
  const [reason, setReason] = useState('');
  const [showProblem, setShowProblem] = useState(false);
  useEffect(() => {
    if (visible) {
      setReason('');
      setShowProblem(false);
    }
  }, [visible]);

  const problem = cancelReasonProblem(reason);
  const error = showProblem && problem
    ? problem === 'tooShort'
      ? tr('invoice.cancel.tooShort', { min: formatNumber(CANCEL_REASON_MIN) })
      : tr('invoice.cancel.tooLong', { max: formatNumber(CANCEL_REASON_MAX) })
    : null;

  return (
    <ConfirmInputDialog
      visible={visible}
      title={tr('invoice.cancel.title', { number: formatIdentifier(invoiceNumber) })}
      message={customerName ? tr('invoice.cancel.messageFor', { number: formatIdentifier(invoiceNumber), customer: customerName }) : tr('invoice.cancel.message')}
      confirmText={tr('invoice.cancel.confirm')}
      cancelText={tr('invoice.cancel.keep')}
      variant="danger"
      busy={busy}
      dismissible={false}
      messageAlign="left"
      testID="cancel-invoice-dialog"
      onCancel={onCancel}
      onConfirm={() => {
        if (problem) {
          setShowProblem(true);
          return;
        }
        onConfirm(reason);
      }}
      field={{
        value: reason,
        onChangeText: setReason,
        placeholder: tr('invoice.cancel.placeholder'),
        accessibilityLabel: tr('invoice.cancel.fieldLabel'),
        multiline: true,
        maxLength: CANCEL_REASON_MAX,
        helper: tr('invoice.cancel.counter', { used: formatNumber(cancelReasonLength(reason)), max: formatNumber(CANCEL_REASON_MAX) }),
        error,
        testID: 'cancel-invoice-reason',
      }}
    />
  );
}

export default CancelInvoiceDialog;
