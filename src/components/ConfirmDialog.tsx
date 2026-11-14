/**
 * ConfirmDialog - confirmation dialog (docs/STYLE_GUIDE.md §13.9).
 *
 * The frame is DialogFrame's (surface.sheet, radius.card and shadow[4] over
 * overlay.scrim). Optional icon: warning in status.critical.text, danger in
 * status.negative.text. Title in title3, message in body text.secondary. Cancel
 * is a secondary button and the action a primary one (the destructive fill for
 * `danger`). The Android back
 * button and a tap on the scrim cancel, except while `busy`: then the action
 * shows a spinner, both buttons are disabled and neither Back nor the scrim
 * closes the dialog.
 *
 * Wording (§12.2): the title asks a question naming the object, and the
 * confirm button repeats the verb ("Delete GRN", "Cancel").
 */

import React from 'react';
import { Modal } from 'react-native';
import type { IconName } from '@/types/icon.types';
import { t as tr } from '@/i18n';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from './DialogFrame';

export type ConfirmVariant = 'default' | 'warning' | 'danger';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ConfirmVariant;
  /** Optional icon name (MaterialCommunityIcons) */
  icon?: IconName;
  /** A third action between Cancel and the confirm button (for example "Only this GRN"); drawn when both are given. */
  middleText?: string;
  onMiddle?: () => void;
  /** Whether tapping the scrim cancels (default true). The back button always cancels. */
  dismissible?: boolean;
  /** The action is running: spinner in the confirm button, both buttons disabled, Back and the scrim do nothing. */
  busy?: boolean;
  /** The Android Back key does nothing: the question is answered with its buttons (the scrim is `dismissible`'s). */
  ignoreBack?: boolean;
  testID?: string;
  /** The dialog has finished closing (iOS only; Android has no such event, watch `visible`). Open the next Modal from here. */
  onDismissed?: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText: confirmTextProp,
  cancelText: cancelTextProp,
  onConfirm,
  onCancel,
  middleText,
  onMiddle,
  variant = 'default',
  icon,
  dismissible = true,
  busy = false,
  ignoreBack = false,
  testID,
  onDismissed,
}) => {
  const confirmText = confirmTextProp ?? tr('common.confirm');
  const cancelText = cancelTextProp ?? tr('common.cancel');
  const destructive = variant === 'danger';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy || ignoreBack ? () => {} : onCancel}
      onDismiss={onDismissed}
      statusBarTranslucent
    >
      {/* Scrim: tap to cancel */}
      <DialogOverlay onScrimPress={dismissible && !busy ? onCancel : undefined}>
        <DialogCard accessibilityRole="alert" accessibilityLabel={title} testID={testID}>
          <DialogBody>
            <DialogHeading title={title} message={message} tone={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'default'} icon={icon} />
          </DialogBody>
          <DialogActions>
            {/* cancelText="" asks for a one-button dialog; an unlabelled button is not drawn. */}
            {cancelText ? <DialogButton label={cancelText} onPress={onCancel} disabled={busy} /> : null}
            {middleText && onMiddle ? <DialogButton label={middleText} onPress={onMiddle} disabled={busy} testID="confirm-middle" /> : null}
            <DialogButton label={confirmText} onPress={onConfirm} role={destructive ? 'negative' : 'primary'} busy={busy} />
          </DialogActions>
        </DialogCard>
      </DialogOverlay>
    </Modal>
  );
};

export default ConfirmDialog;
