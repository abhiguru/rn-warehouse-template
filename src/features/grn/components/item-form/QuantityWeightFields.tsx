/**
 * QuantityWeightFields - Qty and Weight input fields
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/QuantityWeightFields
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Keyboard } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

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
        onQtyChange(text);
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

    return (
      <>
        {/* Quantity Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Icon name="counter" size={16} color={theme.colors.primary} />
            <Text style={styles.label}>
              QTY<Text style={styles.required}> *</Text>
            </Text>
            {isQtyLocked && (
              <Icon
                name="lock"
                size={14}
                color={theme.colors.semantic.warning}
                style={styles.lockIcon}
              />
            )}
          </View>
          <TextInput
            ref={qtyInputRef}
            style={[
              styles.input,
              qtyError && styles.inputError,
              isQtyLocked && styles.inputDisabled,
              focusedField === 'qty' && !isQtyLocked && styles.inputFocused,
            ]}
            value={qty}
            onChangeText={handleQtyChange}
            placeholder="0"
            placeholderTextColor={theme.colors.gray[400]}
            keyboardType="numeric"
            returnKeyType="next"
            onSubmitEditing={handleQtySubmit}
            blurOnSubmit={false}
            onFocus={handleQtyFocus}
            onBlur={() => setFocusedField(null)}
            selectTextOnFocus={!isQtyLocked}
            editable={!isQtyLocked}
          />
          {qtyError && <Text style={styles.errorText}>{qtyError}</Text>}
        </View>

        {/* Weight Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Icon name="scale" size={16} color={theme.colors.gray[500]} />
            <Text style={styles.label}>WEIGHT (KG)</Text>
          </View>
          <TextInput
            ref={weightInputRef}
            style={[
              styles.input,
              weightError && styles.inputError,
              focusedField === 'weight' && styles.inputFocused,
            ]}
            value={weight}
            onChangeText={onWeightChange}
            placeholder="0"
            placeholderTextColor={theme.colors.gray[400]}
            keyboardType="numeric"
            returnKeyType="next"
            onSubmitEditing={onWeightSubmit}
            blurOnSubmit={false}
            onFocus={handleWeightFocus}
            onBlur={() => setFocusedField(null)}
            selectTextOnFocus
          />
          {weightError && <Text style={styles.errorText}>{weightError}</Text>}
        </View>
      </>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const FIELD_WIDTH_QTY_WEIGHT = 117;

const styles = StyleSheet.create({
  fieldContainer: {
    width: FIELD_WIDTH_QTY_WEIGHT,
    marginRight: theme.spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.fiori.text.secondary,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  required: {
    color: theme.colors.fiori.semantic.negative,
  },
  lockIcon: {
    marginLeft: 4,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: theme.fontSize.base,
    color: theme.colors.fiori.text.primary,
  },
  inputError: {
    borderColor: theme.colors.fiori.semantic.negative,
    borderWidth: 2,
  },
  inputFocused: {
    borderColor: '#0057D2',
    borderWidth: 2,
  },
  inputDisabled: {
    backgroundColor: '#F2F2F7',
    borderColor: theme.colors.fiori.objectCell.divider,
    color: theme.colors.fiori.text.secondary,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.fiori.semantic.negative,
    marginTop: 4,
    lineHeight: 18,
  },
});

export default QuantityWeightFields;
