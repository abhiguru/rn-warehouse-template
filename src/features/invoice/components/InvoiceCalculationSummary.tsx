import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Platform, Pressable, StyleSheet } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { localizeDigits, normalizeDigits, t as tr, numericInput } from '@/i18n';
import { amountText, parseDiscountInput } from '@/features/invoice/utils/amountInput';

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
}

/** Visual size of the round up/down buttons; hitSlop pads them to the touch target. */
const ROUND_BUTTON_SIZE = 36;
const ROUND_BUTTON_SLOP = Math.ceil((touchTarget - ROUND_BUTTON_SIZE) / 2);

const tabular = { fontVariant: ['tabular-nums' as const] };

const makeStyles = (t: ThemeTokens) => ({
  container: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 44,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
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
  discountText: {
    color: t.status.positive.text,
  },
  discountRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    paddingVertical: space.sm,
  },
  discountLabelContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
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
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: 44,
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
    width: 96,
    paddingVertical: space.s6,
    textAlign: 'right' as const,
  },
  validationContainer: {
    paddingBottom: space.sm,
  },
  reasonContainer: {
    paddingBottom: space.md,
    gap: space.xs,
  },
  fieldLabel: {
    ...typography.footnote,
    color: t.text.secondary,
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
    minHeight: 44,
  },
  calculatorHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  calculatorHeaderPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  calculatorHeaderContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
  },
  calculatorHeaderText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  calculatorContent: {
    backgroundColor: t.background.base,
    borderRadius: radius.button,
    padding: space.md,
    marginTop: space.sm,
  },
  calculatorLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  calculatorInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  calculatorField: {
    flex: 1,
  },
  calculatorInput: {
    ...typography.body,
    ...tabular,
    color: t.text.primary,
    flex: 1,
    paddingVertical: space.sm,
  },
  applyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    minHeight: touchTarget,
    backgroundColor: t.brand.fill,
  },
  applyButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  applyButtonText: {
    ...typography.callout,
    color: t.brand.onFill,
  },
  calculatorHint: {
    ...typography.caption1,
    ...tabular,
    color: t.text.secondary,
    marginTop: space.sm,
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 44,
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
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
  note: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.sm,
  },
  breakdownContainer: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.button,
    backgroundColor: t.background.base,
  },
  breakdownHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.s6,
    marginBottom: space.sm,
  },
  breakdownTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
  },
  breakdownText: {
    ...typography.footnote,
    ...tabular,
    color: t.text.secondary,
  },
});

type Styles = ReturnType<typeof makeStyles>;

