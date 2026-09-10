/**
 * GCS Mobile App - Switch Component
 *
 * SAP Fiori Switch Form Cell implementation
 * @see design/sap-fiori-specs/16-switch.md
 *
 * Features:
 * - Simple toggle (on/off)
 * - Label with optional helper text
 * - Support for further selection (child content when on)
 * - Haptic feedback on toggle
 * - Proper accessibility
 */

import React from 'react';
import {
  View,
  Text,
  Switch as RNSwitch,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import theme, { Colors } from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { triggerMediumTap } from '@/hooks/useHaptics';

// ============================================================================
// FIORI SWITCH CONSTANTS
// ============================================================================

const FIORI_DIMENSIONS = {
  // Dimensions
  cellMinHeight: 44,
  switchWidth: 51, // iOS standard
  switchHeight: 31, // iOS standard
  horizontalPadding: 16,
  labelSwitchGap: 12,

  // Typography
  labelFontSize: 17,
  labelFontWeight: '400' as const,
  helperFontSize: 13,
  helperLineHeight: 18,
};

/**
 * Generate theme-aware FIORI colors for Switch
 */
function getFioriColors(colors: Colors) {
  return {
    trackColorOff: colors.gray[200],
    trackColorOn: colors.green[500], // iOS green equivalent
    trackColorOnBranded: colors.primary, // Primary color option
    thumbColor: colors.white,
    labelColor: colors.fiori.text.primary,
    labelColorDisabled: colors.gray[500],
    helperColor: colors.fiori.text.secondary,
    backgroundColor: colors.fiori.objectCell.background,
    dividerColor: colors.fiori.objectCell.divider,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface SwitchProps {
  /** Label text for the switch */
  label?: string;
  /** Current switch value (on/off) */
  value: boolean;
  /** Callback when value changes */
  onValueChange: (value: boolean) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Helper text below the label */
  helperText?: string;
  /** Use brand primary color instead of iOS green for on state */
  useBrandColor?: boolean;
  /** Enable haptic feedback on toggle */
  hapticFeedback?: boolean;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom label style */
  labelStyle?: StyleProp<TextStyle>;
  /** Show divider below */
  showDivider?: boolean;
}

export interface SwitchCellProps extends SwitchProps {
  /** Content to show when switch is ON (further selection) */
  children?: React.ReactNode;
}

// ============================================================================
// SWITCH COMPONENT (Basic)
// ============================================================================

export const Switch: React.FC<SwitchProps> = ({
  label,
  value,
  onValueChange,
  disabled = false,
  helperText,
  useBrandColor = false,
  hapticFeedback = true,
  style,
  labelStyle,
  showDivider = false,
}) => {
  const { colors: themeColors } = useTheme();
  const FIORI = getFioriColors(themeColors);

  // Handle toggle with optional haptic feedback
  const handleValueChange = (newValue: boolean) => {
    if (hapticFeedback) {
      triggerMediumTap();
    }
    onValueChange(newValue);
  };

  // Get track on color (iOS green or brand orange)
  const trackColorOn = useBrandColor ? FIORI.trackColorOnBranded : FIORI.trackColorOn;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: FIORI.backgroundColor },
        showDivider && styles.containerWithDivider,
        showDivider && { borderBottomColor: FIORI.dividerColor },
        style,
      ]}
    >
      {/* Label section */}
      {(label || helperText) && (
        <View style={styles.labelContainer}>
          {label && (
            <Text
              style={[
                styles.label,
                { color: FIORI.labelColor },
                disabled && styles.labelDisabled,
                disabled && { color: FIORI.labelColorDisabled },
                labelStyle,
              ]}
            >
              {label}
            </Text>
          )}
          {helperText && (
            <Text style={[styles.helperText, { color: FIORI.helperColor }]}>{helperText}</Text>
          )}
        </View>
      )}

      {/* Switch */}
      <RNSwitch
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
        trackColor={{
          false: FIORI.trackColorOff,
          true: trackColorOn,
        }}
        thumbColor={FIORI.thumbColor}
        ios_backgroundColor={FIORI.trackColorOff}
        accessibilityRole="switch"
        accessibilityState={{
          checked: value,
          disabled: disabled,
        }}
        accessibilityLabel={label ? `${label}, ${value ? 'On' : 'Off'}` : undefined}
      />
    </View>
  );
};

