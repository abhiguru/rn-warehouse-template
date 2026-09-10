/**
 * CompoundRackInput - Compound input for rack location with structured format
 *
 * Handles rack input in format: [UserInput]/[Floor]/[Chamber]
 * Example: "20B-20C/F1/C2"
 *
 * Features:
 * - Free text input for rack identifier
 * - Dropdown pickers for Floor and Chamber selection
 * - Parses existing rack values (including legacy formats)
 * - Validates that all three parts are filled when any part is entered
 * - Auto-formats the combined value for storage
 *
 * @example
 * ```tsx
 * <CompoundRackInput
 *   value={currentItem.rack}
 *   onChangeText={(text) => updateFormField('rack', text)}
 *   error={currentItem.errors.rack}
 * />
 * ```
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';

// Floor options for cold storage
const FLOOR_OPTIONS = [
  { label: 'Select Floor', value: '' },
  { label: 'BASE', value: 'BASE' },
  { label: 'F1', value: 'F1' },
  { label: 'F2', value: 'F2' },
  { label: 'F3', value: 'F3' },
  { label: 'F4', value: 'F4' },
];

// Chamber options for cold storage
const CHAMBER_OPTIONS = [
  { label: 'Select Chamber', value: '' },
  { label: 'C4', value: 'C4' },
  { label: 'C7', value: 'C7' },
  { label: 'C2', value: 'C2' },
  { label: 'Anti-Ch', value: 'Anti-Ch' },
];

// Valid floor and chamber values for validation
const VALID_FLOORS = ['BASE', 'F1', 'F2', 'F3', 'F4'];
const VALID_CHAMBERS = ['C4', 'C7', 'C2', 'Anti-Ch'];

interface RackState {
  userInput: string;
  floor: string;
  chamber: string;
  isLegacy: boolean;
}

export interface CompoundRackInputProps {
  /** Formatted rack string from parent (e.g., "20B-20C/F1/C2") */
  value: string;
  /** Callback when rack value changes - emits formatted string or empty */
  onChangeText: (value: string) => void;
  /** Whether the input is editable */
  editable?: boolean;
  /** Custom styles for the container */
  style?: StyleProp<ViewStyle>;
  /** External error message */
  error?: string;
  /** Whether to show inline validation errors (default true) */
  showValidationErrors?: boolean;
  /** Use BottomSheetTextInput for keyboard-aware bottom sheet compatibility */
  useBottomSheetInput?: boolean;
}

/**
 * Parse a rack value string into its component parts.
 * Uses the LAST two slashes to separate floor and chamber,
 * allowing user input to contain slashes.
 *
 * Examples:
 * - "20B-20C/F1/C2" → { userInput: "20B-20C", floor: "F1", chamber: "C2", isLegacy: false }
 * - "20B/20C/F1/C2" → { userInput: "20B/20C", floor: "F1", chamber: "C2", isLegacy: false }
 * - "A1" (legacy) → { userInput: "A1", floor: "", chamber: "", isLegacy: true }
 * - "" → { userInput: "", floor: "", chamber: "", isLegacy: false }
 */
const parseRackValue = (value: string): RackState => {
  if (!value || value.trim() === '') {
    return { userInput: '', floor: '', chamber: '', isLegacy: false };
  }

  const parts = value.split('/');

  // Need at least 3 parts for valid format (userInput/floor/chamber)
  if (parts.length >= 3) {
    const chamber = parts[parts.length - 1];
    const floor = parts[parts.length - 2];
    const userInput = parts.slice(0, parts.length - 2).join('/');

    // Check if floor and chamber are valid options
    if (VALID_FLOORS.includes(floor) && VALID_CHAMBERS.includes(chamber)) {
      return { userInput, floor, chamber, isLegacy: false };
    }
  }

  // Legacy format - entire value is userInput
  return { userInput: value, floor: '', chamber: '', isLegacy: value.trim() !== '' };
};

/**
 * Format rack component parts into a single string.
 * Only returns formatted string if ALL parts are filled.
 * Returns empty string if any part is missing.
 */
