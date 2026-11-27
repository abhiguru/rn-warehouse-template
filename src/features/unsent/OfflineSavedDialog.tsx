/**
 * "Saved on this phone" (WH-161, Design 10.2 and 10.8): what a new GRN or dispatch shows after Save when it was kept on the phone
 * and not sent. View and Create another only: Print and Share wait for the server. The message says whether the record is sent
 * when the phone reconnects, or after the person's earlier entries (the phone is reachable but older work is still unsent), and
 * whether the number is given at send or was typed.
 */
import React from 'react';
import { Modal } from 'react-native';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from '@/components/DialogFrame';
import { t, type TranslationKey } from '@/i18n';

export interface OfflineSavedDialogProps {
  isVisible: boolean;
  document: 'grn' | 'dispatch';
  customer: string;
  /** The number the person typed; absent when the server gives it at send. An identifier, shown as typed (0-9). */
  number?: string | undefined;
  /** True when the phone is reachable and older entries are still being sent (Design 10.8). */
  afterEarlierEntries: boolean;
  onView: () => void;
  onCreateAnother: () => void;
}

/** The message's key: document, typed or issued number, and when it is sent. */
export function savedMessageKey(document: 'grn' | 'dispatch', typed: boolean, afterEarlierEntries: boolean): TranslationKey {
  const base = document === 'grn' ? 'savedGrn' : 'savedDispatch';
  return `offline.offlineNew.${base}${typed ? 'Typed' : ''}${afterEarlierEntries ? 'Queued' : ''}` as TranslationKey;
}

export function OfflineSavedDialog({ isVisible, document, customer, number, afterEarlierEntries, onView, onCreateAnother }: OfflineSavedDialogProps) {
  const typed = number !== undefined && number !== '';
  const message = t(savedMessageKey(document, typed, afterEarlierEntries), { customer, ...(typed ? { number } : {}) });
  const title = t('offline.offlineNew.savedTitle');
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onView}>
      <DialogOverlay>
        <DialogCard testID="offline-saved-dialog" accessibilityLabel={`${title}. ${message}`}>
          <DialogBody>
            <DialogHeading tone="success" title={title} message={message} />
          </DialogBody>
          <DialogActions stacked>
            <DialogButton stacked role="primary" label={t('common.view')} onPress={onView} testID="offline-saved-view" />
            <DialogButton stacked icon="plus" label={t(document === 'grn' ? 'components.documentSuccess.grn.createAnother' : 'components.documentSuccess.dispatch.createAnother')} onPress={onCreateAnother} testID="offline-saved-create-another" />
          </DialogActions>
        </DialogCard>
      </DialogOverlay>
    </Modal>
  );
}