/** One read-only key-value row: label left, amount right-aligned with tabular figures. */
function SummaryRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: Styles;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [discountError, setDiscountErrorState] = useState<string | null>(null);
  const setDiscountError = (error: string | null) => {
    setDiscountErrorState(error);
    onDiscountErrorChange?.(error);
  };
  // The typed text is kept while the field is edited, so a decimal point or a minus sign survives.
  const [discountText, setDiscountText] = useState<string>(amountText(header.discount));
  // Collapsible discount calculator state
  const [isCalculatorExpanded, setIsCalculatorExpanded] = useState(false);
  const [finalAmountText, setFinalAmountText] = useState<string>('');

  // Themed dialog instead of the system alert
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  // Sync local text when header.discount changes externally
  useEffect(() => {
    // Only update if the numeric values are different (avoid overwriting during typing).
    // Text that was not accepted stays until it is corrected or the field is left.
    if (discountError) return;
    const currentValue = parseFloat(discountText) || 0;
    if (currentValue !== header.discount) {
      setDiscountText(amountText(header.discount));
    }
  }, [header.discount]);

  const handleDiscountChange = (typed: string) => {
    // Digits typed as ૦-૯ are read as 0-9. The maximum is the amount before discount.
    const parsed = parseDiscountInput(typed, base, formatInvoiceAmount);
    setDiscountText(parsed.text);
    setDiscountError(parsed.error);
    // Only a complete number inside the limit reaches the invoice. "1,500" or
    // a discount above the invoice amount leaves the previous discount in place.
    if (parsed.value !== null) onDiscountChange(parsed.value);
  };

  // Leaving the field with text that was not accepted: show the discount the invoice really has.
  const handleDiscountBlur = () => {
    if (!discountError && parseDiscountInput(discountText, base, formatInvoiceAmount).value !== null) return;
    setDiscountText(amountText(header.discount));
    setDiscountError(null);
  };

  const { subtotal, base, rounding } = calculateInvoiceBreakdown(items, header);

  // These controls continue to set an absolute discount from the pre-discount
  // base. The whole-rupee save adjustment is displayed separately below.

  const handleRoundUp = () => {
    // Round the base (pre-discount total) up to nearest integer
    const roundedTotal = Math.ceil(base);
    const newDiscount = Math.round((base - roundedTotal) * 100) / 100;
    setDiscountText(newDiscount !== 0 ? newDiscount.toString() : '');
    setDiscountError(null);
    onDiscountChange(newDiscount);
  };

  const handleRoundDown = () => {
    // Round the base (pre-discount total) down to nearest integer
    const roundedTotal = Math.floor(base);
    const newDiscount = Math.round((base - roundedTotal) * 100) / 100;
    setDiscountText(newDiscount !== 0 ? newDiscount.toString() : '');
    setDiscountError(null);
    onDiscountChange(newDiscount);
  };

  // Handle final amount input and calculate discount
  const handleFinalAmountChange = (text: string) => {
    setFinalAmountText(text);
  };

  const applyFinalAmount = () => {
    const finalAmount = parseFloat(normalizeDigits(finalAmountText));
    if (isNaN(finalAmount) || finalAmount <= 0) {
      setErrorDialog({
        visible: true,
        title: tr('invoice.summary.amountNotValidTitle'),
        message: tr('invoice.summary.amountNotValidMessage'),
      });
      return;
    }

    // Calculate discount: base - finalAmount
    // If finalAmount < base, discount is positive (reduces total)
    // If finalAmount > base, discount is negative (increases total - surcharge)
    const newDiscount = Math.round((base - finalAmount) * 100) / 100;
    setDiscountText(newDiscount !== 0 ? newDiscount.toString() : '');
    setDiscountError(null);
    onDiscountChange(newDiscount);

    // Collapse the calculator after applying
    setIsCalculatorExpanded(false);
    setFinalAmountText('');
  };

  const closeDialog = () => setErrorDialog({ visible: false, title: '', message: '' });

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

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">{tr('invoice.label.invoiceSummary')}</Text>

      <SummaryRow styles={styles} label={tr('invoice.summary.subtotalStorage')} value={formatInvoiceAmount(subtotal)} />
      <SummaryRow styles={styles} label={tr('invoice.summary.labourCharges')} value={formatInvoiceAmount(header.labour)} />
      <SummaryRow styles={styles} label={tr('invoice.label.tax')} value={formatInvoiceAmount(header.tax_amount)} />

      {/* Discount (editable) with round down / round up buttons */}
      <View style={styles.discountRow}>
        <View style={styles.discountLabelContainer}>
          <Text style={styles.rowLabel}>{tr('invoice.label.discount')}</Text>
          <View style={styles.roundButtonsContainer}>
            <Pressable
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
              onPress={handleRoundDown}
              hitSlop={ROUND_BUTTON_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.summary.roundDownA11y')}
            >
              <Icon name="arrow-down" size={iconSize.sm} color={t.brand.tint} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}
              onPress={handleRoundUp}
              hitSlop={ROUND_BUTTON_SLOP}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.summary.roundUpA11y')}
            >
              <Icon name="arrow-up" size={iconSize.sm} color={t.brand.tint} />
            </Pressable>
          </View>
        </View>
        <View style={[styles.field, discountError ? styles.fieldError : null]}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.discountInput}
            accessibilityLabel={tr('invoice.summary.discountA11y')}
            value={localizeDigits(discountText)}
            onChangeText={handleDiscountChange}
            onBlur={handleDiscountBlur}
            placeholder={localizeDigits('0.00')}
            // Android's number keyboard has the minus sign a surcharge needs; the iOS number pads do not.
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            placeholderTextColor={t.text.placeholder}
          />
        </View>
      </View>
      <View style={styles.validationContainer}>
        <InlineValidation message={discountError || ''} variant="error" visible={!!discountError} />
      </View>

      {/* Reason for the discount: recorded with the invoice, required from staff */}
      {onDiscountReasonChange && (header.discount !== 0 || discountChanged) && (
        <View style={styles.reasonContainer}>
          <Text style={styles.fieldLabel}>
            {reasonRequired ? tr('invoice.summary.discountReasonRequired') : tr('invoice.label.discountReason')}
          </Text>
          <TextInput
            style={[styles.reasonInput, reasonRequired && styles.fieldError]}
            accessibilityLabel={tr('invoice.label.discountReason')}
            value={header.discount_reason || ''}
            onChangeText={onDiscountReasonChange}
            placeholder={tr('invoice.summary.discountReasonPlaceholder')}
            placeholderTextColor={t.text.placeholder}
            maxLength={500}
            multiline
          />
        </View>
      )}

      {/* Reason for a line with a charge of 0: recorded with the invoice, required from staff */}
      {onZeroChargeReasonChange && hasZeroChargeLine(items) && (
        <View style={styles.reasonContainer}>
          <Text style={styles.fieldLabel}>
            {zeroChargeReasonRequired ? tr('invoice.summary.zeroChargeReasonRequired') : tr('invoice.label.zeroChargeReason')}
          </Text>
          <TextInput
            style={[styles.reasonInput, zeroChargeReasonRequired && styles.fieldError]}
            accessibilityLabel={tr('invoice.label.zeroChargeReason')}
            value={header.zero_charge_reason || ''}
            onChangeText={onZeroChargeReasonChange}
            placeholder={tr('invoice.summary.zeroChargeReasonPlaceholder')}
            placeholderTextColor={t.text.placeholder}
            maxLength={500}
            multiline
          />
        </View>
      )}

      <SummaryRow styles={styles} label={tr('invoice.summary.roundingAdjustment')} value={formatInvoiceAmount(rounding)} />

      {/* Collapsible discount calculator */}
      <Pressable
        style={({ pressed }) => [styles.calculatorHeader, pressed && styles.calculatorHeaderPressed]}
        onPress={() => setIsCalculatorExpanded(!isCalculatorExpanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isCalculatorExpanded }}
        accessibilityLabel={tr('invoice.summary.calculatorA11y')}
      >
        <View style={styles.calculatorHeaderContent}>
          <Icon name="calculator" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.calculatorHeaderText}>{tr('invoice.summary.calculatorTitle')}</Text>
        </View>
        <Icon
          name={isCalculatorExpanded ? 'chevron-up' : 'chevron-down'}
          size={iconSize.md}
          color={t.icon.secondary}
        />
      </Pressable>

      {isCalculatorExpanded && (
        <View style={styles.calculatorContent}>
          <Text style={styles.calculatorLabel}>{tr('invoice.summary.calculatorHelp')}</Text>
          <View style={styles.calculatorInputRow}>
            <View style={[styles.field, styles.calculatorField]}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.calculatorInput}
                accessibilityLabel={tr('invoice.summary.finalAmountA11y')}
                {...numericInput(finalAmountText, handleFinalAmountChange)}
                placeholder={localizeDigits(Math.round(base).toString())}
                keyboardType="numeric"
                placeholderTextColor={t.text.placeholder}
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}
              onPress={applyFinalAmount}
              accessibilityRole="button"
              accessibilityLabel={tr('invoice.summary.applyFinalAmountA11y')}
            >
              <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.applyButtonText}>{tr('common.apply')}</Text>
            </Pressable>
          </View>
          <Text style={styles.calculatorHint}>{tr('invoice.summary.currentBase', { amount: formatInvoiceAmount(base) })}</Text>
        </View>
      )}

      {/* Grand total */}
      <View
        style={styles.totalRow}
        accessible
        accessibilityLabel={`${tr('invoice.summary.estimatedTotal')}, ${formatInvoiceAmount(header.total)}`}
      >
        {/* An estimate: the server works out the stored total when the invoice is saved. */}
        <Text style={styles.totalLabel}>{tr('invoice.summary.estimatedTotal')}</Text>
        <Text style={styles.totalValue}>{formatInvoiceAmount(header.total)}</Text>
      </View>

      <Text style={styles.note}>
        {tr('invoice.summary.roundingNote')}
      </Text>

      {/* How the total is made up */}
      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownHeader}>
          <Icon name="information-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.breakdownTitle}>{tr('invoice.summary.howCalculated')}</Text>
        </View>
        <Text style={styles.breakdownText}>
          {tr('invoice.summary.formulaStart', {
            storage: formatInvoiceAmount(subtotal),
            labour: formatInvoiceAmount(header.labour),
            tax: formatInvoiceAmount(header.tax_amount),
          })}{' '}
          <Text style={header.discount > 0 ? styles.discountText : undefined}>{discountPart}</Text>{' '}
          {tr('invoice.summary.formulaEnd', { rounding: formatInvoiceAmount(rounding), total: formatInvoiceAmount(header.total) })}
        </Text>
      </View>

      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText={tr('common.close')}
        cancelText=""
        onConfirm={closeDialog}
        onCancel={closeDialog}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
};
