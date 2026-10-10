/**
 * QuantityWeightFields - Qty and Weight input fields
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 * Numeric keypad, tabular numbers and the weight unit as a suffix
 * (docs/STYLE_GUIDE.md 13.3).
 *
 * @module features/grn/components/item-form/QuantityWeightFields
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, Keyboard, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatNumber } from '@/utils/formatters';
import { normalizeDigits, t as tr } from '@/i18n';

// ============================================================================
// TYPES
// ============================================================================

export interface QuantityWeightFieldsRef {
  focusQty: () => void;
  focusWeight: () => void;
}

export interface QuantityWeightFieldsProps {
  qty: string;
  weight: string;
  onQtyChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  qtyError?: string;
  weightError?: string;
  isQtyLocked?: boolean;
  onQtyLockedPress?: () => void;
  onQtyFocus?: () => void;
  onWeightFocus?: () => void;
  onWeightSubmit?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const QuantityWeightFields = forwardRef<QuantityWeightFieldsRef, QuantityWeightFieldsProps>(
  function QuantityWeightFieldsInner(
    {
      qty,
      weight,
      onQtyChange,
      onWeightChange,
      qtyError,
      weightError,
      isQtyLocked = false,
      onQtyLockedPress,
      onQtyFocus,
      onWeightFocus,
      onWeightSubmit,
    },
    ref
  ) {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const qtyInputRef = useRef<TextInput>(null);
    const weightInputRef = useRef<TextInput>(null);
    const [focusedField, setFocusedField] = useState<'qty' | 'weight' | null>(null);

    // Expose focus methods to parent
    useImperativeHandle(ref, () => ({
      focusQty: () => qtyInputRef.current?.focus(),
      focusWeight: () => weightInputRef.current?.focus(),
    }));

    const handleQtyChange = useCallback(
      (text: string) => {
        if (isQtyLocked) {
          onQtyLockedPress?.();
          return;
        }
        onQtyChange(normalizeDigits(text));
      },
      [isQtyLocked, onQtyLockedPress, onQtyChange]
    );

    const handleQtyFocus = useCallback(() => {
      if (isQtyLocked) {
        onQtyLockedPress?.();
        Keyboard.dismiss();
        return;
      }
      setFocusedField('qty');
      onQtyFocus?.();
    }, [isQtyLocked, onQtyLockedPress, onQtyFocus]);

    const handleWeightFocus = useCallback(() => {
      setFocusedField('weight');
      onWeightFocus?.();
    }, [onWeightFocus]);

    const handleQtySubmit = useCallback(() => {
      weightInputRef.current?.focus();
    }, []);

    const renderError = (message?: string) =>
      message ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.errorText}>{message}</Text>
        </View>
      ) : null;

    return (
      <>
        {/* Quantity Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>
              {tr('grn.item.quantity')}<Text style={styles.required}> *</Text>
            </Text>
            {isQtyLocked && (
              <Icon
                name="lock-outline"
                size={iconSize.sm}
                color={t.icon.secondary}
                accessibilityLabel={tr('grn.item.quantityLocked')}
              />
            )}
          </View>
          <TextInput
            ref={qtyInputRef}
            accessibilityLabel={tr('grn.item.quantityInputLabel')}
            accessibilityHint={isQtyLocked ? tr('grn.item.quantityLockedHint') : undefined}
            style={[
              styles.input,
              !!qtyError && styles.inputError,
              isQtyLocked && styles.inputReadOnly,
              focusedField === 'qty' && !isQtyLocked && styles.inputFocused,
            ]}
            value={qty}
            onChangeText={handleQtyChange}
            placeholder={formatNumber(0)}
            placeholderTextColor={t.text.placeholder}
            keyboardType="numeric"
            returnKeyType="next"
            onSubmitEditing={handleQtySubmit}
            blurOnSubmit={false}
            onFocus={handleQtyFocus}
            onBlur={() => setFocusedField(null)}
            selectTextOnFocus={!isQtyLocked}
            editable={!isQtyLocked}
          />
          {renderError(qtyError)}
        </View>

        {/* Weight Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{tr('common.weight')}</Text>
          </View>
          <View
            style={[
              styles.input,
              styles.suffixField,
              !!weightError && styles.inputError,
              focusedField === 'weight' && styles.inputFocused,
            ]}
          >
            <TextInput
              ref={weightInputRef}
              accessibilityLabel={tr('grn.item.weightInputLabel')}
              style={styles.suffixInput}
              value={weight}
              onChangeText={(text) => onWeightChange(normalizeDigits(text))}
              placeholder={formatNumber(0)}
              placeholderTextColor={t.text.placeholder}
              keyboardType="numeric"
              returnKeyType="next"
              onSubmitEditing={onWeightSubmit}
              blurOnSubmit={false}
              onFocus={handleWeightFocus}
              onBlur={() => setFocusedField(null)}
              selectTextOnFocus
            />
            <Text style={styles.suffix} importantForAccessibility="no">
              {tr('grn.item.weightUnit')}
            </Text>
          </View>
          {renderError(weightError)}
        </View>
      </>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const FIELD_WIDTH_QTY_WEIGHT = 117;

const androidText = Platform.select({
  android: { textAlignVertical: 'center' as const, includeFontPadding: false },
  default: {},
});

const makeStyles = (t: ThemeTokens) => ({
  fieldContainer: {
    width: FIELD_WIDTH_QTY_WEIGHT,
    marginRight: space.md,
  },
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: space.xs,
    gap: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  required: {
    color: t.text.required,
  },
  input: {
    ...typography.body,
    fontVariant: ['tabular-nums' as const],
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: 44,
    color: t.text.primary,
    ...androidText,
  },
  inputError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  inputFocused: {
    borderColor: t.border.fieldFocus,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  inputReadOnly: {
    backgroundColor: t.surface.fieldReadOnly,
    borderWidth: 0,
    paddingHorizontal: space.md + 1,
  },
  suffixField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  suffixInput: {
    ...typography.body,
    fontVariant: ['tabular-nums' as const],
    flex: 1,
    minHeight: 40,
    padding: 0,
    color: t.text.primary,
    ...androidText,
  },
  suffix: {
    ...typography.body,
    color: t.text.secondary,
    marginLeft: space.xs,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: {
    ...typography.footnote,
    color: t.status.negative.text,
    flexShrink: 1,
  },
});

export default QuantityWeightFields;
