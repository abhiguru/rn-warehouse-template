import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Platform, Pressable, StyleSheet, AccessibilityInfo, findNodeHandle } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ConfirmInputDialog } from '@/components/ConfirmInputDialog';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import {
  calculateInvoiceBreakdown,
  formatInvoiceAmount,
  formatInvoiceDeduction,
  hasZeroChargeLine,
  roundMoney,
} from '@/utils/invoiceCalculations';
import { InlineValidation } from '@/components/fiori';
import { localizeDigits, normalizeDigits, t as tr } from '@/i18n';
import { clampDiscount, parseDiscountInput, parseFinalAmountInput } from '@/features/invoice/utils/amountInput';
import { useTableLayout } from '@/components/common/DetailTable';

interface InvoiceCalculationSummaryProps {
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
  onDiscountChange: (value: number) => void;
  /**
   * Told the message while the discount field holds text that was not accepted
   * (and null once it does not), so the step can hold "Save": the invoice keeps
   * its previous discount while the field shows something else.
   */
  onDiscountErrorChange?: (error: string | null) => void;
  /** Shown whenever there is a discount; omit to hide the reason field. */
  onDiscountReasonChange?: (reason: string) => void;
  /** The current user must give a reason before saving (staff changing the discount). */
  reasonRequired?: boolean;
  /** Shown whenever a line has a charge of 0; omit to hide the reason field. */
  onZeroChargeReasonChange?: (reason: string) => void;
  /** The current user must give a reason for the zero charge before saving (staff). */
  zeroChargeReasonRequired?: boolean;
  /** A save was refused: a reason that is still needed is drawn red. Before that it is only asked for. */
  showErrors?: boolean;
  /**
   * Raised by the step each time a refused save has been explained: focus moves to the first field that needs fixing
   * (the discount field when its text was refused, then the reasons) and is announced (§11.3).
   */
  focusRequest?: number;
}

/** Visual size of the round up/down buttons; hitSlop pads them to the touch target. */
const ROUND_BUTTON_SIZE = 36;
const ROUND_BUTTON_SLOP = Math.ceil((touchTarget - ROUND_BUTTON_SIZE) / 2);

const tabular = { fontVariant: ['tabular-nums' as const] };

/** The text of a discount field: the amount with two decimals ("12.00"), empty for 0 (the placeholder shows the zero). */
export const discountFieldText = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0 ? roundMoney(value).toFixed(2) : '';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    gap: space.xs,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget - space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  // From font scale 1.5 the label sits over its value (§11.4, §14.3), as in INVOICE DETAILS.
  rowStacked: {
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
    gap: space.xxs,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  rowLabel: {
    ...typography.subhead,
    color: t.text.secondary,
    flexShrink: 1,
  },
  rowValue: {
    ...typography.body,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },
  valueStacked: { textAlign: 'left' as const, alignSelf: 'stretch' as const },
  discountBlock: {
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    gap: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  discountHeader: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
  },
  roundButtonsContainer: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  roundButton: {
    width: ROUND_BUTTON_SIZE,
    height: ROUND_BUTTON_SIZE,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  roundButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  currencySymbol: {
    ...typography.body,
    color: t.text.secondary,
    marginRight: space.xs,
  },
  discountInput: {
    ...typography.body,
    ...tabular,
    color: t.text.primary,
    flex: 1,
    minHeight: touchTarget - 2,
    paddingVertical: space.s6,
    textAlign: 'right' as const,
  },
  validationContainer: {
    paddingBottom: space.xs,
  },
  reasonContainer: {
    paddingHorizontal: space.sm,
    paddingBottom: space.md,
    gap: space.xs,
  },
  fieldLabel: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  fieldLabelError: {
    color: t.status.negative.text,
  },
  reasonInput: {
    ...typography.body,
    color: t.text.primary,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget,
  },
  tertiary: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
  },
  tertiaryPressed: {
    backgroundColor: t.brand.subtle,
  },
  tertiaryText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    marginTop: space.xs,
    paddingTop: space.md,
    paddingHorizontal: space.sm,
    borderTopWidth: 1,
    borderTopColor: t.table.separator,
  },
  totalRowStacked: {
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
    gap: space.xxs,
    paddingBottom: space.sm,
  },
  totalLabel: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  totalValue: {
    ...typography.headline,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },
});

type Styles = ReturnType<typeof makeStyles>;

