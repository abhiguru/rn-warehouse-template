import { useCapability } from '@/hooks/useCapability';
/**
 * PrintRangeDialog - Reusable dialog for selecting print range
 *
 * SAP Fiori dialog (docs/STYLE_GUIDE.md §13.9): surface.sheet, radius.card,
 * shadow[4] over overlay.scrim; Cancel secondary, Print primary.
 *
 * Pre-populates both start and end fields with the selected item number
 * User can override to print a range or just click OK to print single item
 *
 * Keyboard (same structure as ConfirmInputDialog): the Modal draws behind both
 * system bars, `KeyboardAvoidingView` pads by the keyboard on both platforms
 * with an offset of minus the bottom inset (the overlay pads for the insets
 * itself), the header stays on top, the body with both fields scrolls, and the
 * actions row sits below it, outside the scroll, so Print stays reachable
 * while the keyboard is open.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from './DialogFrame';
import type { DocumentEntity } from '@/i18n/entities';

interface PrintRangeDialogProps {
  visible: boolean;
  onDismiss: () => void;
  /**
   * The dialog has finished closing (iOS: the Modal's `onDismiss`). Another Modal may be opened from here; on iOS one
   * opened in the same render as this one closes is dropped. The Modal stays mounted for this: it is hidden by
   * `visible`, not removed.
   */
  onDismissed?: () => void;
  /**
   * Prints the range. A text it resolves with (WH-151: the invoices of the range the form did not print, with the reason) is
   * shown in the dialog, which then stays open until it is closed; nothing is printed again.
   */
  onConfirm: (startNumber: string, endNumber: string) => Promise<void | string>;
  title: string;
  defaultNumber: string;
  /** The range's end when it is not the start (WH-151: a pair of documents is prefilled as first to second). */
  defaultEndNumber?: string;
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
  root: { flex: 1 },
  content: { gap: space.lg, alignSelf: 'stretch' as const },
  helpText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    alignSelf: 'stretch' as const,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  rangeSection: {
    alignSelf: 'stretch' as const,
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
  noteContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.button,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: t.status.informative.border,
    backgroundColor: t.status.informative.background,
  },
  noteText: {
    ...typography.footnote,
    flex: 1,
    color: t.text.primary,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  jobsRow: { alignSelf: 'flex-start' as const },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

export const PrintRangeDialog: React.FC<PrintRangeDialogProps> = ({
  visible,
  onDismiss,
  onDismissed,
  onConfirm,
  title,
  defaultNumber,
  defaultEndNumber,
  entity,
  label = '',
  placeholder = '',
  onViewJobs,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  // The facility's own capability, not the demo default.
  const printingAvailable = useCapability('printing');

  const [startNumber, setStartNumber] = useState(defaultNumber);
  const [endNumber, setEndNumber] = useState(defaultEndNumber ?? defaultNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [focused, setFocused] = useState<'start' | 'end' | null>(null);
  // A print job is on its way. Set before the first await: two presses before the next render (a double tap, or
  // Return and then the button) would both find `loading` still false and send two jobs to the printer (J3).
  const sending = useRef(false);

  useEffect(() => {
    if (visible) {
      if (__DEV__)
        console.log(
          '[PrintRangeDialog] Dialog opened with defaultNumber:',
          defaultNumber
        );
      setStartNumber(defaultNumber);
      setEndNumber(defaultEndNumber ?? defaultNumber);
      setError(null);
      setNote(null);
      setLoading(false);
    }
  }, [visible, defaultNumber, defaultEndNumber]);

  // While a print is being sent the dialog stays open (backdrop, X and Android back are ignored), so its failure is seen.
  const dismissUnlessSending = () => {
    if (sending.current) return;
    onDismiss();
  };

  const handleConfirm = async () => {
    if (sending.current) return;
    setError(null);

    if (!startNumber.trim() || !endNumber.trim()) {
      setError(tr('components.printRange.enterBoth'));
      return;
    }

    sending.current = true;
    setLoading(true);

    try {
      const printedNote = await onConfirm(startNumber.trim(), endNumber.trim());
      if (typeof printedNote === 'string' && printedNote !== '') {
        setNote(printedNote);
      } else {
        onDismiss();
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : tr('components.printRange.printFailed')
      );
    } finally {
      sending.current = false;
      setLoading(false);
    }
  };

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
  if (!printingAvailable)
    return (
      <ConfirmDialog
        visible={visible}
        title={tr('components.printRange.unavailableTitle')}
        message={tr('components.printRange.unavailableMessage')}
        icon="printer-outline"
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={onDismiss}
        onCancel={onDismiss}
        onDismissed={onDismissed}
      />
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismissUnlessSending}
      onDismiss={onDismissed}
    >
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
        <DialogOverlay safeArea onScrimPress={dismissUnlessSending}>
          <DialogCard>
            {/* Content: scrolls when the keyboard leaves little room */}
            <DialogBody keyboardShouldPersistTaps="handled">
              <DialogHeading title={title} message={texts.chooseRange} icon="printer-outline" />
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

              {/* What was not printed (WH-151) */}
              {note && (
                <View style={styles.noteContainer} accessibilityRole="alert" testID="print-range-note">
                  <Icon name="information" size={iconSize.md} color={t.status.informative.text} />
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              )}

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

              {onViewJobs && (
                <View style={styles.jobsRow}>
                  <Button
                    type="tertiary"
                    leftIcon="format-list-bulleted"
                    onPress={onViewJobs}
                    disabled={loading}
                    accessibilityLabel={tr('components.printRange.viewJobs')}
                  >
                    {tr('components.printJobs.title')}
                  </Button>
                </View>
              )}
            </DialogBody>

            {/* Actions */}
            <DialogActions>
              <DialogButton
                label={tr(note !== null ? 'common.close' : 'common.cancel')}
                onPress={dismissUnlessSending}
                disabled={loading}
              />
              <DialogButton
                label={tr('common.print')}
                busyLabel={tr('components.printRange.printing')}
                accessibilityLabel={loading ? tr('components.printRange.printingLabel') : tr('common.print')}
                icon="printer-outline"
                role="primary"
                onPress={handleConfirm}
                busy={loading}
                disabled={note !== null}
              />
            </DialogActions>
          </DialogCard>
        </DialogOverlay>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PrintRangeDialog;
