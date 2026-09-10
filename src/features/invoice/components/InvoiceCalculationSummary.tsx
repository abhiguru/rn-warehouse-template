import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Platform, TouchableOpacity } from 'react-native';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { InvoiceHeaderData } from '@/types/invoice.types';
import { formatCurrency } from '@/utils/formatters';
import { KeyValueCell, InlineValidation } from '@/components/fiori';

interface InvoiceCalculationSummaryProps {
  header: InvoiceHeaderData;
  onDiscountChange: (value: number) => void;
}

export const InvoiceCalculationSummary: React.FC<InvoiceCalculationSummaryProps> = ({
  header,
  onDiscountChange,
}) => {
  const { colors: themeColors, isDarkMode } = useTheme();
  const [discountError, setDiscountError] = useState<string | null>(null);
  // Local state for the input text to preserve decimal point while typing
  const [discountText, setDiscountText] = useState<string>(
    header.discount !== 0 ? header.discount.toString() : ''
  );
  // Collapsible discount calculator state
  const [isCalculatorExpanded, setIsCalculatorExpanded] = useState(false);
  const [finalAmountText, setFinalAmountText] = useState<string>('');

  // Dialog state for dark mode compliance
  const [errorDialog, setErrorDialog] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: '',
    message: '',
  });

  // Sync local text when header.discount changes externally
  useEffect(() => {
    // Only update if the numeric values are different (avoid overwriting during typing)
    const currentValue = parseFloat(discountText) || 0;
    if (currentValue !== header.discount) {
      setDiscountText(header.discount !== 0 ? header.discount.toString() : '');
    }
  }, [header.discount]);

  const handleDiscountChange = (text: string) => {
    // Always update local text state to preserve typing (including trailing dots and minus)
    setDiscountText(text);

    const value = parseFloat(text);

    // Calculate subtotal first to determine max discount
    const subtotal = header.total + header.discount - header.labour - header.tax_amount;
    const maxDiscount = subtotal + header.labour + header.tax_amount;

    if (text === '') {
      setDiscountError(null);
      onDiscountChange(0);
    } else if (text === '-' || text === '-.') {
      // Allow typing minus sign - don't update parent yet, wait for full number
      setDiscountError(null);
    } else if (isNaN(value)) {
      // Allow partial input like "235." or "-235." - don't show error, just don't update parent
      if (!text.endsWith('.') && text !== '-') {
        setDiscountError('Invalid discount value');
      }
    } else if (value > maxDiscount) {
      setDiscountError(`Discount cannot exceed ${formatCurrency(maxDiscount, { maximumFractionDigits: 2 })}`);
      setErrorDialog({
        visible: true,
        title: 'Invalid Discount',
        message: `Discount cannot exceed the total invoice amount (${formatCurrency(maxDiscount, { maximumFractionDigits: 2 })})`,
      });
    } else {
      // Valid number (positive or negative)
      setDiscountError(null);
      onDiscountChange(value);
    }
  };

  // Calculate subtotal (storage charges only)
  const subtotal = header.total + header.discount - header.labour - header.tax_amount;

  // Round total up/down by setting absolute discount value
  // Formula: total = (subtotal + labour + tax) - discount
  // base = subtotal + labour + tax (before any discount)
  // To achieve rounded total: discount = base - roundedTotal
  const base = subtotal + header.labour + header.tax_amount;

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
    const finalAmount = parseFloat(finalAmountText);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      setErrorDialog({
        visible: true,
        title: 'Invalid Amount',
        message: 'Please enter a valid positive amount',
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

  // Dynamic colors for dark mode
  const cardBg = isDarkMode ? themeColors.gray[100] : themeColors.white;
  const borderColor = isDarkMode ? themeColors.gray[300] : themeColors.gray[200];
  const textPrimary = themeColors.gray[900];
  const textSecondary = themeColors.gray[500];
  const inputBg = isDarkMode ? themeColors.gray[200] : themeColors.white;
  const totalBg = isDarkMode ? themeColors.green[100] : themeColors.green[50];
  const infoBg = isDarkMode ? themeColors.gray[200] : themeColors.gray[100];
  const infoIconColor = themeColors.gray[500];

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
      <Text style={[styles.title, { color: textPrimary }]}>Invoice Summary</Text>

      {/* Fiori: Key Value cells for summary */}
      <View style={[styles.keyValueContainer, { backgroundColor: cardBg, borderColor }]}>
        <KeyValueCell
          keyLabel="Subtotal (Storage)"
          value={formatCurrency(subtotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          showDivider
        />
        <KeyValueCell
          keyLabel="Labour Charges"
          value={formatCurrency(header.labour, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          showDivider
        />
        <KeyValueCell
          keyLabel="Tax Amount"
          value={formatCurrency(header.tax_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          showDivider
        />

        {/* Discount (Editable) with Round Up/Down buttons */}
        <View style={[styles.discountRow, { backgroundColor: cardBg }]}>
          <View style={styles.discountLabelContainer}>
            <Text style={[styles.discountLabel, { color: textSecondary }]}>Discount</Text>
            {/* Round Up/Down buttons */}
            <View style={styles.roundButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.roundButton,
                  { backgroundColor: themeColors.blue[50], borderColor: themeColors.blue[200] },
                ]}
                onPress={handleRoundDown}
                activeOpacity={0.7}
              >
                <Icon name="arrow-down" size={14} color={themeColors.blue[600]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roundButton,
                  { backgroundColor: themeColors.green[50], borderColor: themeColors.green[200] },
                ]}
                onPress={handleRoundUp}
                activeOpacity={0.7}
              >
                <Icon name="arrow-up" size={14} color={themeColors.green[600]} />
              </TouchableOpacity>
            </View>
          </View>
          <View
            style={[
              styles.discountInputContainer,
              { backgroundColor: inputBg, borderColor },
              discountError && styles.discountInputError,
            ]}
          >
            <Text style={[styles.currencySymbol, { color: textSecondary }]}>₹</Text>
            <TextInput
              style={[styles.discountInput, { color: textPrimary }]}
              value={discountText}
              onChangeText={handleDiscountChange}
              placeholder="0.00"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              placeholderTextColor={textSecondary}
            />
          </View>
        </View>
        {/* Fiori Inline Validation for discount error */}
        <View style={styles.validationContainer}>
          <InlineValidation
            message={discountError || ''}
            variant="error"
            visible={!!discountError}
          />
        </View>

        {/* Collapsible Discount Calculator */}
        <TouchableOpacity
          style={[
            styles.calculatorHeader,
            { borderTopColor: themeColors.gray[200] },
          ]}
          onPress={() => setIsCalculatorExpanded(!isCalculatorExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.calculatorHeaderContent}>
            <Icon name="calculator" size={16} color={themeColors.primary} />
            <Text style={[styles.calculatorHeaderText, { color: themeColors.primary }]}>
              Calculate from Final Amount
            </Text>
          </View>
          <Icon
            name={isCalculatorExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={themeColors.gray[500]}
          />
        </TouchableOpacity>

        {isCalculatorExpanded && (
          <View style={[styles.calculatorContent, { backgroundColor: themeColors.gray[50] }]}>
            <Text style={[styles.calculatorLabel, { color: textSecondary }]}>
              Enter the final amount you want:
            </Text>
            <View style={styles.calculatorInputRow}>
              <View
                style={[
                  styles.calculatorInputContainer,
                  { backgroundColor: inputBg, borderColor },
                ]}
              >
                <Text style={[styles.currencySymbol, { color: textSecondary }]}>₹</Text>
                <TextInput
                  style={[styles.calculatorInput, { color: textPrimary }]}
                  value={finalAmountText}
                  onChangeText={handleFinalAmountChange}
                  placeholder={Math.round(base).toString()}
                  keyboardType="numeric"
                  placeholderTextColor={themeColors.gray[400]}
                />
              </View>
              <TouchableOpacity
                style={[styles.applyButton, { backgroundColor: themeColors.primary }]}
                onPress={applyFinalAmount}
                activeOpacity={0.8}
              >
                <Icon name="check" size={18} color={themeColors.white} />
                <Text style={[styles.applyButtonText, { color: themeColors.white }]}>Apply</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.calculatorHint, { color: themeColors.gray[400] }]}>
              Current base: {formatCurrency(base, { minimumFractionDigits: 2 })}
            </Text>
          </View>
        )}
      </View>

      {/* Grand Total - Fiori emphasized */}
      <View style={[styles.totalRow, { backgroundColor: totalBg }]}>
        <KeyValueCell
          keyLabel="Grand Total"
          value={formatCurrency(header.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          emphasized
        />
      </View>

      {/* Breakdown Info - Fiori info card */}
      <View style={[styles.breakdownContainer, { backgroundColor: infoBg }]}>
        <View style={styles.breakdownHeader}>
          <Icon name="information-outline" size={16} color={infoIconColor} />
          <Text style={[styles.breakdownTitle, { color: infoIconColor }]}>Calculation Breakdown</Text>
        </View>
        <Text style={[styles.breakdownText, { color: textSecondary }]}>
          {formatCurrency(subtotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Storage) + {formatCurrency(header.labour, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Labour) + {formatCurrency(header.tax_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tax) - {formatCurrency(header.discount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Discount) = {formatCurrency(header.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      </View>

      {/* Error Dialog */}
      <ConfirmDialog
        visible={errorDialog.visible}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorDialog({ visible: false, title: '', message: '' })}
        onCancel={() => setErrorDialog({ visible: false, title: '', message: '' })}
        variant="warning"
        icon="alert-circle"
      />
    </View>
  );
};

// SAP Fiori Form Cell Styles
// Colors applied dynamically for dark mode support
const styles = StyleSheet.create({
  container: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    ...theme.shadows.sm,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.md,
  },
  keyValueContainer: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 44,
  },
  discountLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountLabel: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  roundButtonsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  roundButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  currencySymbol: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    marginRight: 4,
  },
  discountInput: {
    width: 80,
    paddingVertical: 6,
    fontSize: theme.fontSize.base,
    textAlign: 'right',
  },
  discountInputError: {
    borderColor: theme.colors.fiori.semantic.negative,
    borderWidth: 2,
    backgroundColor: theme.colors.fiori.semantic.negativeLight,
  },
  validationContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  totalRow: {
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  breakdownContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  breakdownText: {
    fontSize: 13,
    lineHeight: 20,
  },
  // Calculator styles
  calculatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  calculatorHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calculatorHeaderText: {
    fontSize: 13,
    fontWeight: '500',
  },
  calculatorContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  calculatorLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  calculatorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calculatorInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  calculatorInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: theme.fontSize.base,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 40,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  calculatorHint: {
    fontSize: 11,
    marginTop: 8,
  },
});