const formatRackValue = (userInput: string, floor: string, chamber: string): string => {
  const trimmedInput = userInput.trim();

  // All parts must be present to format
  if (trimmedInput && floor && chamber) {
    return `${trimmedInput}/${floor}/${chamber}`;
  }

  // Return empty if any part is missing
  return '';
};

/**
 * Check if the rack value is complete (all parts filled or all empty)
 */
const isRackComplete = (userInput: string, floor: string, chamber: string): boolean => {
  const hasInput = userInput.trim() !== '';
  const hasFloor = floor !== '';
  const hasChamber = chamber !== '';

  // Either all empty (valid - optional field) or all filled
  if (!hasInput && !hasFloor && !hasChamber) return true;
  return hasInput && hasFloor && hasChamber;
};

/**
 * Check if the rack has any partial data
 */
const hasPartialData = (userInput: string, floor: string, chamber: string): boolean => {
  const hasInput = userInput.trim() !== '';
  const hasFloor = floor !== '';
  const hasChamber = chamber !== '';

  // Has some but not all parts
  const filledCount = [hasInput, hasFloor, hasChamber].filter(Boolean).length;
  return filledCount > 0 && filledCount < 3;
};

export const CompoundRackInput: React.FC<CompoundRackInputProps> = ({
  value,
  onChangeText,
  editable = true,
  style,
  error,
  showValidationErrors = true,
  useBottomSheetInput = false,
}) => {
  // Parse incoming value into component state
  const [state, setState] = useState<RackState>(() => parseRackValue(value));
  const [hasBeenTouched, setHasBeenTouched] = useState(false);

  // Re-parse when value prop changes (e.g., when editing different items)
  useEffect(() => {
    const parsed = parseRackValue(value);
    setState(parsed);
    // Reset touched state when value changes from parent (new item selected)
    if (value !== formatRackValue(state.userInput, state.floor, state.chamber)) {
      setHasBeenTouched(false);
    }
  }, [value]);

  // Emit formatted value to parent
  const emitChange = useCallback((newState: RackState) => {
    const formatted = formatRackValue(newState.userInput, newState.floor, newState.chamber);
    onChangeText(formatted);
  }, [onChangeText]);

  // Handle user input change
  const handleUserInputChange = useCallback((text: string) => {
    setHasBeenTouched(true);
    const newState = { ...state, userInput: text, isLegacy: false };
    setState(newState);
    emitChange(newState);
  }, [state, emitChange]);

  // Handle floor selection
  const handleFloorChange = useCallback((floorValue: string) => {
    setHasBeenTouched(true);
    const newState = { ...state, floor: floorValue, isLegacy: false };
    setState(newState);
    emitChange(newState);
  }, [state, emitChange]);

  // Handle chamber selection
  const handleChamberChange = useCallback((chamberValue: string) => {
    setHasBeenTouched(true);
    const newState = { ...state, chamber: chamberValue, isLegacy: false };
    setState(newState);
    emitChange(newState);
  }, [state, emitChange]);

  // Validation state
  const isComplete = useMemo(
    () => isRackComplete(state.userInput, state.floor, state.chamber),
    [state.userInput, state.floor, state.chamber]
  );

  const isPartial = useMemo(
    () => hasPartialData(state.userInput, state.floor, state.chamber),
    [state.userInput, state.floor, state.chamber]
  );

  // Determine which fields have errors
  const fieldErrors = useMemo(() => {
    if (!hasBeenTouched || isComplete) return { userInput: false, floor: false, chamber: false };

    return {
      userInput: !state.userInput.trim() && (state.floor || state.chamber),
      floor: !state.floor && (state.userInput.trim() || state.chamber),
      chamber: !state.chamber && (state.userInput.trim() || state.floor),
    };
  }, [hasBeenTouched, isComplete, state]);

  // Show validation message
  const showValidation = showValidationErrors && hasBeenTouched && isPartial;

  // Calculate if combined length exceeds max
  const combinedLength = formatRackValue(state.userInput, state.floor, state.chamber).length;
  const exceedsMaxLength = combinedLength > 30;

  return (
    <View style={[styles.container, style]}>
      {/* Label */}
      <Text style={styles.label}>Rack</Text>

      {/* Legacy Format Warning */}
      {state.isLegacy && (
        <View style={styles.warningBanner}>
          <Icon name="alert-circle" size={16} color={theme.colors.semantic.warning} />
          <Text style={styles.warningText}>
            Legacy format - Please select Floor and Chamber
          </Text>
        </View>
      )}

      {/* User Input Field */}
      <View style={styles.inputContainer}>
        {useBottomSheetInput ? (
          <BottomSheetTextInput
            style={[
              styles.textInput,
              !editable && styles.textInputDisabled,
              fieldErrors.userInput && styles.textInputError,
            ]}
            value={state.userInput}
            onChangeText={handleUserInputChange}
            placeholder="e.g., 20B-20C"
            placeholderTextColor={theme.colors.gray[400]}
            editable={editable}
            maxLength={20} // Reserve space for /FLOOR/CHAMBER
          />
        ) : (
          <TextInput
            style={[
              styles.textInput,
              !editable && styles.textInputDisabled,
              fieldErrors.userInput && styles.textInputError,
            ]}
            value={state.userInput}
            onChangeText={handleUserInputChange}
            placeholder="e.g., 20B-20C"
            placeholderTextColor={theme.colors.gray[400]}
            editable={editable}
            maxLength={20} // Reserve space for /FLOOR/CHAMBER
          />
        )}
      </View>

      {/* Floor and Chamber Pickers */}
      <View style={styles.pickersRow}>
        {/* Floor Picker */}
        <View style={[styles.pickerContainer, fieldErrors.floor && styles.pickerContainerError]}>
          <Text style={styles.pickerLabel}>Floor</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={state.floor}
              onValueChange={handleFloorChange}
              style={styles.picker}
              enabled={editable}
              dropdownIconColor={theme.colors.gray[600]}
            >
              {FLOOR_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={option.value === '' ? theme.colors.gray[400] : theme.colors.gray[900]}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Chamber Picker */}
        <View style={[styles.pickerContainer, fieldErrors.chamber && styles.pickerContainerError]}>
          <Text style={styles.pickerLabel}>Chamber</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={state.chamber}
              onValueChange={handleChamberChange}
              style={styles.picker}
              enabled={editable}
              dropdownIconColor={theme.colors.gray[600]}
            >
              {CHAMBER_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={option.value === '' ? theme.colors.gray[400] : theme.colors.gray[900]}
                />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {/* Validation Messages */}
      {showValidation && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle-outline" size={14} color={theme.colors.semantic.error} />
          <Text style={styles.validationText}>
            All rack fields (Input, Floor, Chamber) are required
          </Text>
        </View>
      )}

      {/* Max Length Warning */}
      {exceedsMaxLength && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle-outline" size={14} color={theme.colors.semantic.error} />
          <Text style={styles.validationText}>
            Rack exceeds 30 characters ({combinedLength}/30)
          </Text>
        </View>
      )}

      {/* External Error */}
      {error && !showValidation && !exceedsMaxLength && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle-outline" size={14} color={theme.colors.semantic.error} />
          <Text style={styles.validationText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.gray[700],
    marginBottom: theme.spacing.xs,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.semantic.warningLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  warningText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.yellow[800],
    flex: 1,
  },
  inputContainer: {
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.md : theme.spacing.sm,
    fontSize: theme.fontSize.base,
    color: theme.colors.gray[900],
    minHeight: 48,
  },
  textInputDisabled: {
    backgroundColor: theme.colors.gray[100],
    color: theme.colors.gray[500],
  },
  textInputError: {
    borderColor: theme.colors.semantic.error,
    borderWidth: 2,
  },
  pickersRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  pickerContainer: {
    flex: 1,
  },
  pickerContainerError: {
    borderRadius: theme.borderRadius.md,
  },
  pickerLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.gray[600],
    marginBottom: 4,
  },
  pickerWrapper: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  picker: {
    height: Platform.OS === 'ios' ? 150 : 50,
    width: '100%',
  },
  validationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  validationText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.semantic.error,
    flex: 1,
  },
});

export default CompoundRackInput;
