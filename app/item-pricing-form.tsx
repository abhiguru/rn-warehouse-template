import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  AccessibilityInfo,
  Platform,
  Pressable,
  ActivityIndicator,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetBackdrop,
  BottomSheetModalProvider,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  trackedText,
} from '@/theme/tokens';
import {
  getItemStoragePrices,
  createItemStoragePrice,
  updateItemStoragePrice,
} from '@/services/item-pricing-service';
import type {
  ItemStoragePrice,
  CreateItemPricingPayload,
  UpdateItemPricingPayload,
} from '@/types/item-pricing.types';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { mapCustomerSearchResponse } from '@/features/item-pricing/utils/customerSearch';
import { createLogger } from '@/utils/logger';

import { showAlert } from '@/utils/alert';
import { formatDate, toLocalISODate } from '@/utils/formatters';
import { numericInput, t as tr } from '@/i18n';
import { priceTypeLabel } from '@/features/item-pricing/utils/priceLabels';
const itemPricingFormLogger = createLogger('ItemPricingForm');

interface Item {
  id: string;
  name: string;
  packaging?: string;
}

interface Customer {
  id: string;
  name: string;
}

type FormMode = 'create' | 'edit' | 'view';

type FieldKey =
  | 'item'
  | 'unitPrice'
  | 'weightMin'
  | 'weightMax'
  | 'labourRate'
  | 'taxPercent'
  | 'effectiveTo';
type FieldErrors = Partial<Record<FieldKey, string>>;

