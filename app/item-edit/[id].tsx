/**
 * Item Edit Screen
 *
 * Single-page form for editing existing items.
 * Loads item data by ID and allows updating.
 * Fields: name (required), packaging, description, active toggle
 *
 * Based on SAP Fiori for iOS Design Guidelines
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Switch,
  TextInput,
  type TextInputProps,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
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
import type { ItemFormData, ItemValidationErrors, Item } from '@/types/item.types';

const ItemEditScreen: React.FC = () => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Original item data for comparison
  const [originalItem, setOriginalItem] = useState<Item | null>(null);

  // Form state
  const [formData, setFormData] = useState<ItemFormData>({
    name: '',
    packaging: '',
    description: '',
    active: true,
  });
  const [errors, setErrors] = useState<ItemValidationErrors>({});

  // Load item data
  useEffect(() => {
    if (id) {
      loadItemData();
    }
  }, [id]);

  // Debug: Log when formData changes
  useEffect(() => {
    console.log('[ItemEdit] formData state updated:', formData);
  }, [formData]);

  const loadItemData = async () => {
    try {
      setLoading(true);
      console.log('[ItemEdit] Loading item with ID:', id);
      const result = await itemService.getItemById(id!);
      console.log('[ItemEdit] getItemById result:', JSON.stringify(result, null, 2));

      if (result.success && result.data) {
        const item = result.data;
        console.log('[ItemEdit] Parsed item data:', {
          id: item.id,
          name: item.name,
          packaging: item.packaging,
          description: item.description,
          active: item.active,
        });
        setOriginalItem(item);
        setFormData({
          name: item.name || '',
          packaging: item.packaging || '',
          description: item.description || '',
          active: item.active ?? true,
        });
      } else {
        console.error('[ItemEdit] Failed to load item:', result.message);
        Alert.alert("Couldn't find this item", 'It may have been deleted.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('[ItemEdit] Load error:', err);
      Alert.alert("Couldn't load the item", 'Check your connection and try again.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
      newErrors.name = 'Enter the item name.';
    } else if (formData.name.length > 80) {
      newErrors.name = 'Use 80 characters or fewer.';
    }

    // Packaging validation
    if (formData.packaging && formData.packaging.length > 40) {
      newErrors.packaging = 'Use 40 characters or fewer.';
    }

    // Description validation
    if (formData.description && formData.description.length > 40) {
      newErrors.description = 'Use 40 characters or fewer.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Check if form has changes
  const hasChanges = useCallback((): boolean => {
    if (!originalItem) return false;

    return (
      formData.name.trim() !== (originalItem.name || '') ||
      formData.packaging.trim() !== (originalItem.packaging || '') ||
      formData.description.trim() !== (originalItem.description || '') ||
      formData.active !== originalItem.active
    );
  }, [formData, originalItem]);

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    if (!hasChanges()) {
      Alert.alert('Nothing to save', "You haven't changed anything.");
      return;
    }

    setSaving(true);
    try {
      const result = await itemService.updateItem({
        p_item_id: id!,
        p_name: formData.name.trim(),
        p_packaging: formData.packaging.trim() || undefined,
        p_description: formData.description.trim() || undefined,
        p_active: formData.active,
      });

      if (result.success) {
        Alert.alert('Item saved', `${formData.name.trim()} has been updated.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Check for duplicate name error
        if (
          result.message?.toLowerCase().includes('duplicate') ||
          result.message?.toLowerCase().includes('unique') ||
          result.message?.toLowerCase().includes('already exists')
        ) {
          setErrors({ name: 'An item with this name already exists. Use a different name.' });
        } else {
          Alert.alert("Couldn't save the item", result.message || 'Try again in a moment.');
        }
      }
    } catch (err) {
      console.error('[ItemEdit] Save error:', err);
      Alert.alert("Couldn't save the item", 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle back with unsaved changes
  const handleBack = () => {
    if (hasChanges()) {
      Alert.alert(
        'Discard your changes?',
        'Your unsaved changes to this item will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  if (loading || !originalItem) {
    return (
      <View
        style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading item"
      >
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>Loading item…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <Pressable
          style={styles.iconButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="arrow-left" size={iconSize.lg} color={t.icon.primary} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
          Edit item
        </Text>
        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save item"
          accessibilityState={{ busy: saving }}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.saveButtonText}>Saving…</Text>
            </>
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          key={`form-${originalItem?.id || 'new'}`}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: space.max + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <ItemTextField
              label="Item name"
              required
              value={formData.name}
              onChangeText={(text) => handleFieldChange('name', text)}
              placeholder="Enter item name"
              maxLength={80}
              error={errors.name}
              autoCapitalize="words"
            />
            <ItemTextField
              label="Packaging"
              value={formData.packaging}
              onChangeText={(text) => handleFieldChange('packaging', text)}
              placeholder="For example box, bag or carton"
              maxLength={40}
              error={errors.packaging}
            />
            <ItemTextField
              label="Description"
              value={formData.description}
              onChangeText={(text) => handleFieldChange('description', text)}
              placeholder="Brief description"
              maxLength={40}
              error={errors.description}
            />
          </View>

          {/* Active Toggle */}
          <Pressable
            style={styles.switchRow}
            onPress={() => handleFieldChange('active', !formData.active)}
            accessibilityRole="switch"
            accessibilityLabel="Active"
            accessibilityHint="Inactive items don't appear in searches"
            accessibilityState={{ checked: formData.active }}
          >
            <View style={styles.switchLabel}>
              <Text style={styles.switchTitle}>Active</Text>
              <Text style={styles.switchDescription}>Inactive items don't appear in searches.</Text>
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
        accessibilityLabel={required ? `${label}, required` : label}
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
          accessibilityLabel={`${value.length} of ${maxLength} characters`}
        >
          {value.length}/{maxLength}
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
  iconButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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

export default ItemEditScreen;
