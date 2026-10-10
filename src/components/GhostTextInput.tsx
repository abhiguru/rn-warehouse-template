/**
 * GhostTextInput - Input with inline ghost text autocomplete
 *
 * Shows the suggestion in text.placeholder after the user's input; tap it to
 * accept. Field tokens per style guide §13.2.
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
  Pressable,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

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

    const t = useTokens();
    const styles = useThemedStyles(makeStyles);

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
        // An empty field shows its placeholder, never a full suggestion: a whole
        // registration in an empty field reads as a value someone typed earlier.
        if (!prefix) {
          setSuggestion(null);
          return;
        }
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

      // Suggestions complete what the user started typing only
      if (!value) {
        return '';
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
        const newValue = value + ghostText;
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
          isFocused && styles.containerFocused,
          hasError && styles.containerError,
          containerStyle,
        ]}
      >
        {icon && (
          <Icon
            name={icon}
            size={iconSize.md}
            color={t.icon.secondary}
            style={styles.icon}
          />
        )}

        <View style={styles.inputWrapper}>
          {/* Actual TextInput */}
          <TextInput
            ref={inputRef}
            style={[styles.input, inputStyle]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={!ghostText ? placeholder : undefined}
            placeholderTextColor={t.text.placeholder}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...restProps}
          />

          {/* Ghost text overlay */}
          {ghostText && (
            <Pressable
              style={({ pressed }) => [styles.ghostContainer, pressed && styles.ghostPressed]}
              onPress={handleAcceptSuggestion}
              accessibilityRole="button"
              accessibilityLabel={tr('components.input.useSuggestion', { suggestion })}
            >
              {/* Invisible spacer matching user input */}
              <Text style={[styles.input, styles.invisibleText, inputStyle]}>
                {value}
              </Text>
              {/* Visible ghost text */}
              <Text style={[styles.input, styles.ghostText, inputStyle]}>
                {ghostText}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }
);

GhostTextInput.displayName = 'GhostTextInput';

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
  },
  containerFocused: {
    borderColor: t.border.fieldFocus,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  containerError: {
    borderColor: t.status.negative.border,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  icon: {
    marginRight: space.sm,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative' as const,
    justifyContent: 'center' as const,
  },
  input: {
    ...typography.body,
    color: t.text.primary,
    padding: 0,
  },
  ghostContainer: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  ghostPressed: {
    opacity: 0.6,
  },
  invisibleText: {
    opacity: 0,
  },
  ghostText: {
    color: t.text.placeholder,
  },
});

export default GhostTextInput;
