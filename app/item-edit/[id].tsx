/**
 * Item Edit Screen
 *
 * Single-page form for editing existing items.
 * Loads item data by ID and allows updating.
 * Fields: name (required), packaging, description. Whether the item is active, and deleting it, are on the item
 * page (app/item/[id].tsx); this form does not send p_active at all, so the server keeps the item's active state
 * (update_item, backend Items screens 2026-10-20). It always sends the packaging and the description it shows,
 * because update_item clears what is not sent. A failed read of the item keeps the screen with Try again; only
 * a real "not found" says the item may have been deleted.
 *
 * Based on SAP Fiori for iOS Design Guidelines
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInput,
  AccessibilityInfo,
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
import { useIsOffline } from '@/hooks/useNetworkStatus';
/** The order the fields are on the screen: the first wrong one gets focus. */
const FIELD_ORDER: (keyof ItemValidationErrors)[] = ['name', 'packaging', 'description'];

const ItemEditScreen: React.FC = () => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The read of the item failed (no connection, a timeout): the screen stays, with Try again.
  const [loadFailed, setLoadFailed] = useState(false);
  // The server answered and there is no such item (someone deleted it).
  const [notFound, setNotFound] = useState(false);
  const offline = useIsOffline();
  const inputs = useRef<Partial<Record<keyof ItemValidationErrors, TextInput | null>>>({});

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
      setLoadFailed(false);
      setNotFound(false);
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
      } else if (result.code === 'NOT_FOUND') {
        // The server answered: there is no such item. The page says so, with Go back.
        setNotFound(true);
      } else {
        console.error('[ItemEdit] Failed to load item:', result.message);
        setLoadFailed(true);
      }
    } catch (err) {
      console.error('[ItemEdit] Load error:', err);
      setLoadFailed(true);
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
  const validateForm = useCallback((): number => {
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
    // The first wrong field gets focus, and the number to fix is announced.
    const wrong = FIELD_ORDER.filter((field) => newErrors[field]);
    if (wrong.length > 0) {
      inputs.current[wrong[0]]?.focus();
      AccessibilityInfo.announceForAccessibility(tr('items.form.fixFields', { count: wrong.length }));
    }
    return wrong.length;
  }, [formData]);

  // Check if form has changes
  const hasChanges = useCallback((): boolean => {
    if (!originalItem) return false;

    return (
      // Both sides trimmed: an item stored as "Garlic " is not changed by opening it (CR-27).
      formData.name.trim() !== (originalItem.name || '').trim() ||
      formData.packaging.trim() !== (originalItem.packaging || '').trim() ||
      formData.description.trim() !== (originalItem.description || '').trim()
    );
  }, [formData, originalItem]);

  // Every way out asks first when something changed: the header Back, the phone's Back key, the swipe.
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: hasChanges(),
    message: tr('items.form.discardMessage'),
    // Back waits for a save that is running, instead of asking to discard what is being saved.
    blocked: saving,
  });

  // Handle save
  const handleSave = async () => {
    // Taken first: a second tap while the first is sending does nothing.
    if (saving) return;
    if (validateForm() > 0) {
      return;
    }

    // Nothing changed: there is nothing to save, so just go back.
    if (!hasChanges()) {
      router.back();
      return;
    }

    // Nothing is sent from a phone that is offline.
    if (offline) {
      showAlert(tr('items.form.couldNotSaveTitle'), tr('items.offline.connectToSave'));
      return;
    }

    setSaving(true);
    try {
      // No p_active: the server keeps it. Packaging and description are always sent (an empty one clears it).
      const result = await itemService.updateItem({
        p_item_id: id!,
        p_name: formData.name.trim(),
        p_packaging: normalizePackaging(formData.packaging, groups),
        p_description: formData.description.trim(),
      });

      if (result.success) {
        leaveWithoutAsking(() => router.back());
        showToast(tr('items.form.savedToast', { name: formData.name.trim() }));
      } else if (result.code === 'DUPLICATE_NAME') {
        setErrors({ name: tr('items.form.duplicateName') });
        inputs.current.name?.focus();
      } else if (result.code === 'NOT_FOUND') {
        // Someone deleted the item while this form was open: back to the Items list, which drops the row.
        showAlert(tr('items.form.couldNotSaveTitle'), tr('items.form.someoneDeleted'), [
          { text: tr('common.goBack'), onPress: () => leaveWithoutAsking(() => router.dismissTo('/items')) },
        ]);
      } else {
        showAlert(tr('items.form.couldNotSaveTitle'), serverText(result, tr('items.list.tryAgainInAMoment'), { write: true, form: true }));
      }
    } catch (err) {
      console.error('[ItemEdit] Save error:', err);
      showAlert(tr('items.form.couldNotSaveTitle'), serverText(err, tr('common.checkConnection'), { write: true, form: true }));
    } finally {
      setSaving(false);
    }
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

  if (notFound && !loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.flex, styles.loadingContainer]} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={[styles.loadingText, styles.loadFailedText]}>{tr('items.form.notFoundSentence')}</Text>
          <Button type="secondary" onPress={() => router.dismissTo('/items')}>
            {tr('common.goBack')}
          </Button>
        </View>
      </View>
    );
  }

  if (loadFailed && !loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.flex, styles.loadingContainer]} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={[styles.loadingText, styles.loadFailedText]}>{tr('items.page.loadFailed')}</Text>
          <Button type="secondary" leftIcon="refresh" onPress={() => void loadItemData()}>
            {tr('common.retry')}
          </Button>
        </View>
      </View>
    );
  }

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
              inputRef={(node) => (inputs.current.name = node)}
            />
            <ItemTextField
              label={tr('common.packaging')}
              value={formData.packaging}
              onChangeText={(text) => handleFieldChange('packaging', text)}
              placeholder={tr('items.form.packagingPlaceholder')}
              maxLength={40}
              error={errors.packaging}
              inputRef={(node) => (inputs.current.packaging = node)}
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
              inputRef={(node) => (inputs.current.description = node)}
            />
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
  inputRef?: (node: TextInput | null) => void;
};

/** Labelled text field with focus, error and character count (style guide §13.2). */
function ItemTextField({ label, required, error, maxLength, value, inputRef, onFocus, onBlur, ...inputProps }: ItemTextFieldProps) {
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
        ref={inputRef}
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
  loadFailedText: {
    textAlign: 'center' as const,
    marginBottom: space.lg,
    paddingHorizontal: layout.marginCompact,
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
});

export default ItemEditScreen;
