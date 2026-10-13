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
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { ConfirmDialogProps } from './ConfirmDialog';

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
}

export interface ConfirmInputDialogProps extends ConfirmDialogProps {
  /** A field to fill in before confirming. Without it the dialog is a scrolling confirmation. */
  field?: ConfirmInputField;
  /** Align the message to the start (for lists); centred by default. */
  messageAlign?: 'center' | 'left';
}

const ICON_CIRCLE = layout.avatar.lg - space.xs;

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
  },
  dialog: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '100%' as const,
    flexShrink: 1,
    ...t.shadow[4],
  },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: {
    alignItems: 'center' as const,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.lg,
  },
  iconContainer: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: space.lg,
  },
  iconDefault: { backgroundColor: t.brand.subtle },
  iconWarning: { backgroundColor: t.status.critical.background },
  iconDanger: { backgroundColor: t.status.negative.background },
  title: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.sm,
  },
  message: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    alignSelf: 'stretch' as const,
  },
  messageLeft: { textAlign: 'left' as const },
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
  actions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingHorizontal: space.xxl,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  button: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelButton: { borderWidth: 1, borderColor: t.border.button },
  cancelButtonPressed: { backgroundColor: t.brand.subtle },
  cancelButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  confirmPrimary: { backgroundColor: t.brand.fill },
  confirmPrimaryPressed: { backgroundColor: t.brand.fillPressed },
  confirmPrimaryText: { color: t.brand.onFill },
  confirmDestructive: { backgroundColor: t.destructive.fill },
  confirmDestructivePressed: { backgroundColor: t.destructive.fillPressed },
  confirmDestructiveText: { color: t.destructive.onFill },
  confirmButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    textAlign: 'center' as const,
  },
  disabled: { opacity: t.interaction.disabledOpacity },
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

  const iconName: string | undefined =
    icon ?? (variant === 'danger' ? 'alert-circle-outline' : variant === 'warning' ? 'alert-outline' : undefined);
  const iconColor =
    variant === 'danger' ? t.status.negative.text : variant === 'warning' ? t.status.critical.text : t.brand.tint;
  const iconBg =
    variant === 'danger' ? styles.iconDanger : variant === 'warning' ? styles.iconWarning : styles.iconDefault;

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
        <View style={[styles.overlay, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
          {/* Scrim: tap to cancel */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? cancel : undefined}
            accessible={false}
            importantForAccessibility="no"
          />
          <View style={styles.dialog} accessibilityViewIsModal testID={testID}>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              testID={testID ? `${testID}-body` : undefined}
            >
              {iconName ? (
                <View style={[styles.iconContainer, iconBg]} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Icon name={iconName} size={iconSize.xl} color={iconColor} />
                </View>
              ) : null}
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Text style={[styles.message, messageAlign === 'left' && styles.messageLeft]}>{message}</Text>
              {field ? (
                <>
                  <TextInput
                    style={[styles.input, focused && styles.inputFocused, !!field.error && styles.inputError]}
                    value={field.value}
                    onChangeText={field.onChangeText}
                    placeholder={field.placeholder}
                    placeholderTextColor={t.text.placeholder}
                    accessibilityLabel={field.accessibilityLabel}
                    keyboardType={field.keyboardType}
                    autoComplete={field.autoComplete}
                    textContentType={field.textContentType}
                    returnKeyType="done"
                    editable={!busy}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                  {field.error ? (
                    <View style={styles.errorRow} accessibilityLiveRegion="polite">
                      <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                      <Text style={styles.errorText}>{field.error}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <View style={styles.actions}>
              {cancelText ? (
                <Pressable
                  style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.cancelButtonPressed, busy && styles.disabled]}
                  onPress={cancel}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={cancelText}
                  accessibilityState={{ disabled: busy }}
                >
                  <Text style={styles.cancelButtonText}>{cancelText}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  destructive ? styles.confirmDestructive : styles.confirmPrimary,
                  pressed && (destructive ? styles.confirmDestructivePressed : styles.confirmPrimaryPressed),
                ]}
                onPress={onConfirm}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={confirmText}
                accessibilityState={{ disabled: busy, busy }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={destructive ? t.destructive.onFill : t.brand.onFill} />
                ) : (
                  <Text style={[styles.confirmButtonText, destructive ? styles.confirmDestructiveText : styles.confirmPrimaryText]}>
                    {confirmText}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ConfirmInputDialog;
