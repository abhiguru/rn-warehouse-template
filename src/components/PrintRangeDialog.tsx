import { DEMO_CAPABILITIES } from '@/config/demoCapabilities';
/**
 * PrintRangeDialog - Reusable dialog for selecting print range
 *
 * SAP Fiori dialog (docs/STYLE_GUIDE.md §13.9): surface.sheet, radius.card,
 * shadow[4] over overlay.scrim; Cancel secondary, Print primary.
 *
 * Pre-populates both start and end fields with the selected item number
 * User can override to print a range or just click OK to print single item
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { DocumentEntity } from '@/i18n/entities';

interface PrintRangeDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (startNumber: string, endNumber: string) => Promise<void>;
  title: string;
  defaultNumber: string;
  /** Which document's numbers are printed. Selects whole-sentence texts in both languages. */
  entity?: DocumentEntity;
  /**
   * Older way to name the number ("GRN number"): a word placed into the English
   * sentences. Used only when `entity` is not given.
   */
  label?: string;
  placeholder?: string;
  onViewJobs?: () => void;
}

const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.lg,
  },
  dialogContainer: {
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
  },
  dialog: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    ...t.shadow[4],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget + space.sm,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: {
    ...typography.title3,
    flex: 1,
    color: t.text.primary,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  iconButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  content: {
    padding: space.lg,
  },
  description: {
    ...typography.body,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  helpText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.lg,
  },
  rangeSection: {
    gap: space.lg,
  },
  inputGroup: {
    gap: space.xs,
  },
  inputLabelText: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  input: {
    ...typography.body,
    minHeight: layout.rowMinHeight,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: t.border.field,
    backgroundColor: t.surface.field,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  inputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  inputDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: t.status.negative.border,
    backgroundColor: t.status.negative.background,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  leftActions: {
    flexShrink: 1,
  },
  rightActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginLeft: 'auto' as const,
  },
  tertiaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    gap: space.xs,
    borderRadius: radius.button,
  },
  tertiaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  tertiaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  secondaryButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.text.primary,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    gap: space.sm,
    minWidth: 100,
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  noticeBody: {
    padding: space.lg,
    gap: space.sm,
  },
  noticeText: {
    ...typography.body,
    color: t.text.secondary,
  },
});