// ============================================================================
// SWITCH CELL COMPONENT (With Further Selection)
// ============================================================================

/**
 * SwitchCell - Switch with optional child content shown when ON
 *
 * Use this when the switch controls visibility of additional settings.
 *
 * @example
 * ```tsx
 * <SwitchCell
 *   label="Auto-Sync"
 *   value={autoSync}
 *   onValueChange={setAutoSync}
 * >
 *   <ListItem title="Sync Interval" value="Daily" onPress={openPicker} />
 * </SwitchCell>
 * ```
 */
export const SwitchCell: React.FC<SwitchCellProps> = ({
  label,
  value,
  onValueChange,
  disabled = false,
  helperText,
  useBrandColor = false,
  hapticFeedback = true,
  style,
  labelStyle,
  showDivider = false,
  children,
}) => {
  const { colors: themeColors } = useTheme();
  const FIORI = getFioriColors(themeColors);

  return (
    <View style={[styles.cellContainer, { backgroundColor: FIORI.backgroundColor }]}>
      {/* Main switch row */}
      <Switch
        label={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        helperText={helperText}
        useBrandColor={useBrandColor}
        hapticFeedback={hapticFeedback}
        style={style}
        labelStyle={labelStyle}
        showDivider={value && children ? true : showDivider}
      />

      {/* Further selection content (only when ON) */}
      {value && children && (
        <View style={[styles.childrenContainer, { backgroundColor: FIORI.backgroundColor }]}>
          {children}
        </View>
      )}
    </View>
  );
};

// ============================================================================
// SWITCH GROUP COMPONENT
// ============================================================================

/**
 * SwitchGroup - A group of related switches with section header
 *
 * @example
 * ```tsx
 * <SwitchGroup title="Notifications">
 *   <Switch label="Enable Notifications" value={enabled} onValueChange={setEnabled} />
 *   <Switch label="GRN Updates" value={grn} onValueChange={setGrn} disabled={!enabled} />
 *   <Switch label="Dispatch Alerts" value={dispatch} onValueChange={setDispatch} disabled={!enabled} />
 * </SwitchGroup>
 * ```
 */
export interface SwitchGroupProps {
  /** Section title */
  title: string;
  /** Switch components */
  children: React.ReactNode;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
}

export const SwitchGroup: React.FC<SwitchGroupProps> = ({
  title,
  children,
  style,
}) => {
  const { colors: themeColors } = useTheme();
  const FIORI = getFioriColors(themeColors);

  return (
    <View style={[styles.groupContainer, style]}>
      <Text style={[styles.groupTitle, { color: FIORI.helperColor }]}>{title}</Text>
      <View style={[styles.groupContent, { backgroundColor: FIORI.backgroundColor, borderColor: FIORI.dividerColor }]}>
        {children}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES (SAP Fiori Switch Form Cell)
// ============================================================================

const styles = StyleSheet.create({
  // Basic switch container
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: FIORI_DIMENSIONS.horizontalPadding,
    paddingVertical: 12,
    minHeight: FIORI_DIMENSIONS.cellMinHeight,
    backgroundColor: theme.colors.fiori.objectCell.background,
  },
  containerWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.fiori.objectCell.divider,
  },

  // Label section
  labelContainer: {
    flex: 1,
    marginRight: FIORI_DIMENSIONS.labelSwitchGap,
  },
  label: {
    fontSize: FIORI_DIMENSIONS.labelFontSize,
    fontWeight: FIORI_DIMENSIONS.labelFontWeight,
    color: theme.colors.fiori.text.primary,
  },
  labelDisabled: {
    color: theme.colors.gray[500],
    opacity: 0.5,
  },
  helperText: {
    fontSize: FIORI_DIMENSIONS.helperFontSize,
    lineHeight: FIORI_DIMENSIONS.helperLineHeight,
    color: theme.colors.fiori.text.secondary,
    marginTop: 2,
  },

  // SwitchCell container
  cellContainer: {
    backgroundColor: theme.colors.fiori.objectCell.background,
  },
  childrenContainer: {
    backgroundColor: theme.colors.fiori.objectCell.background,
  },

  // SwitchGroup styles
  groupContainer: {
    marginBottom: theme.spacing.md,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.fiori.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: FIORI_DIMENSIONS.horizontalPadding,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.gray[50],
  },
  groupContent: {
    backgroundColor: theme.colors.fiori.objectCell.background,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Switch;
