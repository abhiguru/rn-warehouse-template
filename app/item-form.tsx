/**
 * Item Form Screen - Create Mode
 *
 * Single-page form for creating new items.
 * Fields: name (required), packaging, description, active toggle
 *
 * Based on SAP Fiori for iOS Design Guidelines
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Switch,
  TextInput,
  type TextInputProps,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
} from '@/theme/tokens';
import { itemService } from '@/services/item-service';
import type { ItemFormData, ItemValidationErrors } from '@/types/item.types';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
const ItemFormScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Form state
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ItemFormData>({
    name: '',
    packaging: '',
    description: '',
    active: true,
  });
  const [errors, setErrors] = useState<ItemValidationErrors>({});

  // Field change handlers
  const handleFieldChange = useCallback(
    (field: keyof ItemFormData, value: string | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // Clear error when user types
      if (errors[field as keyof ItemValidationErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: ItemValidationErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = tr('items.form.nameRequired');
    } else if (formData.name.length > 80) {
      newErrors.name = tr('items.form.maxLength', { max: 80 });
    }

    // Packaging validation
    if (formData.packaging && formData.packaging.length > 40) {
      newErrors.packaging = tr('items.form.maxLength', { max: 40 });
    }

    // Description validation
    if (formData.description && formData.description.length > 40) {
      newErrors.description = tr('items.form.maxLength', { max: 40 });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const result = await itemService.createItem({
        p_name: formData.name.trim(),
        p_packaging: formData.packaging.trim() || undefined,
        p_description: formData.description.trim() || undefined,
        p_active: formData.active,
      });

      if (result.success) {
        showAlert(tr('items.form.addedTitle'), tr('items.form.addedMessage', { name: formData.name.trim() }), [
          { text: tr('common.ok'), onPress: () => router.back() },
        ]);
      } else {
        // Check for duplicate name error
        if (result.message?.toLowerCase().includes('duplicate') ||
            result.message?.toLowerCase().includes('unique') ||
            result.message?.toLowerCase().includes('already exists')) {
          setErrors({ name: tr('items.form.duplicateName') });
        } else {
          showAlert(tr('items.form.couldNotAddTitle'), result.message || tr('items.list.tryAgainInAMoment'));
        }
      }
    } catch (err) {
      console.error('[ItemForm] Save error:', err);
      showAlert(tr('items.form.couldNotAddTitle'), tr('common.checkConnection'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <HeaderBackButton />
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {tr('items.form.addTitle')}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={tr('items.form.saveItem')}
          accessibilityState={{ busy: saving }}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.saveButtonText}>{tr('common.saving')}</Text>
            </>
          ) : (
            <Text style={styles.saveButtonText}>{tr('common.save')}</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: space.max + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <ItemTextField
              label={tr('items.form.itemName')}
              required
              value={formData.name}
              onChangeText={(text) => handleFieldChange('name', text)}
              placeholder={tr('items.form.itemNamePlaceholder')}
              maxLength={80}
              error={errors.name}
              autoCapitalize="words"
            />
            <ItemTextField
              label={tr('common.packaging')}
              value={formData.packaging}
              onChangeText={(text) => handleFieldChange('packaging', text)}
              placeholder={tr('items.form.packagingPlaceholder')}
              maxLength={40}
              error={errors.packaging}
            />
            <ItemTextField
              label={tr('items.form.description')}
              value={formData.description}
              onChangeText={(text) => handleFieldChange('description', text)}
              placeholder={tr('items.form.descriptionPlaceholder')}
              maxLength={40}
              error={errors.description}
            />
          </View>

          {/* Active Toggle */}
          <Pressable
            style={styles.switchRow}
            onPress={() => handleFieldChange('active', !formData.active)}
            accessibilityRole="switch"
            accessibilityLabel={tr('common.active')}
            accessibilityHint={tr('items.form.activeHint')}
            accessibilityState={{ checked: formData.active }}
          >
            <View style={styles.switchLabel}>
              <Text style={styles.switchTitle}>{tr('common.active')}</Text>
              <Text style={styles.switchDescription}>{tr('items.form.activeDescription')}</Text>
            </View>
            <Switch
              value={formData.active}
              onValueChange={(value) => handleFieldChange('active', value)}
              trackColor={{ false: t.control.trackOff, true: t.brand.fill }}
              thumbColor={t.control.thumb}
              ios_backgroundColor={t.control.trackOff}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

type ItemTextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  required?: boolean;
  error?: string;
  maxLength: number;
  value: string;
};

/** Labelled text field with focus, error and character count (style guide §13.2). */
function ItemTextField({ label, required, error, maxLength, value, onFocus, onBlur, ...inputProps }: ItemTextFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.formSection}>
      <Text style={[styles.label, !!error && styles.labelError]}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        {...inputProps}
        value={value}
        maxLength={maxLength}
        placeholderTextColor={t.text.placeholder}
        accessibilityLabel={required ? tr('items.form.requiredLabel', { label }) : label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.textInput, focused && styles.textInputFocused, !!error && styles.textInputError]}
      />
      <View style={styles.helperRow}>
        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.flex} />
        )}
        <Text
          style={styles.charCount}
          accessibilityLabel={tr('items.form.charCountLabel', { count: value.length, max: maxLength })}
        >
          {tr('items.form.charCount', { count: value.length, max: maxLength })}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    ...typography.subhead,
    marginTop: space.lg,
    color: t.text.secondary,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
    gap: space.xs,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  headerTitle: {
    ...typography.headline,
    flex: 1,
    color: t.text.primary,
  },
  saveButton: {
    flexDirection: 'row' as const,
    gap: space.sm,
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.xl,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: space.xs,
    backgroundColor: t.brand.fill,
  },
  saveButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  saveButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
    gap: space.lg,
  },
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.lg,
    ...t.shadow[2],
  },
  formSection: {},
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
  textInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
    color: t.text.primary,
  },
  textInputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
  },
  textInputError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  helperRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    marginTop: space.xs,
  },
  errorRow: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  charCount: {
    ...typography.caption1,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: layout.rowMinHeight,
    borderRadius: radius.card,
    padding: space.lg,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  switchLabel: {
    flex: 1,
    marginRight: space.lg,
  },
  switchTitle: {
    ...typography.body,
    color: t.text.primary,
  },
  switchDescription: {
    ...typography.footnote,
    marginTop: space.xxs,
    color: t.text.secondary,
  },
});

export default ItemFormScreen;