const ItemPricingFormScreen: React.FC = () => {
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Get params safely
  const priceId = params.id;
  const mode = params.mode;

  // Determine mode
  const formMode: FormMode = priceId
    ? mode === 'edit'
      ? 'edit'
      : 'view'
    : 'create';
  const isReadOnly = formMode === 'view';

  itemPricingFormLogger.debug('Render - priceId:', priceId, 'mode:', mode, 'formMode:', formMode);

  // Form state - start with loading true only if we have a priceId
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingPrice, setExistingPrice] = useState<ItemStoragePrice | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Form fields
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [priceType, setPriceType] = useState<'one_time' | 'monthly'>('one_time');
  const [unitPrice, setUnitPrice] = useState('');
  const [weightMin, setWeightMin] = useState('0');
  const [weightMax, setWeightMax] = useState('');
  const [labourRate, setLabourRate] = useState('');
  const [taxPercent, setTaxPercent] = useState('18');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date());
  const [effectiveTo, setEffectiveTo] = useState<Date | null>(null);

  // Bottom sheet states
  const [showItemSheet, setShowItemSheet] = useState(false);
  const [showCustomerSheet, setShowCustomerSheet] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  // Shared date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'from' | 'to'>('from');

  // Refs
  const itemSheetRef = useRef<BottomSheetModal>(null);
  const customerSheetRef = useRef<BottomSheetModal>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snap points for bottom sheets
  const snapPoints = useMemo(() => ['60%', '90%'], []);

  // Load existing price data if editing/viewing
  useEffect(() => {
    itemPricingFormLogger.debug('useEffect triggered - priceId:', priceId, 'formMode:', formMode);
    if (priceId) {
      loadPriceData();
    } else {
      // No priceId means create mode - stop loading immediately
      setLoading(false);
    }
  }, [priceId]);

  const loadPriceData = async () => {
    try {
      setLoading(true);
      itemPricingFormLogger.debug('Loading price data for ID:', priceId);

      // Fetch all prices and find the one matching our ID
      // Note: Backend doesn't support price_ids filter, so we fetch all and filter client-side
      const result = await getItemStoragePrices({
        p_limit: 500,
        p_filters: { include_expired: true },
      });

      itemPricingFormLogger.debug('Fetch result:', {
        success: result.success,
        dataLength: result.data.length,
        message: result.message,
      });

      // Find the specific price by ID
      const price = result.data.find((p) => p.id === priceId) || null;

      itemPricingFormLogger.debug('Looking for price ID:', priceId);
      itemPricingFormLogger.debug('Found match:', price ? price.item_name : 'NOT FOUND');

      if (price) {
        itemPricingFormLogger.debug('Found price:', {
          id: price.id,
          item_name: price.item_name,
          unit_price: price.unit_price,
          price_type: price.price_type,
        });
        setExistingPrice(price);
        setSelectedItem({ id: price.item_id, name: price.item_name });
        if (price.customer_id && price.customer_name) {
          setSelectedCustomer({ id: price.customer_id, name: price.customer_name });
        }
        setPriceType(price.price_type);
        setUnitPrice(price.unit_price.toString());
        setWeightMin(price.weight_min.toString());
        setWeightMax(price.weight_max.toString());
        setLabourRate(price.labour_rate.toString());
        setTaxPercent(price.tax_percent.toString());
        setEffectiveFrom(new Date(price.effective_from));
        if (price.effective_to) {
          setEffectiveTo(new Date(price.effective_to));
        }
        itemPricingFormLogger.debug('State updated with price data');
      } else {
        itemPricingFormLogger.error('Price not found for ID:', priceId);
        showAlert(tr('pricing.form.notFoundTitle'), tr('pricing.form.notFoundMessage'));
        router.back();
      }
    } catch (err) {
      itemPricingFormLogger.error('Load error:', err);
      showAlert(tr('pricing.form.couldNotLoadTitle'), tr('common.checkConnection'));
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // Search items
  const searchItems = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setItems([]);
      return;
    }

    setSearchingItems(true);
    try {
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient
        .from('items')
        .select('id, name, packaging')
        .eq('active', true)
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })
        .limit(10);

      if (error) {
        itemPricingFormLogger.error('Item search error:', error);
        setItems([]);
        return;
      }

      setItems(
        data?.map((item) => ({
          id: item.id,
          name: item.name,
          packaging: item.packaging || '',
        })) || []
      );
    } catch (err) {
      itemPricingFormLogger.error('Item search exception:', err);
      setItems([]);
    } finally {
      setSearchingItems(false);
    }
  }, []);

  // Search customers using search_customers RPC
  const searchCustomers = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setCustomers([]);
      return;
    }

    setSearchingCustomers(true);
    try {
      const authenticatedClient = await getAuthenticatedClient();
      const { data, error } = await authenticatedClient.rpc('search_customers', {
        p_search_query: query,
        p_limit: 10,
      });

      if (error) {
        itemPricingFormLogger.error('Customer search error:', error);
        setCustomers([]);
        return;
      }

      setCustomers(mapCustomerSearchResponse(data));
    } catch (err) {
      itemPricingFormLogger.error('Customer search exception:', err);
      setCustomers([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  // Handle item search change with debounce
  const handleItemSearchChange = useCallback(
    (text: string) => {
      setItemSearchQuery(text);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        searchItems(text);
      }, 300);
    },
    [searchItems]
  );

  // Handle customer search change with debounce
  const handleCustomerSearchChange = useCallback(
    (text: string) => {
      setCustomerSearchQuery(text);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        searchCustomers(text);
      }, 300);
    },
    [searchCustomers]
  );

  // Validate form: every problem at once, keyed by field (style guide §14.4)
  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!selectedItem) {
      errors.item = tr('pricing.validation.itemRequired');
    }
    if (!unitPrice || parseFloat(unitPrice) < 0) {
      errors.unitPrice = tr('pricing.validation.unitPrice');
    }
    if (!weightMin || parseFloat(weightMin) < 0) {
      errors.weightMin = tr('pricing.validation.weightMin');
    }
    if (!weightMax || parseFloat(weightMax) <= 0) {
      errors.weightMax = tr('pricing.validation.weightMax');
    } else if (parseFloat(weightMax) < parseFloat(weightMin)) {
      errors.weightMax = tr('pricing.validation.weightOrder');
    }
    if (!labourRate || parseFloat(labourRate) < 0) {
      errors.labourRate = tr('pricing.validation.labourRate');
    }
    if (!taxPercent || parseFloat(taxPercent) < 0 || parseFloat(taxPercent) > 100) {
      errors.taxPercent = tr('pricing.validation.taxPercent');
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      errors.effectiveTo = tr('pricing.validation.dateOrder');
    }
    return errors;
  };

  // Handle save
  const handleSave = async () => {
    const errors = validateForm();
    setFieldErrors(errors);
    const messages = Object.values(errors);
    if (messages.length > 0) {
      const summary = tr('pricing.form.fixFields', { count: messages.length });
      AccessibilityInfo.announceForAccessibility(`${summary} ${messages.join(' ')}`);
      showAlert(tr('pricing.form.checkFieldsTitle'), messages.join('\n'));
      return;
    }

    setSaving(true);
    try {
      if (formMode === 'create') {
        const payload: CreateItemPricingPayload = {
          item_id: selectedItem!.id,
          customer_id: selectedCustomer?.id || null,
          price_type: priceType,
          unit_price: parseFloat(unitPrice),
          weight_min: parseFloat(weightMin),
          weight_max: parseFloat(weightMax),
          labour_rate: parseFloat(labourRate),
          tax_percent: parseFloat(taxPercent),
          effective_from: toLocalISODate(effectiveFrom),
          effective_to: effectiveTo ? toLocalISODate(effectiveTo) : null,
        };

        const result = await createItemStoragePrice(payload);
        if (result.success) {
          showAlert(tr('pricing.form.savedTitle'), tr('pricing.form.addedMessage', { item: selectedItem!.name }), [
            { text: tr('common.ok'), onPress: () => router.back() },
          ]);
        } else {
          showAlert(tr('pricing.form.couldNotSaveTitle'), result.message || tr('pricing.list.tryAgainInAMoment'));
        }
      } else if (formMode === 'edit' && priceId) {
        const payload: UpdateItemPricingPayload = {
          price_type: priceType,
          unit_price: parseFloat(unitPrice),
          weight_min: parseFloat(weightMin),
          weight_max: parseFloat(weightMax),
          labour_rate: parseFloat(labourRate),
          tax_percent: parseFloat(taxPercent),
          effective_from: toLocalISODate(effectiveFrom),
          effective_to: effectiveTo ? toLocalISODate(effectiveTo) : null,
        };

        const result = await updateItemStoragePrice(priceId, payload);
        if (result.success) {
          showAlert(tr('pricing.form.savedTitle'), selectedItem?.name ? tr('pricing.form.updatedMessage', { item: selectedItem.name }) : tr('pricing.form.updatedMessageNoItem'), [
            { text: tr('common.ok'), onPress: () => router.back() },
          ]);
        } else {
          showAlert(tr('pricing.form.couldNotSaveTitle'), result.message || tr('pricing.list.tryAgainInAMoment'));
        }
      }
    } catch (err) {
      itemPricingFormLogger.error('Save error:', err);
      showAlert(tr('pricing.form.couldNotSaveTitle'), tr('common.checkConnection'));
    } finally {
      setSaving(false);
    }
  };

  // Render backdrop for bottom sheets
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        style={[props.style, { backgroundColor: t.overlay.scrim }]}
      />
    ),
    [t]
  );

  // Handle shared date picker
  const handleDatePress = (field: 'from' | 'to') => {
    if (isReadOnly) return;
    setActiveDateField(field);
    setShowDatePicker(true);
  };

  const handleDateChange = (event?: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event?.type === 'set' && selectedDate) {
      if (activeDateField === 'from') {
        setEffectiveFrom(selectedDate);
      } else {
        setEffectiveTo(selectedDate);
      }
    }
    if (Platform.OS === 'ios') {
      // iOS keeps the picker open, so we update in real-time
      if (selectedDate) {
        if (activeDateField === 'from') {
          setEffectiveFrom(selectedDate);
        } else {
          setEffectiveTo(selectedDate);
        }
      }
    }
  };

  const closeDatePicker = () => {
    setShowDatePicker(false);
  };

  // Render item for item selection
  const renderItemOption = useCallback(
    ({ item }: { item: Item }) => (
      <Pressable
        style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
        onPress={() => {
          setSelectedItem(item);
          setFieldErrors((prev) => ({ ...prev, item: undefined }));
          setItemSearchQuery('');
          setItems([]);
          itemSheetRef.current?.dismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel={item.packaging ? tr('pricing.form.nameWithDetail', { name: item.name, detail: item.packaging }) : item.name}
      >
        <Icon name="cube-outline" size={iconSize.md} color={t.icon.secondary} />
        <View style={styles.sheetItemContent}>
          <Text style={styles.sheetItemName}>{item.name}</Text>
          {item.packaging ? <Text style={styles.sheetItemMeta}>{item.packaging}</Text> : null}
        </View>
      </Pressable>
    ),
    [styles, t]
  );

  // Render item for customer selection
  const renderCustomerOption = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable
        style={({ pressed }) => [styles.sheetItem, pressed && styles.sheetItemPressed]}
        onPress={() => {
          setSelectedCustomer(item);
          setCustomerSearchQuery('');
          setCustomers([]);
          customerSheetRef.current?.dismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <Icon name="account-outline" size={iconSize.md} color={t.icon.secondary} />
        <View style={styles.sheetItemContent}>
          <Text style={styles.sheetItemName}>{item.name}</Text>
        </View>
      </Pressable>
    ),
    [styles, t]
  );

  // Page title
  const getTitle = () => {
    switch (formMode) {
      case 'create':
        return tr('pricing.form.addTitle');
      case 'edit':
        return tr('pricing.form.editTitle');
      case 'view':
        return tr('pricing.form.viewTitle');
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.container, styles.loadingContainer]}
        accessibilityRole="progressbar"
        accessibilityLabel={tr('pricing.form.loadingLabel')}
      >
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('pricing.form.loading')}</Text>
      </View>
    );
  }

  const lockedSelection = isReadOnly || formMode === 'edit';

  const renderSheetEmpty = (searching: boolean, query: string, noun: 'items' | 'customers') => (
    <View style={styles.sheetEmpty}>
      {searching ? (
        <ActivityIndicator color={t.brand.tint} accessibilityLabel={noun === 'items' ? tr('pricing.form.searchingItems') : tr('pricing.form.searchingCustomers')} />
      ) : query.length > 0 ? (
        <Text style={styles.sheetEmptyText}>{tr(noun === 'items' ? 'pricing.form.noItemsMatch' : 'customers.search.noMatchTryFewer', { search: query })}</Text>
      ) : (
        <Text style={styles.sheetEmptyText}>{noun === 'items' ? tr('pricing.form.typeToSearchItems') : tr('pricing.form.typeToSearchCustomers')}</Text>
      )}
    </View>
  );

  return (
    <BottomSheetModalProvider>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
          <HeaderBackButton />
          <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {getTitle()}
          </Text>
          {!isReadOnly && (
            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={tr('pricing.form.savePrice')}
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
          )}
          {isReadOnly && (
            <Pressable
              style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
              onPress={() => router.replace(`/item-pricing-form?id=${priceId}&mode=edit`)}
              accessibilityRole="button"
              accessibilityLabel={tr('pricing.form.editTitle')}
            >
              <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.editButtonText}>{tr('common.edit')}</Text>
            </Pressable>
          )}
        </View>

        <KeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: space.max + insets.bottom }]}
          showsVerticalScrollIndicator={true}
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={Platform.OS === 'ios' ? 120 : 80}
          keyboardShouldPersistTaps="handled"
        >
          {/* Item Selection */}
          <View style={styles.formSection}>
            <Text style={[styles.label, fieldErrors.item && styles.labelError]}>
              {tr('common.item')}{!lockedSelection && <Text style={styles.required}> *</Text>}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.selector,
                lockedSelection && styles.fieldReadOnly,
                fieldErrors.item && styles.fieldError,
                pressed && !lockedSelection && styles.selectorPressed,
              ]}
              onPress={() => {
                if (!lockedSelection) {
                  itemSheetRef.current?.present();
                }
              }}
              disabled={lockedSelection}
              accessibilityRole="button"
              accessibilityLabel={selectedItem?.name ? tr('pricing.form.itemLabelSelected', { name: selectedItem.name }) : tr('pricing.form.itemLabelNone')}
              accessibilityHint={lockedSelection ? undefined : tr('pricing.form.itemHint')}
              accessibilityState={{ disabled: lockedSelection }}
            >
              <Icon name="cube-outline" size={iconSize.md} color={t.icon.secondary} />
              <Text
                style={[styles.selectorText, !selectedItem && styles.selectorPlaceholder]}
                numberOfLines={2}
              >
                {selectedItem?.name || tr('pricing.form.selectAnItem')}
              </Text>
              {!lockedSelection && (
                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
              )}
            </Pressable>
            <FieldError message={fieldErrors.item} />
            {formMode === 'edit' && (
              <Text style={styles.helperText}>{tr('pricing.form.itemLocked')}</Text>
            )}
          </View>

          {/* Customer Selection (Optional) */}
          <View style={styles.formSection}>
            <Text style={styles.label}>{tr('common.customer')}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.selector,
                lockedSelection && styles.fieldReadOnly,
                pressed && !lockedSelection && styles.selectorPressed,
              ]}
              onPress={() => {
                if (!lockedSelection) {
                  customerSheetRef.current?.present();
                }
              }}
              disabled={lockedSelection}
              accessibilityRole="button"
              accessibilityLabel={selectedCustomer?.name ? tr('pricing.form.customerLabelSelected', { name: selectedCustomer.name }) : tr('pricing.form.customerLabelDefault')}
              accessibilityHint={lockedSelection ? undefined : tr('pricing.form.customerHint')}
              accessibilityState={{ disabled: lockedSelection }}
            >
              <Icon name="account-outline" size={iconSize.md} color={t.icon.secondary} />
              <Text
                style={[styles.selectorText, !selectedCustomer && styles.selectorPlaceholder]}
                numberOfLines={2}
              >
                {selectedCustomer?.name || tr('pricing.form.defaultPrice')}
              </Text>
              {!lockedSelection && (
                <Icon name="chevron-down" size={iconSize.md} color={t.icon.secondary} />
              )}
            </Pressable>
            {formMode !== 'create' && !selectedCustomer && (
              <Text style={styles.helperText}>{tr('pricing.form.defaultPriceHelper')}</Text>
            )}
            {formMode === 'create' && (
              <Text style={styles.helperText}>{tr('pricing.form.customerOptional')}</Text>
            )}
            {selectedCustomer && !isReadOnly && formMode === 'create' && (
              <Pressable
                style={styles.clearButton}
                onPress={() => setSelectedCustomer(null)}
                accessibilityRole="button"
              >
                <Text style={styles.clearButtonText}>{tr('pricing.form.useDefaultPrice')}</Text>
              </Pressable>
            )}
          </View>

          {/* Weight Range */}
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('pricing.form.weightRange')}</Text>
          <View style={[styles.formSection, styles.row]}>
            <FormField
              containerStyle={styles.halfInput}
              label={tr('pricing.form.minimum')}
              required
              readOnly={isReadOnly}
              suffix={tr('pricing.kg')}
              error={fieldErrors.weightMin}
              value={weightMin}
              onChangeText={setWeightMin}
              numeric
              keyboardType="decimal-pad"
            />
            <FormField
              containerStyle={styles.halfInput}
              label={tr('pricing.form.maximum')}
              required
              readOnly={isReadOnly}
              suffix={tr('pricing.kg')}
              error={fieldErrors.weightMax}
              value={weightMax}
              onChangeText={setWeightMax}
              numeric
              keyboardType="decimal-pad"
            />
          </View>

          {/* Pricing */}
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('pricing.form.pricing')}</Text>
          <View style={styles.formSection}>
            <Text style={styles.label}>{tr('pricing.form.priceType')}</Text>
            {/* Price Type segmented control - fixed after creation */}
            <View
              style={[styles.segment, lockedSelection && styles.segmentLocked]}
              accessibilityRole="radiogroup"
              accessibilityLabel={tr('pricing.form.priceType')}
            >
              {(['one_time', 'monthly'] as const).map((value) => {
                const selected = priceType === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.segmentItem, selected && styles.segmentItemSelected]}
                    onPress={() => formMode === 'create' && setPriceType(value)}
                    disabled={lockedSelection}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: lockedSelection }}
                  >
                    {selected && <Icon name="check" size={iconSize.sm} color={t.brand.onFill} />}
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {priceTypeLabel(value)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {formMode === 'edit' && (
              <Text style={styles.helperText}>{tr('pricing.form.priceTypeLocked')}</Text>
            )}
          </View>

          <FormField
            containerStyle={styles.formSection}
            label={priceType === 'one_time' ? tr('pricing.form.oneTimePrice') : tr('pricing.form.monthlyPrice')}
            required
            readOnly={isReadOnly}
            prefix="₹"
            error={fieldErrors.unitPrice}
            value={unitPrice}
            onChangeText={setUnitPrice}
            numeric
            keyboardType="decimal-pad"
          />

          <FormField
            containerStyle={styles.formSection}
            label={tr('pricing.form.labourRate')}
            required
            readOnly={isReadOnly}
            prefix="₹"
            error={fieldErrors.labourRate}
            value={labourRate}
            onChangeText={setLabourRate}
            numeric
            keyboardType="decimal-pad"
          />

          <FormField
            containerStyle={styles.formSection}
            label={tr('pricing.form.tax')}
            required
            readOnly={isReadOnly}
            suffix="%"
            error={fieldErrors.taxPercent}
            value={taxPercent}
            onChangeText={setTaxPercent}
            numeric
            keyboardType="decimal-pad"
          />

          {/* Validity Period */}
          <Text style={styles.sectionHeader} accessibilityRole="header">{tr('pricing.form.validity')}</Text>
          <View style={styles.formSection}>
            <View style={styles.dateRow}>
              {(['from', 'to'] as const).map((field) => {
                const label = field === 'from' ? tr('pricing.form.from') : tr('pricing.form.to');
                const value =
                  field === 'from'
                    ? formatDate(effectiveFrom)
                    : effectiveTo
                      ? formatDate(effectiveTo)
                      : tr('pricing.form.noEndDate');
                const hasError = field === 'to' && !!fieldErrors.effectiveTo;
                return (
                  <View key={field} style={styles.dateColumn}>
                    <Text style={[styles.label, hasError && styles.labelError]}>
                      {label}
                      {field === 'from' && !isReadOnly && <Text style={styles.required}> *</Text>}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dateField,
                        isReadOnly && styles.fieldReadOnly,
                        hasError && styles.fieldError,
                        pressed && !isReadOnly && styles.selectorPressed,
                      ]}
                      onPress={() => handleDatePress(field)}
                      disabled={isReadOnly}
                      accessibilityRole="button"
                      accessibilityLabel={tr('pricing.form.labelValue', { label, value })}
                      accessibilityHint={isReadOnly ? undefined : tr('pricing.form.dateHint')}
                    >
                      <Text style={styles.dateValue}>{value}</Text>
                      <Icon name="calendar-outline" size={iconSize.md} color={t.icon.secondary} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <FieldError message={fieldErrors.effectiveTo} />
          </View>

          {/* Shared Date Picker */}
          {showDatePicker && (
            <View style={styles.pickerContainer}>
              {Platform.OS === 'ios' && (
                <View style={styles.iosPickerHeader}>
                  <Text style={styles.iosPickerTitle}>
                    {activeDateField === 'from' ? tr('pricing.form.startDate') : tr('pricing.form.endDate')}
                  </Text>
                  <Pressable
                    onPress={closeDatePicker}
                    style={styles.iosPickerDoneButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.iosPickerDone}>{tr('common.done')}</Text>
                  </Pressable>
                </View>
              )}
              <DateTimePicker
                value={activeDateField === 'from' ? effectiveFrom : (effectiveTo || new Date())}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                minimumDate={activeDateField === 'to' ? effectiveFrom : undefined}
                accentColor={t.brand.tint}
                textColor={t.text.primary}
                themeVariant={t.mode}
              />
            </View>
          )}
        </KeyboardAwareScrollView>

        {/* Item Selection Bottom Sheet */}
        <BottomSheetModal
          ref={itemSheetRef}
          index={0}
          snapPoints={snapPoints}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{tr('pricing.form.selectItem')}</Text>
            <Pressable
              style={styles.iconButton}
              onPress={() => itemSheetRef.current?.dismiss()}
              accessibilityRole="button"
              accessibilityLabel={tr('common.close')}
            >
              <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
            </Pressable>
          </View>
          <View style={styles.sheetSearchContainer}>
            <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.sheetSearchIcon} />
            <BottomSheetTextInput
              style={styles.sheetSearchInput}
              placeholder={tr('pricing.form.searchItems')}
              placeholderTextColor={t.text.placeholder}
              value={itemSearchQuery}
              onChangeText={handleItemSearchChange}
              autoFocus
              accessibilityLabel={tr('pricing.form.searchItems')}
              returnKeyType="search"
            />
          </View>
          <BottomSheetFlatList<Item>
            data={items}
            keyExtractor={(item: Item) => item.id}
            renderItem={renderItemOption}
            contentContainerStyle={[styles.sheetList, { paddingBottom: space.huge + insets.bottom }]}
            ListEmptyComponent={renderSheetEmpty(searchingItems, itemSearchQuery, 'items')}
          />
        </BottomSheetModal>

        {/* Customer Selection Bottom Sheet */}
        <BottomSheetModal
          ref={customerSheetRef}
          index={0}
          snapPoints={snapPoints}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          backgroundStyle={styles.sheetBackground}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{tr('pricing.form.selectCustomer')}</Text>
            <Pressable
              style={styles.iconButton}
              onPress={() => customerSheetRef.current?.dismiss()}
              accessibilityRole="button"
              accessibilityLabel={tr('common.close')}
            >
              <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
            </Pressable>
          </View>
          <View style={styles.sheetSearchContainer}>
            <Icon name="magnify" size={iconSize.md} color={t.icon.secondary} style={styles.sheetSearchIcon} />
            <BottomSheetTextInput
              style={styles.sheetSearchInput}
              placeholder={tr('pricing.form.searchCustomers')}
              placeholderTextColor={t.text.placeholder}
              value={customerSearchQuery}
              onChangeText={handleCustomerSearchChange}
              autoFocus
              accessibilityLabel={tr('pricing.form.searchCustomers')}
              returnKeyType="search"
            />
          </View>
          <BottomSheetFlatList<Customer>
            data={customers}
            keyExtractor={(item: Customer) => item.id}
            renderItem={renderCustomerOption}
            contentContainerStyle={[styles.sheetList, { paddingBottom: space.huge + insets.bottom }]}
            ListEmptyComponent={renderSheetEmpty(searchingCustomers, customerSearchQuery, 'customers')}
          />
        </BottomSheetModal>
      </View>
    </BottomSheetModalProvider>
  );
};

