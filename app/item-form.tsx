/**
 * Item Form Screen - Create Mode
 *
 * Single-page form for creating new items.
 * Fields: name (required), packaging, description, active toggle
 *
 * Based on SAP Fiori for iOS Design Guidelines
 */

import { markItemRatesStale } from '@/features/item-pricing/useItemRates';
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Switch,
  TextInput,
  AccessibilityInfo,
  type TextInputProps,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { ItemRateChoice, type RateChoice } from '@/features/item-pricing/components/ItemRateChoice';
import type { PickableItem } from '@/features/item-pricing/components/ItemPickerSheet';
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
import type { ItemFormData, ItemValidationErrors } from '@/types/item.types';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';
import { isNetworkError, isStatementTimeout, isTimeoutError, serverText } from '@/utils/serverText';
import { useIsOffline } from '@/hooks/useNetworkStatus';
/** The order the fields are on the screen: the first wrong one gets focus. */
const FIELD_ORDER: (keyof ItemValidationErrors)[] = ['name', 'packaging', 'description'];

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
  const offline = useIsOffline();
  const inputs = useRef<Partial<Record<keyof ItemValidationErrors, TextInput | null>>>({});
  // The name (trimmed, lower case) of an Add that got no answer in time: it may have been saved.
  const timedOutName = useRef<string | null>(null);
  // Which rate the new item gets: the standard rate, or the rates of another item (required when chosen).
  const [rateChoice, setRateChoice] = useState<RateChoice>('standard');
  const [rateSource, setRateSource] = useState<PickableItem | null>(null);
  const [rateSourceError, setRateSourceError] = useState<string | undefined>();
  const { groups, suggestions } = usePackagingWords();

  // Typed work is not thrown away without asking; an untouched form leaves at once.
  const hasChanges =
    !!formData.name.trim() || !!formData.packaging.trim() || !!formData.description.trim() || !formData.active || rateChoice !== 'standard';
  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges,
    title: tr('items.form.discardNewTitle'),
    message: tr('items.form.discardNewMessage'),
    // Back waits for a save that is running, instead of asking to discard what is being saved.
    blocked: saving,
  });

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

  // Validation: the number of fields to fix (0 when the form is right); the first wrong field gets focus.
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
    const rateWrong = rateChoice === 'item' && !rateSource;
    setRateSourceError(rateWrong ? tr('items.form.rateItemRequired') : undefined);
    const wrong = FIELD_ORDER.filter((field) => newErrors[field]);
    if (wrong.length > 0) inputs.current[wrong[0]]?.focus();
    const count = wrong.length + (rateWrong ? 1 : 0);
    if (count > 0) AccessibilityInfo.announceForAccessibility(tr('items.form.fixFields', { count }));
    return count;
  }, [formData, rateChoice, rateSource]);

  // Handle save
  const handleSave = async () => {
    // Taken first: a second tap while the first is sending does nothing.
    if (saving) return;
    if (validateForm() > 0) {
      return;
    }
    // Nothing is sent from a phone that is offline.
    if (offline) {
      showAlert(tr('items.form.couldNotAddTitle'), tr('items.offline.connectToSave'));
      return;
    }

    setSaving(true);
    try {
      const result = await itemService.createItem({
        p_name: formData.name.trim(),
        p_packaging: normalizePackaging(formData.packaging, groups) || undefined,
        p_description: formData.description.trim() || undefined,
        p_active: formData.active,
        ...(rateChoice === 'item' && rateSource ? { p_rate_from_item: rateSource.id } : {}),
      });

      if (result.success) {
        timedOutName.current = null;
        // The new item may have got a rate: the Items list and the Pricing tabs read the rates again.
        markItemRatesStale();
        leaveWithoutAsking(() => router.back());
        const name = formData.name.trim();
        const rateSourceDone = result.data?.rate_source;
        showToast(
          rateSourceDone === 'standard'
            ? tr('items.form.addedStandardToast', { name })
            : rateSourceDone === 'copied'
              ? tr('items.form.addedCopiedToast', { name, item: rateSource?.name ?? '' })
              : rateSourceDone === 'none'
                ? tr('items.form.addedNoRateToast', { name })
                : tr('items.form.addedToast', { name }),
        );
      } else if (result.code === 'DUPLICATE_NAME') {
        const name = formData.name.trim();
        if (timedOutName.current !== null && timedOutName.current === name.toLowerCase()) {
          // The last try for this name got no answer (in time, or the connection dropped), and the name is taken now: it was probably saved.
          showAlert(tr('items.form.couldNotAddTitle'), tr('items.form.alreadyAdded', { name }), [
            { text: tr('common.keepEditing'), style: 'cancel' },
            { text: tr('items.form.goToItems'), onPress: () => leaveWithoutAsking(() => router.dismissTo('/items')) },
          ]);
        } else {
          setErrors({ name: tr('items.form.duplicateName') });
          inputs.current.name?.focus();
        }
      } else {
        // No answer in time or a dropped connection: the item may have been saved. A server cancel (57014) rolled back.
        if ((isTimeoutError(result) && !isStatementTimeout(result)) || isNetworkError(result)) timedOutName.current = formData.name.trim().toLowerCase();
        showAlert(tr('items.form.couldNotAddTitle'), serverText(result, tr('items.list.tryAgainInAMoment'), { write: true, form: true }));
      }
    } catch (err) {
      console.error('[ItemForm] Save error:', err);
      if ((isTimeoutError(err) && !isStatementTimeout(err)) || isNetworkError(err)) timedOutName.current = formData.name.trim().toLowerCase();
      showAlert(tr('items.form.couldNotAddTitle'), serverText(err, tr('common.checkConnection'), { write: true, form: true }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]} testID="item-header">
        <View style={styles.headerSide}>
          <HeaderBackButton />
        </View>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {tr('items.form.addTitle')}
        </Text>
        <View style={styles.headerSide} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
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

          <View style={styles.card}>
            <ItemRateChoice
              choice={rateChoice}
              onChoice={choice => { setRateChoice(choice); setRateSourceError(undefined); }}
              source={rateSource}
              onSource={item => { setRateSource(item); setRateSourceError(undefined); }}
              error={rateSourceError}
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

        {/* Under the form, not floating over it (style guide §14.4) */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]} testID="item-bottom-bar">
          <Button size="fullWidth" onPress={handleSave} loading={saving} disabled={saving}>
            {tr('items.form.addItem')}
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
