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
  Platform,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

/** Above this system font scale the floor and chamber pickers stack vertically. */
const STACK_FONT_SCALE = 1.3;

// Floor options for cold storage
const FLOOR_OPTIONS = [
  { label: 'Select floor', value: '' },
  { label: 'BASE', value: 'BASE' },
  { label: 'F1', value: 'F1' },
  { label: 'F2', value: 'F2' },
  { label: 'F3', value: 'F3' },
  { label: 'F4', value: 'F4' },
];

// Chamber options for cold storage
const CHAMBER_OPTIONS = [
  { label: 'Select chamber', value: '' },
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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  const stackPickers = fontScale > STACK_FONT_SCALE;

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

      {/* Legacy format warning (critical message strip) */}
      {state.isLegacy && (
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Icon name="alert" size={iconSize.sm} color={t.status.critical.text} />
          <Text style={styles.warningText}>
            This rack uses an old format. Select a floor and chamber.
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
            placeholderTextColor={t.text.placeholder}
            editable={editable}
            accessibilityLabel="Rack"
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
            placeholderTextColor={t.text.placeholder}
            editable={editable}
            accessibilityLabel="Rack"
            maxLength={20} // Reserve space for /FLOOR/CHAMBER
          />
        )}
      </View>

      {/* Floor and Chamber Pickers */}
      <View style={[styles.pickersRow, stackPickers && styles.pickersStacked]}>
        {/* Floor Picker */}
        <View style={[styles.pickerContainer, fieldErrors.floor && styles.pickerContainerError]}>
          <Text style={styles.pickerLabel}>Floor</Text>
          <View style={[styles.pickerWrapper, fieldErrors.floor && styles.pickerWrapperError]}>
            <Picker
              selectedValue={state.floor}
              onValueChange={handleFloorChange}
              style={styles.picker}
              enabled={editable}
              dropdownIconColor={t.icon.secondary}
              accessibilityLabel="Floor"
            >
              {FLOOR_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={option.value === '' ? t.text.placeholder : t.text.primary}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Chamber Picker */}
        <View style={[styles.pickerContainer, fieldErrors.chamber && styles.pickerContainerError]}>
          <Text style={styles.pickerLabel}>Chamber</Text>
          <View style={[styles.pickerWrapper, fieldErrors.chamber && styles.pickerWrapperError]}>
            <Picker
              selectedValue={state.chamber}
              onValueChange={handleChamberChange}
              style={styles.picker}
              enabled={editable}
              dropdownIconColor={t.icon.secondary}
              accessibilityLabel="Chamber"
            >
              {CHAMBER_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={option.value === '' ? t.text.placeholder : t.text.primary}
                />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {/* Validation Messages */}
      {showValidation && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.validationText}>
            Enter a rack, floor and chamber.
          </Text>
        </View>
      )}

      {/* Max Length Warning */}
      {exceedsMaxLength && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.validationText}>
            Use 30 characters or fewer for the full rack ({combinedLength}/30).
          </Text>
        </View>
      )}

      {/* External Error */}
      {error && !showValidation && !exceedsMaxLength && (
        <View style={styles.validationContainer}>
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.validationText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    marginBottom: space.lg,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  warningBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.critical.background,
    borderWidth: 1,
    borderColor: t.status.critical.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.button,
    marginBottom: space.sm,
    gap: space.xs,
  },
  warningText: {
    ...typography.footnote,
    color: t.status.critical.text,
    flex: 1,
  },
  inputContainer: {
    marginBottom: space.sm,
  },
  textInput: {
    ...typography.body,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? space.md : space.sm,
    color: t.text.primary,
    minHeight: touchTarget,
  },
  textInputDisabled: {
    backgroundColor: t.surface.fieldReadOnly,
    borderWidth: 0,
    color: t.text.primary,
  },
  textInputError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
  },
  pickersRow: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  pickersStacked: {
    flexDirection: 'column' as const,
  },
  pickerContainer: {
    flex: 1,
  },
  pickerContainerError: {
    borderRadius: radius.field,
  },
  pickerLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  pickerWrapper: {
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    overflow: 'hidden' as const,
  },
  pickerWrapperError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  picker: {
    height: Platform.OS === 'ios' ? 150 : 50,
    width: '100%' as const,
    color: t.text.primary,
  },
  validationContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: space.xs,
    gap: space.xs,
  },
  validationText: {
    ...typography.footnote,
    color: t.status.negative.text,
    flex: 1,
  },
});

export default CompoundRackInput;
