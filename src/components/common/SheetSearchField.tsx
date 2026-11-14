/**
 * SheetSearchField - the one search field of every searchable sheet
 * (docs/product design consistency-e §2.2; reference: SearchableBottomSheet).
 *
 * surface.field fill, radius.field, at least touchTarget high, the magnify icon
 * in icon.secondary, an optional spinner, a clear X when there is text and the
 * placeholder in text.placeholder. The label read aloud is the placeholder; the
 * clear X reads "Clear search".
 *
 * Two forms: with `onChangeText` it draws a text input (`InputComponent` is
 * gorhom's BottomSheetTextInput inside a gorhom sheet); without it the value is
 * only shown (a sheet whose text comes from its own keypad), as a search region.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

export interface SheetSearchFieldProps {
  value: string;
  placeholder: string;
  onClear: () => void;
  /** Present: a text input. Absent: the value is only displayed. */
  onChangeText?: (text: string) => void;
  /** Spoken label of the display form when it holds text (default: the value). */
  displayLabel?: string;
  /** The input component (default TextInput). */
  InputComponent?: React.ComponentType<TextInputProps>;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'style'>;
  loading?: boolean;
  loadingLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const makeStyles = (t: ThemeTokens) => ({
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.surface.field,
    borderRadius: radius.field,
    paddingLeft: space.md,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: t.border.field,
  },
  input: { ...typography.body, flex: 1, color: t.text.primary },
  placeholder: { color: t.text.placeholder },
});

const styles = StyleSheet.create({
  icon: { marginRight: space.sm },
  loader: { marginHorizontal: space.md },
  clearButton: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
});

export const SheetSearchField = React.forwardRef<unknown, SheetSearchFieldProps>(function SheetSearchField(
  { value, placeholder, onClear, onChangeText, displayLabel, InputComponent = TextInput, inputProps, loading, loadingLabel, style },
  ref
) {
  const themed = useThemedStyles(makeStyles);
  const t = useTokens();
  const Input = InputComponent as React.ComponentType<TextInputProps & { ref?: React.Ref<unknown> }>;
  const editable = onChangeText !== undefined;
  return (
    <View
      style={[themed.field, style]}
      {...(editable ? {} : { accessible: true, accessibilityRole: 'search' as const, accessibilityLabel: displayLabel ?? (value.length > 0 ? value : placeholder) })}
    >
      <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.icon} />
      {editable ? (
        <Input
          ref={ref}
          style={themed.input}
          placeholder={placeholder}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={placeholder}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="search"
          {...inputProps}
        />
      ) : (
        <Text style={[themed.input, value.length === 0 && themed.placeholder]}>{value.length > 0 ? value : placeholder}</Text>
      )}
      {loading ? <ActivityIndicator size="small" color={t.brand.tint} style={styles.loader} accessibilityLabel={loadingLabel} /> : null}
      {value.length > 0 ? (
        <Pressable style={styles.clearButton} onPress={onClear} accessibilityRole="button" accessibilityLabel={tr('common.clearSearch')}>
          <Icon name="close-circle" size={iconSize.md} color={t.icon.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
});

export default SheetSearchField;
