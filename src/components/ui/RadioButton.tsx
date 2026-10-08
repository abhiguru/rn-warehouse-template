import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  Pressable,
  Platform,
  Vibration,
  LayoutAnimation,
} from 'react-native';
import theme, { Colors } from '@/theme';
import { useTheme } from '@/hooks/useTheme';

// ============================================================================
// FIORI DESIGN TOKENS - Segmented Control / Button Group
// ============================================================================

const FIORI_DIMENSIONS = {
  // Cell Heights
  cellHeightSingleLine: 44,
  cellHeightStacked: 72,

  // Typography
  labelFontSize: 13,
  labelFontWeight: '400' as const,
  buttonFontSize: 14,
  buttonFontWeight: '500' as const,

  // Button/Segment Dimensions
  buttonHeight: 32,
  buttonMinWidth: 64,
  buttonHorizontalPadding: 12,
  buttonSpacing: 8,
  labelControlGap: 12,

  // Border Radius
  segmentedBorderRadius: 8,
  buttonBorderRadius: 8,

  // Touch Targets
  minTouchTarget: 44,

  // Opacity
  buttonDisabledBorderOpacity: 0.5,
  buttonDisabledTextOpacity: 0.5,
} as const;

/**
 * Generate theme-aware FIORI colors for RadioButton/SegmentedControl
 */
function getFioriColors(colors: Colors, isDarkMode: boolean) {
  return {
    // Label
    labelText: colors.fiori.text.primary,

    // Buttons (Single/Multi Selection)
    buttonUnselectedBg: 'transparent',
    buttonUnselectedBorder: colors.gray[200],
    buttonUnselectedText: colors.fiori.text.primary,
    buttonSelectedBg: colors.primary,
    buttonSelectedText: isDarkMode ? colors.gray[900] : '#FFFFFF',
    buttonPressedUnselectedBg: colors.gray[100],
    buttonPressedUnselectedBorder: colors.gray[300],
    buttonPressedSelectedBg: colors.orange[600],

    // Segmented Control
    segmentContainerBg: colors.gray[100],
    segmentContainerBorder: colors.gray[200],
    segmentUnselectedBg: 'transparent',
    segmentUnselectedText: colors.fiori.text.primary,
    segmentSelectedBg: colors.fiori.objectCell.background,
    segmentSelectedText: colors.primary,
    segmentPressedBg: colors.gray[200],

    // Traditional Radio
    radioUnselectedBorder: colors.gray[300],
    radioSelectedBorder: colors.primary,
    radioDotColor: colors.primary,
  };
}

// Platform-specific shadow for selected segment
const SEGMENT_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  android: {
    elevation: 2,
  },
}) as ViewStyle;

// ============================================================================
// SEGMENTED CONTROL - iOS Style (Single Selection, Mutually Exclusive)
// ============================================================================

