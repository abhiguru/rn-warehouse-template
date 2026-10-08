/**
 * RackChamberPicker - Rack input with floor/chamber chip selectors
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/RackChamberPicker
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

// Floor and Chamber options
export const FLOOR_OPTIONS = ['BASE', 'F1', 'F2', 'F3', 'F4'];
export const CHAMBER_OPTIONS = ['C4', 'C7', 'C2', 'Anti-Ch'];

// Parse rack value to extract user input, floor, and chamber
export const parseRackValue = (rack: string): { userInput: string; floor: string; chamber: string } => {
  if (!rack || rack.trim() === '') {
    return { userInput: '', floor: '', chamber: '' };
  }
  const parts = rack.split('/');

  // Check for full format: userInput/floor/chamber (at least 3 parts)
  if (parts.length >= 3) {
    const chamber = parts[parts.length - 1];
    const floor = parts[parts.length - 2];
    const userInput = parts.slice(0, parts.length - 2).join('/');
    if (FLOOR_OPTIONS.includes(floor) && CHAMBER_OPTIONS.includes(chamber)) {
      return { userInput, floor, chamber };
    }
  }

  // Check for floor/chamber only format (exactly 2 parts: floor/chamber)
  if (parts.length === 2) {
    const firstPart = parts[0];
    const secondPart = parts[1];

    // Check if it's floor/chamber format (no userInput)
    if (FLOOR_OPTIONS.includes(firstPart) && CHAMBER_OPTIONS.includes(secondPart)) {
      return { userInput: '', floor: firstPart, chamber: secondPart };
    }

    // Check if last part is just floor (userInput/floor)
    if (FLOOR_OPTIONS.includes(secondPart)) {
      return { userInput: firstPart, floor: secondPart, chamber: '' };
    }

    // Check if last part is just chamber (userInput/chamber)
    if (CHAMBER_OPTIONS.includes(secondPart)) {
      return { userInput: firstPart, floor: '', chamber: secondPart };
    }
  }

  // No floor/chamber detected - entire value is userInput
  return { userInput: rack, floor: '', chamber: '' };
};

// Build rack value from parts
export const buildRackValue = (userInput: string, floor: string, chamber: string): string => {
  const trimmedInput = userInput.trim();

  // Full format with all three parts (rack text + floor + chamber)
  if (trimmedInput && floor && chamber) {
    return `${trimmedInput}/${floor}/${chamber}`;
  }
  // Floor and chamber only (no rack text) - minimum valid combination
  if (floor && chamber) {
    return `${floor}/${chamber}`;
  }
  // Return just the rack text if provided (floor/chamber not complete yet)
  return trimmedInput;
};

// ============================================================================
// TYPES
// ============================================================================

export interface RackChamberPickerRef {
  focus: () => void;
}

export interface RackChamberPickerProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const RackChamberPicker = forwardRef<RackChamberPickerRef, RackChamberPickerProps>(
  function RackChamberPickerInner({ value, onChange, error, onSubmitEditing, onFocus, onBlur }, ref) {
    const inputRef = useRef<TextInput>(null);
    const [selectedFloor, setSelectedFloor] = useState<string>('');
    const [selectedChamber, setSelectedChamber] = useState<string>('');
    const [isFocused, setIsFocused] = useState(false);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Parse rack value on mount/change to extract floor/chamber
    useEffect(() => {
      const parsed = parseRackValue(value);
      if (parsed.floor && parsed.floor !== selectedFloor) {
        setSelectedFloor(parsed.floor);
      }
      if (parsed.chamber && parsed.chamber !== selectedChamber) {
        setSelectedChamber(parsed.chamber);
      }
    }, [value]);

    // Get just the rack text part (without floor/chamber)
    const rackTextOnly = useMemo(() => {
      const parsed = parseRackValue(value);
      return parsed.userInput;
    }, [value]);

    const fullRackValue = useMemo(
      () => buildRackValue(rackTextOnly, selectedFloor, selectedChamber),
      [rackTextOnly, selectedFloor, selectedChamber]
    );

    // Handle rack text input change (only the rack number part)
    const handleRackTextChange = useCallback(
      (text: string) => {
        const combined = buildRackValue(text, selectedFloor, selectedChamber);
        onChange(combined || text);
      },
      [selectedFloor, selectedChamber, onChange]
    );

    // Handle floor chip selection (radio-style)
    const handleFloorSelect = useCallback(
      (floor: string) => {
        setSelectedFloor(floor);
        const combined = buildRackValue(rackTextOnly, floor, selectedChamber);
        onChange(combined || rackTextOnly);
        Vibration.vibrate(5);
      },
      [rackTextOnly, selectedChamber, onChange]
    );

    // Handle chamber chip selection (radio-style)
    const handleChamberSelect = useCallback(
      (chamber: string) => {
        setSelectedChamber(chamber);
        const combined = buildRackValue(rackTextOnly, selectedFloor, chamber);
        onChange(combined || rackTextOnly);
        Vibration.vibrate(5);
      },
      [rackTextOnly, selectedFloor, onChange]
    );

    const handleFocus = useCallback(() => {
      setIsFocused(true);
      onFocus?.();
    }, [onFocus]);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      onBlur?.();
    }, [onBlur]);

    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Icon name="warehouse" size={16} color={theme.colors.gray[500]} />
          <Text style={styles.label}>RACK</Text>
          {fullRackValue && <Text style={styles.rackPreviewInline}>({fullRackValue})</Text>}
        </View>

        <TextInput
          ref={inputRef}
          style={[styles.input, error && styles.inputError, isFocused && styles.inputFocused]}
          value={rackTextOnly}
          onChangeText={handleRackTextChange}
          placeholder="e.g., 20B-20C"
          placeholderTextColor={theme.colors.gray[400]}
          returnKeyType="next"
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCapitalize="characters"
        />

        {/* Floor Chips */}
        <View style={styles.chipSection}>
          <Text style={styles.chipLabel}>FLOOR</Text>
          <View style={styles.chipWrap}>
            {FLOOR_OPTIONS.map((floor) => (
              <TouchableOpacity
                key={floor}
                style={[styles.chip, selectedFloor === floor && styles.chipSelected]}
                onPress={() => handleFloorSelect(floor)}
                activeOpacity={0.7}
              >
                {selectedFloor === floor && (
                  <Icon name="check" size={12} color={theme.colors.white} style={styles.chipCheckmark} />
                )}
                <Text style={[styles.chipText, selectedFloor === floor && styles.chipTextSelected]}>
                  {floor}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chamber Chips */}
        <View style={styles.chipSection}>
          <Text style={styles.chipLabel}>CHAMBER</Text>
          <View style={styles.chipWrap}>
            {CHAMBER_OPTIONS.map((chamber) => (
              <TouchableOpacity
                key={chamber}
                style={[styles.chip, selectedChamber === chamber && styles.chipSelected]}
                onPress={() => handleChamberSelect(chamber)}
                activeOpacity={0.7}
              >
                {selectedChamber === chamber && (
                  <Icon name="check" size={12} color={theme.colors.white} style={styles.chipCheckmark} />
                )}
                <Text style={[styles.chipText, selectedChamber === chamber && styles.chipTextSelected]}>
                  {chamber}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {},
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
  rackPreviewInline: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
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
  chipSection: {
    marginTop: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.fiori.text.secondary,
    letterSpacing: 0.5,
    marginBottom: 4,
    lineHeight: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    minWidth: 44,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipCheckmark: {
    marginRight: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.fiori.text.secondary,
  },
  chipTextSelected: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.fiori.semantic.negative,
    marginTop: 4,
    lineHeight: 18,
  },
});

export default RackChamberPicker;
