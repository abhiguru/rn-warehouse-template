/**
 * RackChamberPicker - Rack input with floor/chamber chip selectors
 *
 * Floor and chamber are single-choice chips (radio semantics); the current
 * choice is shown with brand.subtle, brand.tint and a check icon.
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/RackChamberPicker
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TextInput, Pressable, Vibration, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

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
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
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


    const renderChip = (option: string, selected: boolean, onPress: () => void, group: string) => (
      <Pressable
        key={option}
        style={({ pressed }) => [
          styles.chip,
          selected && styles.chipSelected,
          pressed && !selected && styles.chipPressed,
        ]}
        onPress={onPress}
        hitSlop={{ top: space.s6, bottom: space.s6 }}
        accessibilityRole="radio"
        accessibilityLabel={`${group} ${option}`}
        accessibilityState={{ selected, checked: selected }}
      >
        {selected && (
          <Icon name="check" size={iconSize.sm} color={t.brand.tint} style={styles.chipCheckmark} />
        )}
        <Text style={[styles.chipText, selected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
          {option}
        </Text>
      </Pressable>
    );

    return (
      <View>
        <View style={styles.labelRow}>
          <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.label}>Rack</Text>
          {!!fullRackValue && (
            <Text style={styles.rackPreviewInline} numberOfLines={1}>
              {fullRackValue}
            </Text>
          )}
        </View>

        <TextInput
          ref={inputRef}
          accessibilityLabel="Rack"
          style={[styles.input, !!error && styles.inputError, isFocused && styles.inputFocused]}
          value={rackTextOnly}
          onChangeText={handleRackTextChange}
          placeholder="For example 20B-20C"
          placeholderTextColor={t.text.placeholder}
          returnKeyType="next"
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCapitalize="characters"
        />

        {/* Floor Chips */}
        <View style={styles.chipSection}>
          <Text style={styles.chipLabel} accessibilityRole="header">Floor</Text>
          <View style={styles.chipWrap} accessibilityRole="radiogroup">
            {FLOOR_OPTIONS.map((floor) =>
              renderChip(floor, selectedFloor === floor, () => handleFloorSelect(floor), 'Floor')
            )}
          </View>
        </View>

        {/* Chamber Chips */}
        <View style={styles.chipSection}>
          <Text style={styles.chipLabel} accessibilityRole="header">Chamber</Text>
          <View style={styles.chipWrap} accessibilityRole="radiogroup">
            {CHAMBER_OPTIONS.map((chamber) =>
              renderChip(chamber, selectedChamber === chamber, () => handleChamberSelect(chamber), 'Chamber')
            )}
          </View>
        </View>

        {!!error && (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
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
  rackPreviewInline: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flexShrink: 1,
  },
  input: {
    ...typography.body,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: 44,
    color: t.text.primary,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const, includeFontPadding: false },
      default: {},
    }),
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
  chipSection: {
    marginTop: space.sm,
  },
  chipLabel: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  chipWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: t.surface.card,
    borderWidth: 1,
    borderColor: t.border.button,
    minWidth: 44,
  },
  chipPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  chipSelected: {
    backgroundColor: t.brand.subtle,
    borderColor: t.brand.tint,
  },
  chipCheckmark: {
    marginRight: space.xs,
  },
  chipText: {
    ...typography.caption1,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
  },
  chipTextSelected: {
    color: t.brand.tint,
    fontWeight: fontWeight.semibold,
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

export default RackChamberPicker;
