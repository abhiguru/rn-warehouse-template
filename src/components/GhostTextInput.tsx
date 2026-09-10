/**
 * GhostTextInput - Input with inline ghost text autocomplete
 *
 * Shows suggestion as faded text after user's input.
 * Tap ghost text to accept the suggestion.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';

export interface GhostTextInputProps
  extends Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> {
  /** Current input value */
  value: string;
  /** Called when text changes */
  onChangeText: (text: string) => void;
  /** Async function that returns suggestion for given prefix and optional context */
  getSuggestion: (prefix: string, context?: string | null) => Promise<string | null>;
  /** Optional context ID (e.g., customerId) passed to getSuggestion */
  suggestionContext?: string | null;
  /** Icon name (MaterialCommunityIcons) */
  icon?: string;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Container style */
  containerStyle?: ViewStyle;
  /** Input style */
  inputStyle?: TextStyle;
  /** Whether input has validation error */
  hasError?: boolean;
  /** Whether input is focused (for external focus state) */
  isFocused?: boolean;
}

export interface GhostTextInputRef {
  focus: () => void;
  blur: () => void;
}

export const GhostTextInput = forwardRef<GhostTextInputRef, GhostTextInputProps>(
  (
    {
      value,
      onChangeText,
      getSuggestion,
      suggestionContext,
      icon,
      debounceMs = 300,
      containerStyle,
      inputStyle,
      hasError = false,
      isFocused: externalFocused,
      placeholder,
      maxLength,
      autoCapitalize = 'characters',
      onFocus,
      onBlur,
      ...restProps
    },
    ref
  ) => {
    const inputRef = useRef<TextInput>(null);
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [internalFocused, setInternalFocused] = useState(false);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestRequest = useRef<{ prefix: string; context: string | null | undefined }>({
      prefix: '',
      context: undefined,
    });

    // Dark mode support
    const colors = useListColors();

    // Expose focus/blur methods
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }));

    const isFocused = externalFocused ?? internalFocused;

    // Fetch suggestion for given prefix and context
    const fetchSuggestion = useCallback(
      async (prefix: string, context: string | null | undefined) => {
        latestRequest.current = { prefix, context };
        try {
          const result = await getSuggestion(prefix, context);
          // Only update if this is still the latest request
          if (
            latestRequest.current.prefix === prefix &&
            latestRequest.current.context === context
          ) {
            setSuggestion(result);
          }
        } catch (err) {
          console.error('[GhostTextInput] Error fetching suggestion:', err);
          if (
            latestRequest.current.prefix === prefix &&
            latestRequest.current.context === context
          ) {
            setSuggestion(null);
          }
        }
      },
      [getSuggestion]
    );

    // Fetch suggestion on mount and when context changes
    useEffect(() => {
      fetchSuggestion(value, suggestionContext);
    }, [suggestionContext]); // Re-fetch when context (e.g., customerId) changes

    // Debounced fetch on value change
    useEffect(() => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        fetchSuggestion(value, suggestionContext);
      }, debounceMs);

      return () => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
      };
    }, [value, debounceMs, suggestionContext, fetchSuggestion]);

    // Calculate ghost text to display
    const getGhostText = (): string => {
      if (!suggestion) return '';

      const upperValue = value.toUpperCase();
      const upperSuggestion = suggestion.toUpperCase();

      // If value is empty, show full suggestion as ghost
      if (!value) {
        return suggestion;
      }

      // If suggestion starts with current value, show remainder
      if (upperSuggestion.startsWith(upperValue)) {
        return suggestion.slice(value.length);
      }

      // No match - no ghost text
      return '';
    };

    const ghostText = getGhostText();

    // Handle tap on ghost text to accept suggestion
    const handleAcceptSuggestion = () => {
      if (suggestion && ghostText) {
        // If empty, use full suggestion; otherwise append ghost
        const newValue = value ? value + ghostText : suggestion;
        onChangeText(newValue.toUpperCase());
      }
    };

    // Handle focus
    const handleFocus: TextInputProps['onFocus'] = (e) => {
      setInternalFocused(true);
      onFocus?.(e);
    };

    // Handle blur
    const handleBlur: TextInputProps['onBlur'] = (e) => {
      setInternalFocused(false);
      onBlur?.(e);
    };

    // Handle text change with uppercase conversion
    const handleChangeText = (text: string) => {
      onChangeText(autoCapitalize === 'characters' ? text.toUpperCase() : text);
    };

    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.cellBackground,
            borderColor: colors.cellDivider,
          },
          isFocused && styles.containerFocused,
          hasError && styles.containerError,
          containerStyle,
        ]}
      >
        {icon && (
          <Icon
            name={icon}
            size={20}
            color={colors.textTertiary}
            style={styles.icon}
          />
        )}

        <View style={styles.inputWrapper}>
          {/* Actual TextInput */}
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.textPrimary }, inputStyle]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={!ghostText ? placeholder : undefined}
            placeholderTextColor={colors.textTertiary}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...restProps}
          />

          {/* Ghost text overlay */}
          {ghostText && (
            <TouchableOpacity
              style={styles.ghostContainer}
              onPress={handleAcceptSuggestion}
              activeOpacity={0.6}
            >
              {/* Invisible spacer matching user input */}
              <Text style={[styles.input, styles.invisibleText, { color: colors.textPrimary }, inputStyle]}>
                {value}
              </Text>
              {/* Visible ghost text */}
              <Text style={[styles.input, styles.ghostText, { color: colors.textTertiary }, inputStyle]}>
                {ghostText}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }
);

GhostTextInput.displayName = 'GhostTextInput';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    // backgroundColor and borderColor applied dynamically
  },
  containerFocused: {
    borderColor: '#0057D2',
    borderWidth: 2,
  },
  containerError: {
    borderColor: theme.colors.fiori.semantic.negative,
    borderWidth: 2,
  },
  icon: {
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    fontSize: theme.fontSize.base,
    padding: 0,
    // Ensure consistent line height across platforms
    lineHeight: Platform.OS === 'ios' ? 22 : 24,
    // color applied dynamically
  },
  ghostContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-only', // Allow taps but don't block input
  },
  invisibleText: {
    opacity: 0,
  },
  ghostText: {
    opacity: 0.6,
    // color applied dynamically
  },
});

export default GhostTextInput;
