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
} from '@/utils/invoiceCalculations';
import { InlineValidation } from '@/components/fiori';
import { localizeDigits, normalizeDigits, t as tr } from '@/i18n';

interface InvoiceCalculationSummaryProps {
  header: InvoiceHeaderData;
  items: InvoiceItemData[];
  onDiscountChange: (value: number) => void;
  /** Shown whenever there is a discount; omit to hide the reason field. */
  onDiscountReasonChange?: (reason: string) => void;
  /** The current user must give a reason before saving (staff changing the discount). */
  reasonRequired?: boolean;
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
  onDiscountReasonChange,
  reasonRequired = false,
}) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [discountError, setDiscountError] = useState<string | null>(null);
  // Local state for the input text to preserve decimal point while typing
  const [discountText, setDiscountText] = useState<string>(
    header.discount !== 0 ? header.discount.toString() : ''
  );
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
    // Only update if the numeric values are different (avoid overwriting during typing)
    const currentValue = parseFloat(normalizeDigits(discountText)) || 0;
    if (currentValue !== header.discount) {
      setDiscountText(header.discount !== 0 ? header.discount.toString() : '');
    }
  }, [header.discount]);

  const handleDiscountChange = (typed: string) => {
    // Digits typed as ૦-૯ are read as 0-9.
    const text = normalizeDigits(typed);
    // Always update local text state to preserve typing (including trailing dots and minus)
    setDiscountText(text);

    const value = parseFloat(text);

    // Calculate subtotal first to determine max discount
    const maxDiscount = base;

    if (text === '') {
      setDiscountError(null);
      onDiscountChange(0);
    } else if (text === '-' || text === '-.') {
      // Allow typing minus sign - don't update parent yet, wait for full number
      setDiscountError(null);
    } else if (isNaN(value)) {
      // Allow partial input like "235." or "-235." - don't show error, just don't update parent
      if (!text.endsWith('.') && text !== '-') {
        setDiscountError(tr('invoice.summary.discountNotNumber'));
      }
    } else if (value > maxDiscount) {
      setDiscountError(tr('invoice.summary.discountTooLarge', { amount: formatInvoiceAmount(maxDiscount) }));
      setErrorDialog({
        visible: true,
        title: tr('invoice.summary.discountTooLargeTitle'),
        message: tr('invoice.summary.discountTooLargeMessage', { amount: formatInvoiceAmount(maxDiscount) }),
      });
    } else {
      // Valid number (positive or negative)
      setDiscountError(null);
      onDiscountChange(value);
    }
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

  // A negative discount is a surcharge: it adds to the total.
  const discountPart =
    header.discount < 0
      ? tr('invoice.summary.formulaSurcharge', { amount: formatInvoiceAmount(-header.discount) })
      : tr('invoice.summary.formulaDiscount', { amount: formatInvoiceDeduction(header.discount) });

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
            value={discountText}
            onChangeText={handleDiscountChange}
            placeholder={localizeDigits('0.00')}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            placeholderTextColor={t.text.placeholder}
          />
        </View>
      </View>
      <View style={styles.validationContainer}>
        <InlineValidation message={discountError || ''} variant="error" visible={!!discountError} />
      </View>

      {/* Reason for the discount: recorded with the invoice, required from staff */}
      {onDiscountReasonChange && header.discount !== 0 && (
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
                value={finalAmountText}
                onChangeText={handleFinalAmountChange}
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
        accessibilityLabel={`${tr('invoice.summary.grandTotal')}, ${formatInvoiceAmount(header.total)}`}
      >
        <Text style={styles.totalLabel}>{tr('invoice.summary.grandTotal')}</Text>
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