export interface SegmentedControlOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  /** Form cell label */
  label?: string;
  /** Currently selected value */
  value: string;
  /** Callback when selection changes */
  onValueChange: (value: string) => void;
  /** Available options */
  options: SegmentedControlOption[];
  /** Use stacked layout (label above control) */
  stacked?: boolean;
  /** Disable all segments */
  disabled?: boolean;
  /** Enable haptic feedback on selection */
  hapticFeedback?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  label,
  value,
  onValueChange,
  options,
  stacked = false,
  disabled = false,
  hapticFeedback = true,
  style,
}) => {
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors, isDarkMode);

  const handlePress = useCallback(
    (optionValue: string, optionDisabled?: boolean) => {
      if (disabled || optionDisabled || value === optionValue) return;

      if (hapticFeedback) {
        Vibration.vibrate(10);
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onValueChange(optionValue);
    },
    [disabled, value, hapticFeedback, onValueChange]
  );

  return (
    <View
      style={[
        styles.segmentedContainer,
        stacked && styles.segmentedContainerStacked,
        style,
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {label && (
        <Text
          style={[
            styles.label,
            { color: FIORI.labelText },
            stacked && styles.labelStacked,
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
      <View
        style={[
          styles.segmentedControlWrapper,
          { backgroundColor: FIORI.segmentContainerBg, borderColor: FIORI.segmentContainerBorder },
          disabled && styles.segmentedControlWrapperDisabled,
        ]}
      >
        {options.map((option, index) => {
          const isSelected = value === option.value;
          const isPressed = pressedIndex === index;
          const isOptionDisabled = disabled || option.disabled;

          return (
            <Pressable
              key={option.value}
              style={[
                styles.segment,
                { backgroundColor: FIORI.segmentUnselectedBg },
                isSelected && [styles.segmentSelected, { backgroundColor: FIORI.segmentSelectedBg }],
                isPressed && !isSelected && { backgroundColor: FIORI.segmentPressedBg },
                index === 0 && styles.segmentFirst,
                index === options.length - 1 && styles.segmentLast,
                isOptionDisabled && styles.segmentDisabled,
              ]}
              onPress={() => handlePress(option.value, option.disabled)}
              onPressIn={() => setPressedIndex(index)}
              onPressOut={() => setPressedIndex(null)}
              disabled={isOptionDisabled}
              accessibilityRole="radio"
              accessibilityState={{
                selected: isSelected,
                disabled: isOptionDisabled,
              }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: FIORI.segmentUnselectedText },
                  isSelected && { color: FIORI.segmentSelectedText },
                  isOptionDisabled && styles.segmentTextDisabled,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

// ============================================================================
// BUTTON GROUP - For Single or Multi Selection
// ============================================================================

export interface ButtonGroupOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ButtonGroupProps {
  /** Form cell label */
  label?: string;
  /** Currently selected value(s) - array for multi-select, string for single */
  selectedValues: string[];
  /** Callback when selection changes */
  onSelectionChange: (values: string[]) => void;
  /** Available options */
  options: ButtonGroupOption[];
  /** Allow multiple selections */
  multiSelect?: boolean;
  /** Use stacked layout (label above buttons) */
  stacked?: boolean;
  /** Disable all buttons */
  disabled?: boolean;
  /** Enable haptic feedback on selection */
  hapticFeedback?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  label,
  selectedValues,
  onSelectionChange,
  options,
  multiSelect = false,
  stacked = false,
  disabled = false,
  hapticFeedback = true,
  style,
}) => {
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors, isDarkMode);

  const handlePress = useCallback(
    (optionValue: string, optionDisabled?: boolean) => {
      if (disabled || optionDisabled) return;

      if (hapticFeedback) {
        Vibration.vibrate(10);
      }

      if (multiSelect) {
        // Toggle selection for multi-select
        if (selectedValues.includes(optionValue)) {
          onSelectionChange(selectedValues.filter((v) => v !== optionValue));
        } else {
          onSelectionChange([...selectedValues, optionValue]);
        }
      } else {
        // Single selection - replace
        onSelectionChange([optionValue]);
      }
    },
    [disabled, multiSelect, selectedValues, hapticFeedback, onSelectionChange]
  );

  return (
    <View
      style={[
        styles.buttonGroupContainer,
        stacked && styles.buttonGroupContainerStacked,
        style,
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {label && (
        <Text
          style={[
            styles.label,
            { color: FIORI.labelText },
            stacked && styles.labelStacked,
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
      <View style={styles.buttonGroupWrapper}>
        {options.map((option, index) => {
          const isSelected = selectedValues.includes(option.value);
          const isPressed = pressedIndex === index;
          const isOptionDisabled = disabled || option.disabled;

          return (
            <Pressable
              key={option.value}
              style={[
                styles.button,
                { borderColor: FIORI.buttonUnselectedBorder, backgroundColor: FIORI.buttonUnselectedBg },
                isSelected && [styles.buttonSelected, { backgroundColor: FIORI.buttonSelectedBg }],
                !isSelected && isPressed && { backgroundColor: FIORI.buttonPressedUnselectedBg, borderColor: FIORI.buttonPressedUnselectedBorder },
                isSelected && isPressed && { backgroundColor: FIORI.buttonPressedSelectedBg },
                isOptionDisabled && styles.buttonDisabled,
              ]}
              onPress={() => handlePress(option.value, option.disabled)}
              onPressIn={() => setPressedIndex(index)}
              onPressOut={() => setPressedIndex(null)}
              disabled={isOptionDisabled}
              accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
              accessibilityState={{
                selected: isSelected,
                checked: isSelected,
                disabled: isOptionDisabled,
              }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: FIORI.buttonUnselectedText },
                  isSelected && { color: FIORI.buttonSelectedText },
                  isOptionDisabled && styles.buttonTextDisabled,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

// ============================================================================
// TRADITIONAL RADIO BUTTON - Updated with Fiori Styling
// ============================================================================

export interface RadioButtonProps {
  /** Radio button label */
  label: string;
  /** Whether this radio is selected */
  selected: boolean;
  /** Callback when pressed */
  onPress: () => void;
  /** Disable the radio button */
  disabled?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
  /** Label style override */
  labelStyle?: StyleProp<TextStyle>;
}

export const RadioButton: React.FC<RadioButtonProps> = ({
  label,
  selected,
  onPress,
  disabled = false,
  style,
  labelStyle,
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors, isDarkMode);

  const handlePress = useCallback(() => {
    if (disabled || selected) return;
    Vibration.vibrate(10);
    onPress();
  }, [disabled, selected, onPress]);

  return (
    <Pressable
      style={[
        styles.radioContainer,
        disabled && styles.radioContainerDisabled,
        style,
      ]}
      onPress={handlePress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
    >
      <View
        style={[
          styles.radioOuter,
          { borderColor: FIORI.radioUnselectedBorder },
          selected && [styles.radioOuterSelected, { borderColor: FIORI.radioSelectedBorder }],
          isPressed && !disabled && styles.radioOuterPressed,
          disabled && styles.radioOuterDisabled,
        ]}
      >
        {selected && <View style={[styles.radioInner, { backgroundColor: FIORI.radioDotColor }]} />}
      </View>
      <Text
        style={[
          styles.radioLabel,
          { color: FIORI.labelText },
          disabled && styles.radioLabelDisabled,
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

// ============================================================================
// RADIO GROUP - Traditional Vertical Radio List
// ============================================================================

export interface RadioGroupProps {
  /** Form cell label */
  label?: string;
  /** Available options */
  options: Array<{ label: string; value: string; disabled?: boolean }>;
  /** Currently selected value */
  selectedValue: string;
  /** Callback when selection changes */
  onValueChange: (value: string) => void;
  /** Disable all radios */
  disabled?: boolean;
  /** Container style override */
  style?: StyleProp<ViewStyle>;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  options,
  selectedValue,
  onValueChange,
  disabled = false,
  style,
}) => {
  const { colors: themeColors, isDarkMode } = useTheme();
  const FIORI = getFioriColors(themeColors, isDarkMode);

  return (
    <View style={[styles.radioGroupContainer, style]}>
      {label && (
        <Text style={[styles.label, { color: FIORI.labelText }, styles.labelStacked, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
      <View style={styles.radioGroup} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <RadioButton
            key={option.value}
            label={option.label}
            selected={selectedValue === option.value}
            onPress={() => onValueChange(option.value)}
            disabled={disabled || option.disabled}
          />
        ))}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // ============================================================================
  // LABELS (Shared)
  // ============================================================================
  label: {
    fontSize: FIORI_DIMENSIONS.labelFontSize,
    fontWeight: FIORI_DIMENSIONS.labelFontWeight,
    color: theme.colors.fiori.text.primary,
    marginRight: FIORI_DIMENSIONS.labelControlGap,
  },
  labelStacked: {
    marginRight: 0,
    marginBottom: FIORI_DIMENSIONS.buttonSpacing,
  },
  labelDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },

  // ============================================================================
  // SEGMENTED CONTROL
  // ============================================================================
  segmentedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: FIORI_DIMENSIONS.cellHeightSingleLine,
  },
  segmentedContainerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: FIORI_DIMENSIONS.cellHeightStacked,
  },
  segmentedControlWrapper: {
    flexDirection: 'row',
    backgroundColor: theme.colors.gray[100],
    borderRadius: FIORI_DIMENSIONS.segmentedBorderRadius,
    borderWidth: 1,
    borderColor: theme.colors.gray[200],
    padding: 2,
    overflow: 'hidden',
  },
  segmentedControlWrapperDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },
  segment: {
    flex: 1,
    minWidth: FIORI_DIMENSIONS.buttonMinWidth,
    height: FIORI_DIMENSIONS.buttonHeight - 4, // Account for container padding
    paddingHorizontal: FIORI_DIMENSIONS.buttonHorizontalPadding,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FIORI_DIMENSIONS.segmentedBorderRadius - 2,
    backgroundColor: 'transparent',
  },
  segmentFirst: {
    marginLeft: 0,
  },
  segmentLast: {
    marginRight: 0,
  },
  segmentSelected: {
    backgroundColor: theme.colors.fiori.objectCell.background,
    ...SEGMENT_SHADOW,
  },
  segmentPressed: {
    backgroundColor: theme.colors.gray[200],
  },
  segmentDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },
  segmentText: {
    fontSize: FIORI_DIMENSIONS.buttonFontSize,
    fontWeight: FIORI_DIMENSIONS.buttonFontWeight,
    color: theme.colors.fiori.text.primary,
  },
  segmentTextSelected: {
    color: theme.colors.primary,
  },
  segmentTextDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },

  // ============================================================================
  // BUTTON GROUP
  // ============================================================================
  buttonGroupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: FIORI_DIMENSIONS.cellHeightSingleLine,
  },
  buttonGroupContainerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: FIORI_DIMENSIONS.cellHeightStacked,
  },
  buttonGroupWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FIORI_DIMENSIONS.buttonSpacing,
  },
  button: {
    minWidth: FIORI_DIMENSIONS.buttonMinWidth,
    height: FIORI_DIMENSIONS.buttonHeight,
    paddingHorizontal: FIORI_DIMENSIONS.buttonHorizontalPadding,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FIORI_DIMENSIONS.buttonBorderRadius,
    borderWidth: 1,
    borderColor: theme.colors.gray[200],
    backgroundColor: 'transparent',
  },
  buttonSelected: {
    borderWidth: 0,
    backgroundColor: theme.colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  buttonPressedUnselected: {
    backgroundColor: theme.colors.gray[100],
    borderColor: theme.colors.gray[300],
  },
  buttonPressedSelected: {
    backgroundColor: theme.colors.orange[600],
  },
  buttonDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },
  buttonText: {
    fontSize: FIORI_DIMENSIONS.buttonFontSize,
    fontWeight: FIORI_DIMENSIONS.buttonFontWeight,
    color: theme.colors.fiori.text.primary,
  },
  buttonTextSelected: {
    color: '#FFFFFF',
  },
  buttonTextDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },

  // ============================================================================
  // TRADITIONAL RADIO BUTTON
  // ============================================================================
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    minHeight: FIORI_DIMENSIONS.minTouchTarget,
  },
  radioContainerDisabled: {
    opacity: FIORI_DIMENSIONS.buttonDisabledTextOpacity,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.white,
  },
  radioOuterSelected: {
    borderColor: theme.colors.primary,
  },
  radioOuterPressed: {
    borderColor: theme.colors.orange[400],
    backgroundColor: theme.colors.orange[50],
  },
  radioOuterDisabled: {
    borderColor: theme.colors.gray[300],
    backgroundColor: theme.colors.gray[50],
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  radioLabel: {
    fontSize: FIORI_DIMENSIONS.buttonFontSize,
    fontWeight: FIORI_DIMENSIONS.buttonFontWeight,
    color: theme.colors.fiori.text.primary,
    flex: 1,
  },
  radioLabelDisabled: {
    color: theme.colors.gray[400],
  },

  // ============================================================================
  // RADIO GROUP
  // ============================================================================
  radioGroupContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  radioGroup: {
    gap: theme.spacing.xs,
  },
});

export default RadioButton;