export const PrintRangeDialog: React.FC<PrintRangeDialogProps> = ({
  visible,
  onDismiss,
  onConfirm,
  title,
  defaultNumber,
  entity,
  label = '',
  placeholder = '',
  onViewJobs,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const [startNumber, setStartNumber] = useState(defaultNumber);
  const [endNumber, setEndNumber] = useState(defaultNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (visible) {
      if (__DEV__)
        console.log(
          '[PrintRangeDialog] Dialog opened with defaultNumber:',
          defaultNumber
        );
      setStartNumber(defaultNumber);
      setEndNumber(defaultNumber);
      setError(null);
      setLoading(false);
    }
  }, [visible, defaultNumber]);

  const handleConfirm = async () => {
    setError(null);

    if (!startNumber.trim() || !endNumber.trim()) {
      setError(tr('components.printRange.enterBoth'));
      return;
    }

    setLoading(true);

    try {
      await onConfirm(startNumber.trim(), endNumber.trim());
      onDismiss();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : tr('components.printRange.printFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const lowerLabel = label.toLowerCase();
  const texts = entity
    ? {
        chooseRange: tr(`components.printRange.${entity}.chooseRange`),
        sameNumberHint: tr(`components.printRange.${entity}.sameNumberHint`),
        startPlaceholder: tr(`components.printRange.${entity}.startPlaceholder`),
        endPlaceholder: tr(`components.printRange.${entity}.endPlaceholder`),
        fromLabel: tr(`components.printRange.${entity}.fromLabel`),
        toLabel: tr(`components.printRange.${entity}.toLabel`),
      }
    : {
        chooseRange: tr('components.printRange.chooseRange', { label: lowerLabel }),
        sameNumberHint: tr('components.printRange.sameNumberHint', { label: lowerLabel }),
        startPlaceholder: tr('components.printRange.startPlaceholder', { label: lowerLabel }),
        endPlaceholder: tr('components.printRange.endPlaceholder', { label: lowerLabel }),
        fromLabel: tr('components.printRange.fromLabel', { label: lowerLabel }),
        toLabel: tr('components.printRange.toLabel', { label: lowerLabel }),
      };

  // Keep every entry point honest, including direct document detail actions.
  if (!DEMO_CAPABILITIES.printing)
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={tr('components.printRange.closeNotice')}
          />
          <View style={styles.dialogContainer}>
            <View style={styles.dialog} accessibilityViewIsModal>
              <View style={styles.header}>
                <Icon name="printer-outline" size={iconSize.lg} color={t.brand.tint} />
                <Text style={styles.title} accessibilityRole="header">
                  {tr('components.printRange.unavailableTitle')}
                </Text>
              </View>
              <View style={styles.noticeBody}>
                <Text style={styles.noticeText}>
                  {tr('components.printRange.unavailableMessage')}
                </Text>
              </View>
              <View style={styles.actions}>
                <View style={styles.rightActions}>
                  <Pressable
                    onPress={onDismiss}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={tr('components.printRange.closeNotice')}
                  >
                    <Text style={styles.secondaryButtonText}>{tr('common.close')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={tr('components.printRange.cancelPrinting')}
        />

        <View style={styles.dialogContainer}>
          <View style={styles.dialog} accessibilityViewIsModal>
            {/* Header */}
            <View style={styles.header}>
              <Icon name="printer-outline" size={iconSize.lg} color={t.brand.tint} />
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && styles.iconButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={tr('components.printRange.closeDialog')}
              >
                <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
              </Pressable>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.description}>
                {texts.chooseRange}
              </Text>
              <Text style={styles.helpText}>
                {texts.sameNumberHint}
              </Text>

              <View style={styles.rangeSection}>
                {/* From Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabelText} nativeID="print-range-from">
                    {tr('components.printRange.from')}
                  </Text>
                  <TextInput
                    value={startNumber}
                    onChangeText={setStartNumber}
                    placeholder={placeholder || texts.startPlaceholder}
                    placeholderTextColor={t.text.placeholder}
                    editable={!loading}
                    onFocus={() => setFocused('start')}
                    onBlur={() => setFocused(null)}
                    style={[
                      styles.input,
                      focused === 'start' && styles.inputFocused,
                      loading && styles.inputDisabled,
                    ]}
                    accessibilityLabel={texts.fromLabel}
                    accessibilityLabelledBy="print-range-from"
                    returnKeyType="next"
                  />
                </View>

                {/* To Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabelText} nativeID="print-range-to">
                    {tr('components.printRange.to')}
                  </Text>
                  <TextInput
                    value={endNumber}
                    onChangeText={setEndNumber}
                    placeholder={placeholder || texts.endPlaceholder}
                    placeholderTextColor={t.text.placeholder}
                    editable={!loading}
                    onFocus={() => setFocused('end')}
                    onBlur={() => setFocused(null)}
                    style={[
                      styles.input,
                      focused === 'end' && styles.inputFocused,
                      loading && styles.inputDisabled,
                    ]}
                    accessibilityLabel={texts.toLabel}
                    accessibilityLabelledBy="print-range-to"
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                  />
                </View>
              </View>

              {/* Error message strip */}
              {error && (
                <View style={styles.errorContainer} accessibilityRole="alert">
                  <Icon
                    name="alert-circle"
                    size={iconSize.md}
                    color={t.status.negative.text}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              {onViewJobs && (
                <View style={styles.leftActions}>
                  <Pressable
                    onPress={onViewJobs}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.tertiaryButton,
                      pressed && styles.tertiaryButtonPressed,
                      loading && styles.buttonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={tr('components.printRange.viewJobs')}
                    accessibilityState={{ disabled: loading }}
                  >
                    <Icon
                      name="format-list-bulleted"
                      size={iconSize.md}
                      color={t.brand.tint}
                    />
                    <Text style={styles.tertiaryButtonText}>{tr('components.printJobs.title')}</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.rightActions}>
                <Pressable
                  onPress={onDismiss}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                    loading && styles.buttonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={tr('common.cancel')}
                  accessibilityState={{ disabled: loading }}
                >
                  <Text style={styles.secondaryButtonText}>{tr('common.cancel')}</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirm}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={loading ? tr('components.printRange.printingLabel') : tr('common.print')}
                  accessibilityState={{ busy: loading, disabled: loading }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={t.brand.onFill} />
                  ) : (
                    <Icon name="printer-outline" size={iconSize.md} color={t.brand.onFill} />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {loading ? tr('components.printRange.printing') : tr('common.print')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PrintRangeDialog;
