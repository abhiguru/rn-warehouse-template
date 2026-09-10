/**
 * GCS Mobile App - Remote Autocomplete Input Component
 *
 * SAP Fiori Form Cell implementation with autocomplete dropdown
 * @see design/sap-fiori-specs/06-text-input-form-cell.md
 *
 * Features:
 * - Label above field (Capital Case)
 * - Required asterisk indicator
 * - Helper text / Error message (mutually exclusive)
 * - Clear button during active typing (Fiori circular style)
 * - Floating dropdown with suggestions
 * - Loading state with activity indicator
 * - 44pt minimum touch target
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Platform,
  Keyboard,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

// ============================================================================
// FIORI FORM CELL CONSTANTS (matching Input.tsx)
// ============================================================================

const FIORI = {
  // Typography
  labelFontSize: 13,
  labelLineHeight: 18,
  inputFontSize: Platform.OS === 'ios' ? 17 : 16,
  inputLineHeight: 22,
  helperFontSize: 13,
  helperLineHeight: 18,

  // Dimensions
  minHeight: 44,
  inputPaddingHorizontal: 12,
  inputPaddingVertical: 8,
  iconSize: 20,
  clearButtonSize: 18,
  borderRadius: 8,

  // Colors
  labelColor: '#1D2D3E',
  inputTextColor: '#1D2D3E',
  placeholderColor: '#556B82',
  helperColor: '#556B82',
  iconColor: '#7e8e9d',

  // Border colors
  borderDefault: '#E5E5E5',
  borderActive: '#53b1b1', // Green/teal - matches header step chips
  borderError: '#D32030',

  // Background colors
  backgroundDefault: '#FFFFFF',
  backgroundReadOnly: '#F2F2F7',
  backgroundDropdown: '#FFFFFF',

  // Border widths
  borderWidthDefault: 1,
  borderWidthActive: 2,

  // Dropdown
  dropdownMaxHeight: 200,
  dropdownItemPaddingVertical: 12,
  dropdownItemPaddingHorizontal: 16,
};

// ============================================================================
// TYPES
// ============================================================================

interface RemoteAutocompleteInputProps<T> {
  /** The display value (text in input) */
  value: string;
  /** Input label (displayed in Capital Case) */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message (overrides helperText per Fiori spec) */
  error?: string;
  /** Show required asterisk */
  required?: boolean;
  /** Fetch suggestions based on query */
  fetchData: (query: string) => Promise<T[]>;
  /** Called when user selects an item */
  onSelect: (item: T) => void;
  /** Render function for dropdown items */
  renderItem: (item: T) => React.ReactNode;
  /** Key extractor for dropdown items */
  keyExtractor: (item: T) => string;
  /** z-index for dropdown positioning */
  zIndex?: number;
  /** Custom container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** Custom input style */
  inputStyle?: StyleProp<ViewStyle>;
  /** Custom dropdown list style */
  listStyle?: StyleProp<ViewStyle>;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Minimum characters before searching */
  minChars?: number;
  /** Read-only mode */
  readOnly?: boolean;
  /** Disabled state */
  editable?: boolean;
  /** Left icon element (e.g., search icon) */
  leftIcon?: React.ReactNode;
  /** Right icon element (e.g., chevron) */
  rightIcon?: React.ReactNode;
  /** Custom empty state text */
  emptyText?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RemoteAutocompleteInput<T>({
  value,
  label,
  placeholder = 'Type to search...',
  helperText,
  error,
  required = false,
  fetchData,
  onSelect,
  renderItem,
  keyExtractor,
  zIndex = 1000,
  containerStyle,
  inputStyle,
  listStyle,
  debounceMs = 400,
  minChars = 1,
  readOnly = false,
  editable = true,
  leftIcon,
  rightIcon,
  emptyText = 'No items found',
}: RemoteAutocompleteInputProps<T>) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Theme colors for dark mode support
  const colors = useListColors();

  const hasError = Boolean(error);
  const isDisabled = editable === false && !readOnly;
  const isReadOnly = readOnly;
  const hasValue = query.length > 0;

  // Sync internal query state when prop value changes
  useEffect(() => {
    if (value !== query) {
      setQuery(value);
    }
  }, [value]);

  // Debounced search function
  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);

      // Clear previous timeout
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      // If text is cleared or too short, hide list and return
      if (!text || text.length < minChars) {
        setSuggestions([]);
        setShowList(false);
        return;
      }

      setShowList(true);
      setIsLoading(true);

      // Set new timeout
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await fetchData(text);
          setSuggestions(results);
        } catch (err) {
          console.error('Autocomplete search failed:', err);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [fetchData, minChars, debounceMs]
  );

  const handleSelectItem = (item: T) => {
    onSelect(item);
    setSuggestions([]);
    setShowList(false);
    Keyboard.dismiss();
  };

  const clearInput = () => {
    setQuery('');
    setSuggestions([]);
    setShowList(false);
    onSelect(null as unknown as T);
    inputRef.current?.focus();
  };

  // Determine border color based on state (Fiori spec)
  const getBorderColor = useCallback(() => {
    if (hasError) return colors.error;
    if (isFocused) return colors.teal;
    if (isReadOnly) return 'transparent';
    return colors.gray200;
  }, [hasError, isFocused, isReadOnly, colors]);

  // Determine border width based on state
  const getBorderWidth = useCallback(() => {
    if (hasError || isFocused) return FIORI.borderWidthActive;
    if (isReadOnly) return 0;
    return FIORI.borderWidthDefault;
  }, [hasError, isFocused, isReadOnly]);

  // Determine background color based on state
  const getBackgroundColor = useCallback(() => {
    if (isReadOnly) return colors.gray100;
    return colors.cellBackground;
  }, [isReadOnly, colors]);

  // Get message text and color (error overrides helper per Fiori spec)
  const getMessage = useCallback(() => {
    if (error) {
      return { text: error, color: colors.error, isError: true };
    }
    if (isReadOnly) {
      return { text: 'Read-only field', color: colors.textSecondary, isError: false };
    }
    if (helperText) {
      return { text: helperText, color: colors.textSecondary, isError: false };
    }
    return null;
  }, [error, isReadOnly, helperText, colors]);

  const message = getMessage();

  // Show clear button when typing and has value
  const shouldShowClear = isFocused && hasValue && !isReadOnly && !isDisabled && !isLoading;

  return (
    <View
      style={[
        styles.container,
        { zIndex },
        isDisabled && styles.containerDisabled,
        containerStyle,
      ]}
    >
      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: colors.textPrimary }, isDisabled && { color: colors.textSecondary }]}>
          {label}
          {required && <Text style={{ color: colors.error }}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            borderWidth: getBorderWidth(),
            backgroundColor: getBackgroundColor(),
          },
        ]}
      >
        {/* Left Icon */}
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.textPrimary }, isDisabled && { color: colors.textSecondary }, inputStyle]}
          value={query}
          onChangeText={handleSearch}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          editable={!isReadOnly && editable}
          selectTextOnFocus={isReadOnly}
          accessibilityLabel={
            label ? `${label}${required ? ', required' : ', optional'}` : placeholder
          }
          accessibilityHint={label ? `Enter ${label.toLowerCase()}` : undefined}
          accessibilityState={{ disabled: isDisabled }}
          onFocus={() => {
            setIsFocused(true);
            if (suggestions.length > 0) setShowList(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            // Delay hiding the list to allow touch on dropdown items
            setTimeout(() => {
              if (!isFocused) setShowList(false);
            }, 200);
          }}
        />

        {/* Loading Indicator */}
        {isLoading && (
          <ActivityIndicator
            style={styles.iconRight}
            size="small"
            color={colors.primary}
          />
        )}

        {/* Clear Button (Fiori: circular gray background with × icon) */}
        {shouldShowClear && (
          <Pressable
            onPress={clearInput}
            style={styles.clearButton}
            accessibilityLabel={`Clear ${label || 'input'}`}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={[styles.clearButtonInner, { backgroundColor: colors.gray400 }]}>
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
        )}

        {/* Search Icon (when empty and not loading) */}
        {!isLoading && !shouldShowClear && !hasValue && !rightIcon && (
          <Ionicons
            name="search"
            size={FIORI.iconSize}
            color={colors.textTertiary}
            style={styles.iconRight}
          />
        )}

        {/* Error Icon (when has error and not focused) */}
        {hasError && !isFocused && !shouldShowClear && (
          <Ionicons
            name="alert-circle"
            size={FIORI.iconSize}
            color={colors.error}
            style={styles.iconRight}
          />
        )}

        {/* Custom Right Icon */}
        {rightIcon && !shouldShowClear && !isLoading && (
          <View style={styles.iconRight}>{rightIcon}</View>
        )}
      </View>

      {/* Helper Text / Error Message (mutually exclusive per Fiori spec) */}
      {message && (
        <Text
          style={[
            styles.helperText,
            { color: message.color },
            message.isError && styles.errorText,
          ]}
        >
          {message.text}
        </Text>
      )}

      {/* Floating Suggestions List */}
      {showList && suggestions.length > 0 && (
        <View style={[styles.dropdownContainer, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, listStyle]}>
          <FlatList
            data={suggestions}
            keyExtractor={keyExtractor}
            renderItem={({ item, index }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.dropdownItem,
                  { borderBottomColor: colors.gray200 },
                  pressed && { backgroundColor: colors.gray100 },
                  index === suggestions.length - 1 && styles.dropdownItemLast,
                ]}
                onPress={() => handleSelectItem(item)}
              >
                {renderItem(item)}
              </Pressable>
            )}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            style={styles.dropdownList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Empty State */}
      {showList && !isLoading && suggestions.length === 0 && query.length >= minChars && (
        <View style={[styles.dropdownContainer, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }, listStyle, styles.emptyState]}>
          <Ionicons
            name="search-outline"
            size={24}
            color={colors.textTertiary}
            style={styles.emptyIcon}
          />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES (SAP Fiori Form Cell)
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  containerDisabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: FIORI.labelFontSize,
    lineHeight: FIORI.labelLineHeight,
    fontWeight: theme.fontWeight.medium,
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: FIORI.borderRadius,
    minHeight: FIORI.minHeight,
    paddingHorizontal: FIORI.inputPaddingHorizontal,
  },
  input: {
    flex: 1,
    fontSize: FIORI.inputFontSize,
    paddingVertical: FIORI.inputPaddingVertical,
    paddingHorizontal: 0,
    ...Platform.select({
      ios: {
        lineHeight: FIORI.inputLineHeight,
      },
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
      },
    }),
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  iconRight: {
    marginLeft: theme.spacing.sm,
  },
  clearButton: {
    marginLeft: theme.spacing.sm,
    padding: 2,
  },
  clearButtonInner: {
    width: FIORI.clearButtonSize,
    height: FIORI.clearButtonSize,
    borderRadius: FIORI.clearButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    fontSize: FIORI.helperFontSize,
    lineHeight: FIORI.helperLineHeight,
    marginTop: 4,
  },
  errorText: {
    fontWeight: theme.fontWeight.medium,
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: FIORI.borderWidthDefault,
    borderRadius: FIORI.borderRadius,
    maxHeight: FIORI.dropdownMaxHeight,
    marginTop: 4,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
    zIndex: 1000,
  },
  dropdownList: {
    maxHeight: FIORI.dropdownMaxHeight,
  },
  dropdownItem: {
    paddingVertical: FIORI.dropdownItemPaddingVertical,
    paddingHorizontal: FIORI.dropdownItemPaddingHorizontal,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: FIORI.minHeight,
    justifyContent: 'center',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  emptyState: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: FIORI.helperFontSize,
    lineHeight: FIORI.helperLineHeight,
    textAlign: 'center',
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default RemoteAutocompleteInput;
