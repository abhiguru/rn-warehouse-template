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
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { deleteItemFlow } from '@/features/items/deleteItemFlow';
import { matchingPackaging, normalizePackaging, usePackagingWords } from '@/features/items/packagingSuggestions';
import { showToast } from '@/utils/toast';
import {
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

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
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
  const { groups, suggestions } = usePackagingWords();

  // Load item data
  useEffect(() => {
    if (id) {
      loadItemData();
    }
  }, [id]);

  const loadItemData = async () => {
    try {
      setLoading(true);
      const result = await itemService.getItemById(id!);

      if (result.success && result.data) {
        const item = result.data;
        setOriginalItem(item);
        setFormData({
          name: item.name || '',
          packaging: item.packaging || '',
          description: item.description || '',
          active: item.active ?? true,
        });
      } else {
        console.error('[ItemEdit] Failed to load item:', result.message);
        showAlert(tr('items.form.notFoundTitle'), tr('items.form.notFoundMessage'), [
          { text: tr('common.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('[ItemEdit] Load error:', err);
      showAlert(tr('items.form.couldNotLoadTitle'), tr('common.checkConnection'), [
        { text: tr('common.ok'), onPress: () => router.back() },
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

  // Check if form has changes
  const hasChanges = useCallback((): boolean => {
    if (!originalItem) return false;

    return (
      // Both sides trimmed: an item stored as "Garlic " is not changed by opening it (CR-27).
      formData.name.trim() !== (originalItem.name || '').trim() ||
      formData.packaging.trim() !== (originalItem.packaging || '').trim() ||
      formData.description.trim() !== (originalItem.description || '').trim() ||
      formData.active !== originalItem.active
    );
  }, [formData, originalItem]);

  // Every way out asks first when something changed: the header Back, the phone's Back key, the swipe.
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: hasChanges(),
    message: tr('items.form.discardMessage'),
  });

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    // Nothing changed: there is nothing to save, so just go back.
    if (!hasChanges()) {
      router.back();
      return;
    }

    setSaving(true);
    try {
      const result = await itemService.updateItem({
        p_item_id: id!,
        p_name: formData.name.trim(),
        p_packaging: normalizePackaging(formData.packaging, groups) || undefined,
        p_description: formData.description.trim() || undefined,
        p_active: formData.active,
      });

      if (result.success) {
        leaveWithoutAsking(() => router.back());
        showToast(tr('items.form.savedToast', { name: formData.name.trim() }));
      } else {
        // Check for duplicate name error
        if (
          result.message?.toLowerCase().includes('duplicate') ||
          result.message?.toLowerCase().includes('unique') ||
          result.message?.toLowerCase().includes('already exists')
        ) {
          setErrors({ name: tr('items.form.duplicateName') });
        } else {
          showAlert(tr('items.form.couldNotSaveTitle'), serverText(result.message, tr('items.list.tryAgainInAMoment')));
        }
      }
    } catch (err) {
      console.error('[ItemEdit] Save error:', err);
      showAlert(tr('items.form.couldNotSaveTitle'), tr('common.checkConnection'));
    } finally {
      setSaving(false);
    }
  };

  // Deleting asks first (it takes the item's prices with it); an item in use can be deactivated instead.
  const handleDelete = () => {
    if (!originalItem) return;
    deleteItemFlow(
      { id: originalItem.id, name: originalItem.name },
      {
        onDeleted: () => leaveWithoutAsking(() => router.back()),
        onDeactivate: async () => {
          const result = await itemService.toggleItemActive(originalItem.id, false);
          if (result.success) {
            setOriginalItem({ ...originalItem, active: false });
            setFormData((prev) => ({ ...prev, active: false }));
            showToast(tr('items.form.deactivatedToast', { name: originalItem.name }));
          } else {
            showAlert(tr('items.list.couldNotDeactivateTitle'), serverText(result.message, tr('items.list.tryAgainInAMoment')));
          }
        },
      }
    );
  };

  // The header is the same while the item loads, so Back is always there.
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]} testID="item-header">
      <View style={styles.headerSide}>
        <HeaderBackButton />
      </View>
      <Text style={styles.headerTitle} accessibilityRole="header">
        {tr('items.form.editTitle')}
      </Text>
      <View style={styles.headerSide} />
    </View>
  );

  if (loading || !originalItem) {
    return (
      <View style={styles.container}>
        {header}
        <View
          style={[styles.flex, styles.loadingContainer]}
          accessibilityRole="progressbar"
          accessibilityLabel={tr('items.form.loadingLabel')}
        >
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('items.form.loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          key={`form-${originalItem?.id || 'new'}`}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
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
            {suggestions.length > 0 && (
              <ChoiceChips
                options={suggestions.map((word) => ({ value: word, label: word }))}
                value={matchingPackaging(formData.packaging, groups)}
                onChange={(word) => handleFieldChange('packaging', word)}
                accessibilityLabel={tr('items.form.packagingSuggestions')}
              />
            )}
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

          <View style={styles.deleteRow}>
            <Button type="tertiary" variant="negative" leftIcon="trash-can-outline" onPress={handleDelete} disabled={saving}>
              {tr('items.delete.deleteItem')}
            </Button>
          </View>
        </ScrollView>

        {/* Under the form, not floating over it (style guide §14.4) */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]} testID="item-bottom-bar">
          <Button size="fullWidth" onPress={handleSave} loading={saving} disabled={saving}>
            {tr('items.form.saveItem')}
          </Button>
        </View>
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
    flexShrink: 1,
    textAlign: 'center' as const,
    color: t.text.primary,
  },
  // Both sides take an equal share, so the title stays centred whatever the Back button's width.
  headerSide: {
    flex: 1,
    alignItems: 'flex-start' as const,
  },
  bottomBar: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  deleteRow: {
    marginTop: space.xxl,
    alignItems: 'center' as const,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
    paddingBottom: space.xl,
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
