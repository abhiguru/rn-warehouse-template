/**
 * SAP Fiori form cell with an autocomplete dropdown (docs/STYLE_GUIDE.md §13.2)
 *
 * Features:
 * - Label above field (sentence case) with required asterisk
 * - Helper text / error message (mutually exclusive)
 * - Clear button while typing
 * - Suggestions in a list under the field
 * - Loading state with activity indicator
 * - 44pt minimum touch target
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  Platform,
  Keyboard,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

const DROPDOWN_MAX_HEIGHT = 200;
const CLEAR_HIT_SLOP = (touchTarget - iconSize.md) / 2;

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
  getItemAccessibilityLabel?: (item: T) => string;
  /** Key extractor for dropdown items */
  keyExtractor: (item: T) => string;
  /** z-index for dropdown positioning */
  zIndex?: number;
  /** Custom container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** Custom input style */
  inputStyle?: StyleProp<ViewStyle>;
  /** Place suggestions in normal layout inside a clipping scroll container. */
  suggestionPlacement?: 'overlay' | 'inline';
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
  getItemAccessibilityLabel,
  keyExtractor,
  zIndex = 1000,
  containerStyle,
  inputStyle,
  listStyle,
  suggestionPlacement = 'overlay',
  debounceMs = 400,
  minChars = 1,
  readOnly = false,
  editable = true,
  leftIcon,
  rightIcon,
  emptyText = 'No matches',
}: RemoteAutocompleteInputProps<T>) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Each keystroke, selection or clear takes a new id; a fetch whose id is no
  // longer current is discarded so an earlier, slower search cannot reopen
  // suggestions after the operator moved on.
  const searchRequestRef = useRef(0);
  const inputRef = useRef<TextInput>(null);

  const cancelPendingSearch = useCallback(() => {
    searchRequestRef.current += 1;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => { cancelPendingSearch(); }, [cancelPendingSearch]);

  const t = useTokens();
  const styles = useThemedStyles(makeStyles);

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

      // Supersede any armed or in-flight search for the previous text.
      cancelPendingSearch();
      const requestId = searchRequestRef.current;
      const isCurrent = () => requestId === searchRequestRef.current;

      // If text is cleared or too short, hide list and return
      if (!text || text.length < minChars) {
        setSuggestions([]);
        setShowList(false);
        setIsLoading(false);
        return;
      }

      setShowList(true);
      setIsLoading(true);

      // Set new timeout
      searchTimeoutRef.current = setTimeout(async () => {
        searchTimeoutRef.current = null;
        try {
          const results = await fetchData(text);
          if (!isCurrent()) return;
          setSuggestions(results);
        } catch (err) {
          if (!isCurrent()) return;
          console.error('Autocomplete search failed:', err);
          setSuggestions([]);
        } finally {
          if (isCurrent()) setIsLoading(false);
        }
      }, debounceMs);
    },
    [fetchData, minChars, debounceMs, cancelPendingSearch]
  );

  const handleSelectItem = (item: T) => {
    cancelPendingSearch();
    setIsLoading(false);
    onSelect(item);
    setSuggestions([]);
    setShowList(false);
    Keyboard.dismiss();
  };

  const clearInput = () => {
    cancelPendingSearch();
    setIsLoading(false);
    setQuery('');
    setSuggestions([]);
    setShowList(false);
    onSelect(null as unknown as T);
    inputRef.current?.focus();
  };

  // Field outline per state (style guide §13.2)
  const fieldStateStyle = hasError
    ? styles.fieldError
    : isFocused
      ? styles.fieldFocused
      : isReadOnly
        ? styles.fieldReadOnly
        : null;

  // Error overrides helper text
  const message = error
    ? { text: error, isError: true }
    : helperText
      ? { text: helperText, isError: false }
      : null;

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
        <Text style={[styles.label, hasError && styles.labelError, isDisabled && styles.textDisabled]}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <View style={[styles.inputContainer, fieldStateStyle]}>
        {/* Left Icon */}
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          style={[styles.input, isDisabled && styles.textDisabled, inputStyle]}
          value={query}
          onChangeText={handleSearch}
          placeholder={placeholder}
          placeholderTextColor={t.text.placeholder}
          editable={!isReadOnly && editable}
          selectTextOnFocus={isReadOnly}
          accessibilityLabel={
            label ? `${label}${required ? ', required' : ''}` : placeholder
          }
          accessibilityHint={isReadOnly ? 'Read only' : hasError ? error : 'Type to see suggestions'}
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
            color={t.brand.tint}
          />
        )}

        {/* Clear Button (Fiori: circular gray background with × icon) */}
        {shouldShowClear && (
          <Pressable
            onPress={clearInput}
            style={styles.clearButton}
            accessibilityLabel={`Clear ${label ? label.toLowerCase() : 'text'}`}
            accessibilityRole="button"
            hitSlop={CLEAR_HIT_SLOP}
          >
            <Ionicons name="close-circle" size={iconSize.md} color={t.icon.secondary} />
          </Pressable>
        )}

        {/* Search Icon (when empty and not loading) */}
        {!isLoading && !shouldShowClear && !hasValue && !rightIcon && (
          <Ionicons
            name="search"
            size={iconSize.md}
            color={t.icon.secondary}
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
        <View style={styles.messageRow}>
          {message.isError && (
            <Ionicons
              name="alert-circle"
              size={iconSize.sm}
              color={t.status.negative.text}
              style={styles.messageIcon}
            />
          )}
          <Text
            style={[styles.helperText, message.isError && styles.errorText]}
            accessibilityLiveRegion={message.isError ? 'polite' : 'none'}
          >
            {message.text}
          </Text>
        </View>
      )}

      {/* Floating Suggestions List */}
      {showList && suggestions.length > 0 && (
        <View style={[styles.dropdownContainer, suggestionPlacement === 'inline' && styles.dropdownInline, listStyle]}>
          <FlatList
            data={suggestions}
            keyExtractor={keyExtractor}
            renderItem={({ item, index }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.dropdownItem,
                  pressed && styles.dropdownItemPressed,
                  index === suggestions.length - 1 && styles.dropdownItemLast,
                ]}
                accessibilityRole="button"
                accessibilityLabel={getItemAccessibilityLabel?.(item)}
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
        <View
          style={[styles.dropdownContainer, suggestionPlacement === 'inline' && styles.dropdownInline, listStyle, styles.emptyState]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name="search-outline"
            size={iconSize.lg}
            color={t.icon.secondary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES (SAP Fiori Form Cell)
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    position: 'relative' as const,
    marginBottom: space.lg,
  },
  containerDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  labelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  textDisabled: {
    color: t.text.disabled,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: radius.field,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  fieldFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
    paddingHorizontal: space.md - 1,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
    paddingHorizontal: space.md - 1,
  },
  fieldReadOnly: {
    borderWidth: 0,
    backgroundColor: t.surface.fieldReadOnly,
    paddingHorizontal: space.md + 1,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
    paddingVertical: space.sm,
    paddingHorizontal: 0,
    ...Platform.select({
      android: {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      },
      default: {},
    }),
  },
  leftIcon: {
    marginRight: space.sm,
  },
  iconRight: {
    marginLeft: space.sm,
  },
  clearButton: {
    marginLeft: space.sm,
  },
  messageRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    marginTop: space.xs,
  },
  messageIcon: {
    marginTop: 1,
    marginRight: space.xs,
  },
  helperText: {
    ...typography.footnote,
    flex: 1,
    color: t.text.secondary,
  },
  errorText: {
    color: t.status.negative.text,
  },
  dropdownContainer: {
    position: 'absolute' as const,
    top: '100%' as const,
    left: 0,
    right: 0,
    backgroundColor: t.surface.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border.separator,
    borderRadius: radius.button,
    maxHeight: DROPDOWN_MAX_HEIGHT,
    marginTop: space.xs,
    overflow: 'hidden' as const,
    ...t.shadow[3],
    zIndex: 1000,
  },
  dropdownInline: {
    position: 'relative' as const,
    top: 0,
  },
  dropdownList: {
    maxHeight: DROPDOWN_MAX_HEIGHT,
  },
  dropdownItem: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
  },
  dropdownItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  emptyState: {
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyIcon: {
    marginBottom: space.sm,
  },
  emptyText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default RemoteAutocompleteInput;
