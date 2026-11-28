/**
 * ConfirmInputDialog - a confirmation dialog that stays usable above the phone
 * keyboard (docs/STYLE_GUIDE.md §13.9, §5.2), with an optional text field.
 *
 * Looks like ConfirmDialog. The body (icon, title, message, field, error)
 * scrolls; the Cancel and confirm buttons sit below it, outside the scroll, so
 * they stay visible however long the text is and while the keyboard is open.
 *
 * Keyboard: the Modal draws behind both system bars (`statusBarTranslucent`,
 * `navigationBarTranslucent`), so its window lines up with the keyboard frame.
 * With edge-to-edge on, Android's adjustResize does not shrink a Modal window,
 * so `KeyboardAvoidingView` pads by the keyboard on both platforms. The overlap
 * it measures already includes the navigation bar, and the overlay pads for
 * that bar itself, so the offset is minus the bottom inset: the dialog moves up
 * by exactly the keyboard height, and by nothing when the keyboard is closed.
 *
 * Closing the keyboard never confirms: the field has no submit handler. While
 * `busy` the action shows a spinner, both buttons and the field are disabled,
 * and neither Back nor the scrim closes the dialog.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { ConfirmDialogProps } from './ConfirmDialog';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from './DialogFrame';

export interface ConfirmInputField {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  keyboardType?: TextInputProps['keyboardType'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  /** Shown under the field and read out when it appears. */
  error?: string | null;
  /** A longer text (a reason): several lines, the keyboard's return key adds a line. */
  multiline?: boolean;
  maxLength?: number;
  /** A quiet line under the field (a character counter); the error, when there is one, is drawn after it. */
  helper?: string;
  testID?: string;
}

export interface ConfirmInputDialogProps extends ConfirmDialogProps {
  /** A field to fill in before confirming. Without it the dialog is a scrolling confirmation. */
  field?: ConfirmInputField;
  /** Align the message to the start (for lists); centred by default. */
  messageAlign?: 'center' | 'left';
  /** The confirm button cannot be pressed (a required field is still empty); false by default. */
  confirmDisabled?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1 },
  input: {
    ...typography.body,
    width: '100%' as const,
    minHeight: touchTarget,
    marginTop: space.lg,
    borderRadius: radius.field,
    borderWidth: 1,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
    color: t.text.primary,
  },
  inputMultiline: { minHeight: touchTarget * 2, textAlignVertical: 'top' as const, paddingVertical: space.sm },
  helperText: { ...typography.footnote, alignSelf: 'flex-end' as const, marginTop: space.xs, color: t.text.secondary },
  inputFocused: { borderWidth: 2, borderColor: t.border.fieldFocus },
  inputError: { borderWidth: 2, borderColor: t.status.negative.border },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    gap: space.xs,
    marginTop: space.sm,
  },
  errorText: { ...typography.footnote, flex: 1, color: t.status.negative.text },
});

export const ConfirmInputDialog: React.FC<ConfirmInputDialogProps> = ({
  visible,
  title,
  message,
  confirmText: confirmTextProp,
  cancelText: cancelTextProp,
  onConfirm,
  onCancel,
  variant = 'default',
  icon,
  dismissible = true,
  busy = false,
  testID,
  field,
  messageAlign = 'center',
  confirmDisabled = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);
  const confirmText = confirmTextProp ?? tr('common.confirm');
  const cancelText = cancelTextProp ?? tr('common.cancel');
  const destructive = variant === 'danger';
  const cancel = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
    >
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
        {/* Scrim: tap to cancel */}
        <DialogOverlay safeArea onScrimPress={dismissible ? cancel : undefined}>
          <DialogCard testID={testID}>
            <DialogBody keyboardShouldPersistTaps="handled" testID={testID ? `${testID}-body` : undefined}>
              <DialogHeading
                title={title}
                message={message}
                tone={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'default'}
                icon={icon}
                messageAlign={messageAlign}
              />
              {field ? (
                <>
                  <TextInput
                    style={[styles.input, field.multiline && styles.inputMultiline, focused && styles.inputFocused, !!field.error && styles.inputError]}
                    value={field.value}
                    onChangeText={field.onChangeText}
                    placeholder={field.placeholder}
                    placeholderTextColor={t.text.placeholder}
                    accessibilityLabel={field.accessibilityLabel}
                    keyboardType={field.keyboardType}
                    autoComplete={field.autoComplete}
                    textContentType={field.textContentType}
                    returnKeyType={field.multiline ? 'default' : 'done'}
                    multiline={field.multiline}
                    maxLength={field.maxLength}
                    testID={field.testID}
                    editable={!busy}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                  {field.helper ? <Text style={styles.helperText}>{field.helper}</Text> : null}
                  {field.error ? (
                    <View style={styles.errorRow} accessibilityLiveRegion="polite">
                      <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                      <Text style={styles.errorText}>{field.error}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </DialogBody>

            <DialogActions>
              {cancelText ? <DialogButton label={cancelText} onPress={cancel} disabled={busy} /> : null}
              <DialogButton label={confirmText} onPress={onConfirm} role={destructive ? 'negative' : 'primary'} busy={busy} disabled={confirmDisabled} />
            </DialogActions>
          </DialogCard>
        </DialogOverlay>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ConfirmInputDialog;
