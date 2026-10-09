/**
 * SAP Fiori Switch Form Cell implementation
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
  Pressable,
  Switch as RNSwitch,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { triggerLightTap } from '@/hooks/useHaptics';

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
  /**
   * Track colour when on. true (default): brand.fill. false: status.positive.element,
   * for a plain on/off that should not read as a brand action.
   */
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
  useBrandColor = true,
  hapticFeedback = true,
  style,
  labelStyle,
  showDivider = false,
}) => {
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

  // Handle toggle with optional haptic feedback
  const handleValueChange = (newValue: boolean) => {
    if (hapticFeedback) {
      triggerLightTap();
    }
    onValueChange(newValue);
  };

  const trackColorOn = useBrandColor ? t.brand.fill : t.status.positive.element;
  const hasLabel = Boolean(label || helperText);

  const control = (
    <RNSwitch
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      trackColor={{
        false: t.control.trackOff,
        true: trackColorOn,
      }}
      thumbColor={t.control.thumb}
      ios_backgroundColor={t.control.trackOff}
      // With a label the whole row is the switch for touch and screen readers.
      accessible={!hasLabel}
      importantForAccessibility={hasLabel ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    />
  );

  if (!hasLabel) {
    return (
      <View style={[styles.container, showDivider && styles.containerWithDivider, style]}>
        {control}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => handleValueChange(!value)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
        showDivider && styles.containerWithDivider,
        style,
      ]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={helperText}
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={[styles.labelContainer, disabled && styles.disabled]}>
        {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
        {helperText && <Text style={styles.helperText}>{helperText}</Text>}
      </View>
      <View style={disabled && styles.disabled}>{control}</View>
    </Pressable>
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
  useBrandColor = true,
  hapticFeedback = true,
  style,
  labelStyle,
  showDivider = false,
  children,
}) => {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.cellContainer}>
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
        <View style={styles.childrenContainer}>
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
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.groupContainer, style]}>
      <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.groupContent}>
        {children}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES (SAP Fiori Switch Form Cell)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  // Basic switch row: the whole row is the touch target
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: layout.rowMinHeight,
    backgroundColor: t.surface.card,
  },
  containerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  containerWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },

  // Label section
  labelContainer: {
    flex: 1,
    marginRight: space.md,
  },
  label: {
    ...typography.body,
    color: t.text.primary,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },

  // SwitchCell container
  cellContainer: {
    backgroundColor: t.surface.card,
  },
  childrenContainer: {
    backgroundColor: t.surface.card,
  },

  // SwitchGroup styles
  groupContainer: {
    marginBottom: space.lg,
  },
  groupTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.secondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.sm,
  },
  groupContent: {
    backgroundColor: t.surface.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: t.border.divider,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default Switch;