// =============================================================================
// FORM FIELD
// =============================================================================

type FormFieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
  prefix?: string;
  suffix?: string;
  /** The field holds a number: shown in the language's digits, stored in 0-9. */
  numeric?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Field error: icon plus message in the negative status colour. */
function FieldError({ message }: { message?: string }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  if (!message) return null;
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Labelled text field with prefix/suffix, focus, error and read-only states (§13.2). */
function FormField({
  label,
  required,
  readOnly,
  error,
  prefix,
  suffix,
  numeric,
  containerStyle,
  onFocus,
  onBlur,
  value,
  onChangeText,
  ...inputProps
}: FormFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <View style={containerStyle}>
      <Text style={[styles.label, !!error && styles.labelError]}>
        {label}
        {required && !readOnly && <Text style={styles.required}> *</Text>}
      </Text>
      <View
        style={[
          styles.inputBox,
          readOnly && styles.fieldReadOnly,
          focused && styles.inputBoxFocused,
          !!error && styles.fieldError,
        ]}
      >
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          {...inputProps}
          {...(numeric ? numericInput(value, onChangeText) : { value, onChangeText })}
          editable={!readOnly}
          style={styles.input}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={[label, prefix === '₹' ? tr('pricing.form.inRupees') : null, suffix === '%' ? tr('pricing.form.percent') : suffix]
            .filter(Boolean)
            .join(', ')}
          accessibilityState={{ disabled: readOnly }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      </View>
      <FieldError message={error} />
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
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
    // The header pads by space.sm: the rest brings the button's edge to the page margin.
    marginRight: layout.marginCompact - space.sm,
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
  editButton: {
    flexDirection: 'row' as const,
    gap: space.xs,
    minHeight: touchTarget,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: space.xs,
  },
  editButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  editButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: layout.marginCompact,
  },
  formSection: {
    marginBottom: space.lg,
  },
  sectionHeader: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginTop: space.sm,
    marginBottom: space.sm,
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
  row: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  halfInput: {
    flex: 1,
  },
  inputBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    gap: space.sm,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
  },
  inputBoxFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: space.sm,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  affix: {
    ...typography.body,
    color: t.text.secondary,
  },
  fieldReadOnly: {
    backgroundColor: t.surface.fieldReadOnly,
    borderWidth: 0,
  },
  fieldError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  dateRow: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  dateColumn: {
    flex: 1,
  },
  dateField: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    gap: space.sm,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
  },
  dateValue: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  pickerContainer: {
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    backgroundColor: t.surface.card,
    marginBottom: space.lg,
  },
  iosPickerHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingLeft: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  iosPickerTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  iosPickerDoneButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center' as const,
  },
  iosPickerDone: {
    ...typography.headline,
    color: t.brand.tint,
  },
  selector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
  },
  selectorPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  selectorText: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  selectorPlaceholder: {
    color: t.text.placeholder,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  segment: {
    flexDirection: 'row' as const,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    overflow: 'hidden' as const,
  },
  segmentLocked: {
    opacity: t.interaction.disabledOpacity,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row' as const,
    gap: space.xs,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surface.card,
  },
  segmentItemSelected: {
    backgroundColor: t.brand.fill,
  },
  segmentText: {
    ...typography.callout,
    color: t.text.primary,
  },
  segmentTextSelected: {
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  clearButton: {
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    alignSelf: 'flex-start' as const,
  },
  clearButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },

  // Bottom sheets (style guide §13.9)
  sheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: t.border.separator,
  },
  sheetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingLeft: layout.marginCompact,
    paddingRight: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  sheetTitle: {
    ...typography.headline,
    color: t.text.primary,
  },
  sheetSearchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: layout.marginCompact,
    marginVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.field,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
  },
  sheetSearchIcon: {
    marginRight: space.sm,
  },
  sheetSearchInput: {
    ...typography.body,
    flex: 1,
    minHeight: touchTarget,
    color: t.text.primary,
  },
  sheetList: {
    paddingHorizontal: layout.marginCompact,
  },
  sheetItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  sheetItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  sheetItemContent: {
    flex: 1,
  },
  sheetItemName: {
    ...typography.body,
    color: t.text.primary,
  },
  sheetItemMeta: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xxs,
  },
  sheetEmpty: {
    paddingVertical: space.huge,
    alignItems: 'center' as const,
  },
  sheetEmptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
});

export default ItemPricingFormScreen;