/** One read-only key-value row: label left, amount right-aligned with tabular figures. */
function SummaryRow({
  label,
  value,
  styles,
  first = false,
  testID,
  stacked = false,
}: {
  label: string;
  value: string;
  styles: Styles;
  first?: boolean;
  testID?: string;
  stacked?: boolean;
}) {
  return (
    <View style={[styles.row, stacked && styles.rowStacked, !first && styles.rowDivider]} accessible accessibilityLabel={`${label}, ${value}`} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, stacked && styles.valueStacked]}>{value}</Text>
    </View>
  );
}

export const InvoiceCalculationSummary: React.FC<InvoiceCalculationSummaryProps> = ({
  header,
  items,
  onDiscountChange,
  onDiscountErrorChange,
  onDiscountReasonChange,
  reasonRequired = false,
  onZeroChargeReasonChange,
  zeroChargeReasonRequired = false,
  showErrors = false,
  focusRequest = 0,
}) => {
  const styles = useThemedStyles(makeStyles);
  const { stacked } = useTableLayout();
  const t = useTokens();
  const [discountError, setDiscountErrorState] = useState<string | null>(null);
  const setDiscountError = (error: string | null) => {
    setDiscountErrorState(error);
    onDiscountErrorChange?.(error);
  };
  // The typed text is kept while the field is edited, so a decimal point or a minus sign survives.
  const [discountText, setDiscountText] = useState<string>(discountFieldText(header.discount));
  // The discount the invoice had when the field was entered: while the text is refused or unfinished, the
  // invoice (and so the total) keeps it, never a prefix of what was typed.
  const enteredDiscount = useRef(header.discount);
  const editing = useRef(false);
  const discountRef = useRef<TextInput>(null);
  const discountReasonRef = useRef<TextInput>(null);
  const zeroReasonRef = useRef<TextInput>(null);
  const [finalAmountOpen, setFinalAmountOpen] = useState(false);
  const [finalAmountText, setFinalAmountText] = useState<string>('');
  const [finalAmountError, setFinalAmountError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  // Sync local text when header.discount changes externally
  useEffect(() => {
    // Only update if the numeric values are different (avoid overwriting during typing).
    // Text that was not accepted stays until it is corrected or the field is left.
    // While the field is being edited its text is the person's own: "-" and "." are not numbers yet, and the
    // invoice holds another value meanwhile, which must not be written over what is typed.
    if (discountError || editing.current) return;
    const currentValue = parseFloat(discountText) || 0;
    if (currentValue !== header.discount) {
      setDiscountText(discountFieldText(header.discount));
    }
  }, [header.discount]);

  // A refused save moved here: focus the first field that needs fixing and say so to a screen reader.
  const handledFocusRequest = useRef(focusRequest);
  useEffect(() => {
    if (focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    const target = discountError
      ? discountRef.current
      : reasonRequired
        ? discountReasonRef.current
        : zeroChargeReasonRequired
          ? zeroReasonRef.current
          : null;
    if (!target) return;
    target.focus?.();
    const node = findNodeHandle(target);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [focusRequest]);

  const { subtotal, base, rounding } = calculateInvoiceBreakdown(items, header);

  const handleDiscountFocus = () => {
    editing.current = true;
    enteredDiscount.current = header.discount;
  };

  const handleDiscountChange = (typed: string) => {
    // A field that gets text without a focus event (a paste by a service) is entered by its first change.
    if (!editing.current) handleDiscountFocus();
    // Digits typed as ૦-૯ are read as 0-9. The maximum is the amount before discount.
    const parsed = parseDiscountInput(typed, base, formatInvoiceAmount);
    setDiscountText(parsed.text);
    setDiscountError(parsed.error);
    // Only a complete number inside the limit reaches the invoice. Text that is refused ("1,500", a discount above
    // the invoice amount) or unfinished ("-", ".") puts back the discount the field had when it was entered.
    const value = parsed.value ?? enteredDiscount.current;
    if (value !== header.discount) onDiscountChange(value);
  };

  // Leaving the field: the text becomes the discount the invoice really has, with two decimals.
  const handleDiscountBlur = () => {
    editing.current = false;
    const parsed = parseDiscountInput(discountText, base, formatInvoiceAmount);
    const shown = parsed.value !== null && !discountError ? parsed.value : header.discount;
    setDiscountText(discountFieldText(shown));
    setDiscountError(null);
  };

  const setDiscount = (value: number) => {
    editing.current = false;
    setDiscountText(discountFieldText(value));
    setDiscountError(null);
    onDiscountChange(value);
  };

  // Rounding works on the total as it stands, after the typed discount, and keeps that discount: only its paise
  // change. With no discount typed, the discount becomes the paise of the amount.
  const handleRoundUp = () => setDiscount(clampDiscount(roundMoney(base - Math.ceil(roundMoney(base - header.discount))), base));
  const handleRoundDown = () => setDiscount(clampDiscount(roundMoney(base - Math.floor(roundMoney(base - header.discount))), base));

  const closeFinalAmount = () => {
    setFinalAmountOpen(false);
    setFinalAmountText('');
    setFinalAmountError(null);
  };

  const applyFinalAmount = () => {
    // "1,500" or "12abc" is refused with a message, never read as 1 or 12; so is an amount whose discount the save would refuse.
    const parsed = parseFinalAmountInput(finalAmountText, base, formatInvoiceAmount);
    if (parsed.value === null) {
      setFinalAmountError(parsed.error);
      return;
    }
    // The discount is the amount before discount less the final amount; a final amount above it is a surcharge.
    setDiscount(roundMoney(base - parsed.value));
    closeFinalAmount();
  };

  // Removing a saved discount is a change that needs a reason too, so the
  // reason field stays when the discount of an invoice being edited is set to 0.
  const discountChanged = roundMoney(header.discount || 0) !== roundMoney(header.saved_discount || 0);

  // A negative discount is a surcharge: it adds to the total.
  const discountPart =
    header.discount < 0
      ? tr('invoice.summary.formulaSurcharge', { amount: formatInvoiceAmount(-header.discount) })
      : tr('invoice.summary.formulaDiscount', {
          // The minus is the operator of the formula, so a zero discount keeps it too.
          amount: header.discount === 0 ? `−${formatInvoiceAmount(0)}` : formatInvoiceDeduction(header.discount),
        });
  const formula = [
    tr('invoice.summary.formulaStart', {
      storage: formatInvoiceAmount(subtotal),
      labour: formatInvoiceAmount(header.labour),
      tax: formatInvoiceAmount(header.tax_amount),
    }),
    discountPart,
    tr('invoice.summary.formulaEnd', { rounding: formatInvoiceAmount(rounding), total: formatInvoiceAmount(header.total) }),
  ].join(' ');

  const discountReasonRed = showErrors && reasonRequired;
  const zeroReasonRed = showErrors && zeroChargeReasonRequired;

  return (
    <View style={styles.container} testID="invoice-summary">
      <SummaryRow styles={styles} stacked={stacked} first label={tr('invoice.summary.subtotalStorage')} value={formatInvoiceAmount(subtotal)} />
      <SummaryRow styles={styles} stacked={stacked} label={tr('invoice.summary.labourCharges')} value={formatInvoiceAmount(header.labour)} />
      <SummaryRow styles={styles} stacked={stacked} label={tr('invoice.label.tax')} value={formatInvoiceAmount(header.tax_amount)} />

      {/* Discount: the label with the round down / round up buttons, the field under it at full width */}
      <View style={styles.discountBlock}>
        <View style={styles.discountHeader}>
          <Text style={styles.rowLabel}>{tr('invoice.label.discount')}</Text>
          <View style={styles.roundButtonsContainer}>
            <Pressable
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
              onPress={handleRoundDown}
              hitSlop={ROUND_BUTTON_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.summary.roundDownA11y')}
              testID="invoice-summary-round-down"
            >
              <Icon name="arrow-down" size={iconSize.sm} color={t.brand.tint} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
              onPress={handleRoundUp}
              hitSlop={ROUND_BUTTON_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.summary.roundUpA11y')}
              testID="invoice-summary-round-up"
            >
              <Icon name="arrow-up" size={iconSize.sm} color={t.brand.tint} />
            </Pressable>
          </View>
        </View>
        <View style={[styles.field, discountError ? styles.fieldError : null]}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            ref={discountRef}
            style={styles.discountInput}
            accessibilityLabel={tr('invoice.summary.discountA11y')}
            value={localizeDigits(discountText)}
            onChangeText={handleDiscountChange}
            onFocus={handleDiscountFocus}
            onBlur={handleDiscountBlur}
            selectTextOnFocus
            placeholder={localizeDigits('0.00')}
            // Android's number keyboard has the minus sign a surcharge needs; the iOS number pads do not.
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            placeholderTextColor={t.text.placeholder}
            testID="invoice-summary-discount"
          />
        </View>
        <View style={styles.validationContainer}>
          <InlineValidation message={discountError || ''} variant="error" visible={!!discountError} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.tertiary, pressed && styles.tertiaryPressed]}
          onPress={() => setFinalAmountOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tr('invoice.summary.calculatorA11y')}
          testID="invoice-summary-final-amount"
        >
          <Icon name="calculator" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.tertiaryText}>{tr('invoice.summary.calculatorTitle')}</Text>
        </Pressable>
      </View>

      {/* Reason for the discount: recorded with the invoice, required from staff */}
      {onDiscountReasonChange && (header.discount !== 0 || discountChanged) && (
        <View style={styles.reasonContainer}>
          <Text style={[styles.fieldLabel, discountReasonRed && styles.fieldLabelError]}>
            {reasonRequired ? tr('invoice.summary.discountReasonRequired') : tr('invoice.label.discountReason')}
          </Text>
          <TextInput
            ref={discountReasonRef}
            style={[styles.reasonInput, discountReasonRed && styles.fieldError]}
            accessibilityLabel={tr('invoice.label.discountReason')}
            value={header.discount_reason || ''}
            onChangeText={onDiscountReasonChange}
            placeholder={tr('invoice.summary.discountReasonPlaceholder')}
            placeholderTextColor={t.text.placeholder}
            maxLength={500}
            multiline
            testID="invoice-summary-discount-reason"
          />
          <InlineValidation message={tr('invoice.summary.reasonMissing')} variant="error" visible={discountReasonRed} />
        </View>
      )}

      {/* Reason for a line with a charge of 0: recorded with the invoice, required from staff */}
      {onZeroChargeReasonChange && hasZeroChargeLine(items) && (
        <View style={styles.reasonContainer}>
          <Text style={[styles.fieldLabel, zeroReasonRed && styles.fieldLabelError]}>
            {zeroChargeReasonRequired ? tr('invoice.summary.zeroChargeReasonRequired') : tr('invoice.label.zeroChargeReason')}
          </Text>
          <TextInput
            ref={zeroReasonRef}
            style={[styles.reasonInput, zeroReasonRed && styles.fieldError]}
            accessibilityLabel={tr('invoice.label.zeroChargeReason')}
            value={header.zero_charge_reason || ''}
            onChangeText={onZeroChargeReasonChange}
            placeholder={tr('invoice.summary.zeroChargeReasonPlaceholder')}
            placeholderTextColor={t.text.placeholder}
            maxLength={500}
            multiline
            testID="invoice-summary-zero-reason"
          />
          <InlineValidation message={tr('invoice.summary.reasonMissing')} variant="error" visible={zeroReasonRed} />
        </View>
      )}

      <SummaryRow styles={styles} stacked={stacked} label={tr('invoice.summary.roundingAdjustment')} value={formatInvoiceAmount(rounding)} testID="invoice-summary-rounding" />

      {/* The one total. An estimate: the server works out the stored total when the invoice is saved. */}
      <View
        style={[styles.totalRow, stacked && styles.totalRowStacked]}
        accessible
        accessibilityLabel={`${tr('invoice.summary.estimatedTotal')}, ${formatInvoiceAmount(header.total)}`}
        testID="invoice-summary-total"
      >
        <Text style={styles.totalLabel}>{tr('invoice.summary.estimatedTotal')}</Text>
        <Text style={[styles.totalValue, stacked && styles.valueStacked]}>{formatInvoiceAmount(header.total)}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.tertiary, pressed && styles.tertiaryPressed]}
        onPress={() => setHowOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('invoice.summary.howCalculated')}
        testID="invoice-summary-how"
      >
        <Icon name="information-outline" size={iconSize.md} color={t.brand.tint} />
        <Text style={styles.tertiaryText}>{tr('invoice.summary.howCalculated')}</Text>
      </Pressable>

      <ConfirmInputDialog
        visible={finalAmountOpen}
        title={tr('invoice.summary.calculatorTitle')}
        message={`${tr('invoice.summary.calculatorHelp')}\n${tr('invoice.summary.currentBase', { amount: formatInvoiceAmount(base) })}`}
        confirmText={tr('common.apply')}
        cancelText={tr('common.cancel')}
        onConfirm={applyFinalAmount}
        onCancel={closeFinalAmount}
        icon="calculator"
        testID="invoice-summary-final-dialog"
        field={{
          value: localizeDigits(finalAmountText),
          onChangeText: (text) => {
            setFinalAmountText(normalizeDigits(text));
            setFinalAmountError(null);
          },
          placeholder: localizeDigits(Math.round(base).toString()),
          accessibilityLabel: tr('invoice.summary.finalAmountA11y'),
          keyboardType: 'numeric',
          error: finalAmountError,
        }}
      />

      <ConfirmDialog
        visible={howOpen}
        title={tr('invoice.summary.howCalculated')}
        message={`${formula}\n\n${tr('invoice.summary.roundingNote')}`}
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={() => setHowOpen(false)}
        onCancel={() => setHowOpen(false)}
        variant="default"
        icon="information-outline"
        testID="invoice-summary-how-dialog"
      />
    </View>
  );
};
