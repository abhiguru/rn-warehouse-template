/**
 * Selection controls (docs/STYLE_GUIDE.md §13.4): SegmentedControl, ButtonGroup,
 * RadioButton and RadioGroup.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ViewStyle,
  TextStyle,
  StyleProp,
  Pressable,
  LayoutAnimation,
  Insets,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { triggerSelection } from '@/hooks/useHaptics';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

/** Visual height of a segment or group button; the touch area is padded to touchTarget. */
const CONTROL_HEIGHT = 32;
const CONTROL_MIN_WIDTH = 64;
const RADIO_SIZE = 20;
const RADIO_DOT = 10;
const CONTROL_HIT_SLOP: Insets = {
  top: (touchTarget - CONTROL_HEIGHT) / 2,
  bottom: (touchTarget - CONTROL_HEIGHT) / 2,
};

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
  const styles = useThemedStyles(makeStyles);

  const handlePress = useCallback(
    (optionValue: string, optionDisabled?: boolean) => {
      if (disabled || optionDisabled || value === optionValue) return;

      if (hapticFeedback) {
        triggerSelection();
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
                isSelected && styles.segmentSelected,
                isPressed && !isSelected && styles.segmentPressed,
                isPressed && isSelected && styles.segmentSelectedPressed,
                isOptionDisabled && styles.segmentDisabled,
              ]}
              hitSlop={CONTROL_HIT_SLOP}
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
                  isSelected && styles.segmentTextSelected,
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
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  const handlePress = useCallback(
    (optionValue: string, optionDisabled?: boolean) => {
      if (disabled || optionDisabled) return;

      if (hapticFeedback) {
        triggerSelection();
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
                isSelected && styles.buttonSelected,
                !isSelected && isPressed && styles.buttonPressedUnselected,
                isSelected && isPressed && styles.buttonPressedSelected,
                isOptionDisabled && styles.buttonDisabled,
              ]}
              hitSlop={CONTROL_HIT_SLOP}
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
              {isSelected && (
                <MaterialCommunityIcons
                  name="check"
                  size={iconSize.sm}
                  color={t.brand.onFill}
                  style={styles.buttonCheck}
                />
              )}
              <Text
                style={[
                  styles.buttonText,
                  isSelected && styles.buttonTextSelected,
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
  const styles = useThemedStyles(makeStyles);

  const handlePress = useCallback(() => {
    if (disabled || selected) return;
    triggerSelection();
    onPress();
  }, [disabled, selected, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.radioContainer,
        pressed && !disabled && styles.radioContainerPressed,
        disabled && styles.radioContainerDisabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
    >
      <View
        style={[
          styles.radioOuter,
          selected && styles.radioOuterSelected,
        ]}
      >
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text
        style={[
          styles.radioLabel,
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
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.radioGroupContainer, style]}>
      {label && (
        <Text style={[styles.label, styles.labelStacked, disabled && styles.labelDisabled]}>
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

const makeStyles = (t: ThemeTokens) => ({
  // Labels (shared): form-cell label, footnote in text.secondary
  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginRight: space.md,
  },
  labelStacked: {
    marginRight: 0,
    marginBottom: space.sm,
  },
  labelDisabled: {
    opacity: t.interaction.disabledOpacity,
  },

  // Segmented control
  segmentedContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
  },
  segmentedContainerStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    minHeight: layout.objectCellMinHeight,
  },
  segmentedControlWrapper: {
    flexDirection: 'row' as const,
    backgroundColor: t.surface.card,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    padding: space.xxs,
    overflow: 'hidden' as const,
  },
  segmentedControlWrapperDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  segment: {
    flex: 1,
    minWidth: CONTROL_MIN_WIDTH,
    minHeight: CONTROL_HEIGHT - 2 * space.xxs,
    paddingHorizontal: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button - space.xxs,
    backgroundColor: 'transparent',
  },
  segmentSelected: {
    backgroundColor: t.brand.fill,
  },
  segmentSelectedPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  segmentPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  segmentDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  segmentText: {
    ...typography.subhead,
    color: t.text.primary,
  },
  segmentTextSelected: {
    color: t.brand.onFill,
    fontWeight: fontWeight.semibold,
  },

  // Button group
  buttonGroupContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
  },
  buttonGroupContainerStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    minHeight: layout.objectCellMinHeight,
  },
  buttonGroupWrapper: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  button: {
    flexDirection: 'row' as const,
    minWidth: CONTROL_MIN_WIDTH,
    minHeight: CONTROL_HEIGHT,
    paddingHorizontal: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    backgroundColor: 'transparent',
  },
  buttonSelected: {
    borderColor: t.brand.fill,
    backgroundColor: t.brand.fill,
  },
  buttonPressedUnselected: {
    backgroundColor: t.surface.cardPressed,
  },
  buttonPressedSelected: {
    borderColor: t.brand.fillPressed,
    backgroundColor: t.brand.fillPressed,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  buttonCheck: {
    marginRight: space.xs,
  },
  buttonText: {
    ...typography.subhead,
    color: t.text.primary,
  },
  buttonTextSelected: {
    color: t.brand.onFill,
    fontWeight: fontWeight.semibold,
  },

  // Radio button: the whole row is the target
  radioContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    minHeight: touchTarget,
  },
  radioContainerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  radioContainerDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  radioOuter: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.border.field,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: space.md,
    backgroundColor: t.surface.field,
  },
  radioOuterSelected: {
    borderColor: t.brand.tint,
  },
  radioInner: {
    width: RADIO_DOT,
    height: RADIO_DOT,
    borderRadius: radius.pill,
    backgroundColor: t.brand.tint,
  },
  radioLabel: {
    ...typography.body,
    color: t.text.primary,
    flex: 1,
  },

  // Radio group
  radioGroupContainer: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  radioGroup: {
    gap: space.xs,
  },
});

export default RadioButton;
