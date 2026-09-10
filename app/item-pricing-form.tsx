import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import {
  TextInput,
} from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetBackdrop,
  BottomSheetModalProvider,
} from '@gorhom/bottom-sheet';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useListColors } from '@/hooks/useListColors';
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
import { createLogger } from '@/utils/logger';

const itemPricingFormLogger = createLogger('ItemPricingForm');

const FIORI = {
  button: { height: 44, borderRadius: 8 },
  input: { height: 56, borderRadius: 8 },
  selector: { height: 56, borderRadius: 8 },
} as const;

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

const ItemPricingFormScreen: React.FC = () => {
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const insets = useSafeAreaInsets();
  const colors = useListColors();

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
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        Alert.alert('Error', 'Price not found');
        router.back();
      }
    } catch (err) {
      itemPricingFormLogger.error('Load error:', err);
      Alert.alert('Error', 'Failed to load price data');
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

      // search_customers RPC returns array with id, name, mobile, city, etc.
      setCustomers(
        (data || []).map((customer: { id: string; name: string }) => ({
          id: customer.id,
          name: customer.name,
        }))
      );
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

  // Validate form
  const validateForm = (): string | null => {
    if (!selectedItem) {
      return 'Please select an item';
    }
    if (!unitPrice || parseFloat(unitPrice) < 0) {
      return 'Please enter a valid unit price';
    }
    if (!weightMin || parseFloat(weightMin) < 0) {
      return 'Please enter a valid minimum weight';
    }
    if (!weightMax || parseFloat(weightMax) <= 0) {
      return 'Please enter a valid maximum weight';
    }
    if (parseFloat(weightMax) < parseFloat(weightMin)) {
      return 'Maximum weight must be greater than minimum weight';
    }
    if (!labourRate || parseFloat(labourRate) < 0) {
      return 'Please enter a valid labour rate';
    }
    if (!taxPercent || parseFloat(taxPercent) < 0 || parseFloat(taxPercent) > 100) {
      return 'Please enter a valid tax percent (0-100)';
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return 'End date must be after start date';
    }
    return null;
  };

  // Handle save
  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
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
          effective_from: effectiveFrom.toISOString().split('T')[0],
          effective_to: effectiveTo ? effectiveTo.toISOString().split('T')[0] : null,
        };

        const result = await createItemStoragePrice(payload);
        if (result.success) {
          Alert.alert('Success', 'Item price created successfully', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } else {
          Alert.alert('Error', result.message || 'Failed to create item price');
        }
      } else if (formMode === 'edit' && priceId) {
        const payload: UpdateItemPricingPayload = {
          price_type: priceType,
          unit_price: parseFloat(unitPrice),
          weight_min: parseFloat(weightMin),
          weight_max: parseFloat(weightMax),
          labour_rate: parseFloat(labourRate),
          tax_percent: parseFloat(taxPercent),
          effective_from: effectiveFrom.toISOString().split('T')[0],
          effective_to: effectiveTo ? effectiveTo.toISOString().split('T')[0] : null,
        };

        const result = await updateItemStoragePrice(priceId, payload);
        if (result.success) {
          Alert.alert('Success', 'Item price updated successfully',  [
            { text: 'OK',  onPress: () => router.back() },
          ]);
        } else {
          Alert.alert('Error', result.message || 'Failed to update item price');
        }
      }
    } catch (err) {
      itemPricingFormLogger.error('Save error:', err);
      Alert.alert('Error', 'Failed to save item price');
    } finally {
      setSaving(false);
    }
  };

  // Render backdrop for bottom sheets
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
        style={[styles.sheetItem, { borderBottomColor: colors.gray100 }]}
        onPress={() => {
          setSelectedItem(item);
          setItemSearchQuery('');
          setItems([]);
          itemSheetRef.current?.dismiss();
        }}
      >
        <View style={styles.sheetItemContent}>
          <Text style={[styles.sheetItemName, { color: colors.textPrimary }]}>{item.name}</Text>
          {item.packaging && <Text style={[styles.sheetItemMeta, { color: colors.textTertiary }]}>{item.packaging}</Text>}
        </View>
        <Ionicons name="cube-outline" size={20} color={colors.textSecondary} />
      </Pressable>
    ),
    [colors]
  );

  // Render item for customer selection
  const renderCustomerOption = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable
        style={[styles.sheetItem, { borderBottomColor: colors.gray100 }]}
        onPress={() => {
          setSelectedCustomer(item);
          setCustomerSearchQuery('');
          setCustomers([]);
          customerSheetRef.current?.dismiss();
        }}
      >
        <View style={styles.sheetItemContent}>
          <Text style={[styles.sheetItemName, { color: colors.textPrimary }]}>{item.name}</Text>
        </View>
        <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
      </Pressable>
    ),
    [colors]
  );

  // Page title
  const getTitle = () => {
    switch (formMode) {
      case 'create':
        return 'Add Item Price';
      case 'edit':
        return 'Edit Item Price';
      case 'view':
        return 'View Item Price';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.cellBackground }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <BottomSheetModalProvider>
      <View style={{ height: insets.top, backgroundColor: colors.cellBackground }} />
      <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.gray100 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{getTitle()}</Text>
          {!isReadOnly && (
            <Pressable
              style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.white }]}>Save</Text>
              )}
            </Pressable>
          )}
          {isReadOnly && (
            <Pressable
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={() => router.replace(`/item-pricing-form?id=${priceId}&mode=edit`)}
            >
              <Text style={[styles.saveButtonText, { color: colors.white }]}>Edit</Text>
            </Pressable>
          )}
        </View>

        <KeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          extraScrollHeight={Platform.OS === 'ios' ? 120 : 80}
          keyboardShouldPersistTaps="handled"
        >
            {/* Item Selection */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Item *</Text>
              <Pressable
                style={[
                  styles.selector,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300 },
                  (isReadOnly || formMode === 'edit') && { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                ]}
                onPress={() => {
                  if (!isReadOnly && formMode !== 'edit') {
                    itemSheetRef.current?.present();
                  }
                }}
                disabled={isReadOnly || formMode === 'edit'}
              >
                <Ionicons name="cube-outline" size={20} color={colors.textSecondary} />
                <Text
                  style={[styles.selectorText, { color: colors.textPrimary }, !selectedItem && { color: colors.gray400 }]}
                  numberOfLines={1}
                >
                  {selectedItem?.name || 'Select Item...'}
                </Text>
                {!isReadOnly && formMode !== 'edit' && (
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                )}
              </Pressable>
              {formMode === 'edit' && (
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>Item cannot be changed after creation</Text>
              )}
            </View>

            {/* Customer Selection (Optional) */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Customer (Optional)</Text>
              <Pressable
                style={[
                  styles.selector,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300 },
                  (isReadOnly || formMode === 'edit') && { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                ]}
                onPress={() => {
                  if (!isReadOnly && formMode !== 'edit') {
                    customerSheetRef.current?.present();
                  }
                }}
                disabled={isReadOnly || formMode === 'edit'}
              >
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                <Text
                  style={[styles.selectorText, { color: colors.textPrimary }, !selectedCustomer && { color: colors.gray400 }]}
                  numberOfLines={1}
                >
                  {selectedCustomer?.name || 'Default Pricing (All Customers)'}
                </Text>
                {!isReadOnly && formMode !== 'edit' && (
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                )}
              </Pressable>
              {formMode !== 'create' && !selectedCustomer && (
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>This is a default price for all customers</Text>
              )}
              {selectedCustomer && !isReadOnly && formMode === 'create' && (
                <Pressable
                  style={styles.clearButton}
                  onPress={() => setSelectedCustomer(null)}
                >
                  <Text style={[styles.clearButtonText, { color: colors.primary }]}>Clear (Use Default)</Text>
                </Pressable>
              )}
            </View>

            {/* Weight Range */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Weight Range (kg) *</Text>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <TextInput
                    label="Min Weight"
                    value={weightMin}
                    onChangeText={setWeightMin}
                    keyboardType="numeric"
                    mode="outlined"
                    disabled={isReadOnly}
                    style={[styles.textInput, { backgroundColor: colors.cellBackground }]}
                    outlineColor={colors.gray300}
                    activeOutlineColor={colors.primary}
                    textColor={colors.textPrimary}
                  />
                </View>
                <View style={styles.halfInput}>
                  <TextInput
                    label="Max Weight"
                    value={weightMax}
                    onChangeText={setWeightMax}
                    keyboardType="numeric"
                    mode="outlined"
                    disabled={isReadOnly}
                    style={[styles.textInput, { backgroundColor: colors.cellBackground }]}
                    outlineColor={colors.gray300}
                    activeOutlineColor={colors.primary}
                    textColor={colors.textPrimary}
                  />
                </View>
              </View>
            </View>

            {/* Pricing */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Pricing *</Text>

              {/* Price Type Toggle - disabled in edit mode as price type cannot be changed */}
              <View style={[
                styles.priceTypeContainer,
                { backgroundColor: colors.gray100 },
                (isReadOnly || formMode === 'edit') && styles.priceTypeContainerDisabled,
              ]}>
                <Pressable
                  style={[
                    styles.priceTypeButton,
                    priceType === 'one_time' && [styles.priceTypeButtonActive, { backgroundColor: colors.cellBackground }],
                  ]}
                  onPress={() => formMode === 'create' && setPriceType('one_time')}
                  disabled={isReadOnly || formMode === 'edit'}
                >
                  <Text
                    style={[
                      styles.priceTypeText,
                      { color: colors.textTertiary },
                      priceType === 'one_time' && { color: colors.primary },
                    ]}
                  >
                    One-Time
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.priceTypeButton,
                    priceType === 'monthly' && [styles.priceTypeButtonActive, { backgroundColor: colors.cellBackground }],
                  ]}
                  onPress={() => formMode === 'create' && setPriceType('monthly')}
                  disabled={isReadOnly || formMode === 'edit'}
                >
                  <Text
                    style={[
                      styles.priceTypeText,
                      { color: colors.textTertiary },
                      priceType === 'monthly' && { color: colors.primary },
                    ]}
                  >
                    Monthly
                  </Text>
                </Pressable>
              </View>
              {formMode === 'edit' && (
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>Price type cannot be changed after creation</Text>
              )}

              {/* Unit Price */}
              <TextInput
                label={`${priceType === 'one_time' ? 'One-Time' : 'Monthly'} Price *`}
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="numeric"
                mode="outlined"
                disabled={isReadOnly}
                style={[styles.textInput, { backgroundColor: colors.cellBackground }]}
                left={<TextInput.Affix text="₹" />}
                outlineColor={colors.gray300}
                activeOutlineColor={colors.primary}
                textColor={colors.textPrimary}
              />
            </View>

            {/* Labour Rate */}
            <View style={styles.formSection}>
              <TextInput
                label="Labour Rate *"
                value={labourRate}
                onChangeText={setLabourRate}
                keyboardType="numeric"
                mode="outlined"
                disabled={isReadOnly}
                style={[styles.textInput, { backgroundColor: colors.cellBackground }]}
                left={<TextInput.Affix text="₹" />}
                outlineColor={colors.gray300}
                activeOutlineColor={colors.primary}
                textColor={colors.textPrimary}
              />
            </View>

            {/* Tax Percent */}
            <View style={styles.formSection}>
              <TextInput
                label="Tax Percent *"
                value={taxPercent}
                onChangeText={setTaxPercent}
                keyboardType="numeric"
                mode="outlined"
                disabled={isReadOnly}
                style={[styles.textInput, { backgroundColor: colors.cellBackground }]}
                right={<TextInput.Affix text="%" />}
                outlineColor={colors.gray300}
                activeOutlineColor={colors.primary}
                textColor={colors.textPrimary}
              />
            </View>

            {/* Validity Period */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Validity Period *</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  style={[
                    styles.dateField,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300 },
                    isReadOnly && { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                  ]}
                  onPress={() => handleDatePress('from')}
                  disabled={isReadOnly}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>From</Text>
                  <View style={styles.dateValueRow}>
                    <Text style={[styles.dateValue, { color: colors.textPrimary }, isReadOnly && { color: colors.gray400 }]}>
                      {formatDate(effectiveFrom)}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dateField,
                    { backgroundColor: colors.cellBackground, borderColor: colors.gray300 },
                    isReadOnly && { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                  ]}
                  onPress={() => handleDatePress('to')}
                  disabled={isReadOnly}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>To</Text>
                  <View style={styles.dateValueRow}>
                    <Text style={[styles.dateValue, { color: colors.textPrimary }, isReadOnly && { color: colors.gray400 }]}>
                      {effectiveTo ? formatDate(effectiveTo) : 'No end date'}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Shared Date Picker */}
            {showDatePicker && (
              <View>
                {Platform.OS === 'ios' && (
                  <View style={[styles.iosPickerHeader, { backgroundColor: colors.gray100 }]}>
                    <Text style={[styles.iosPickerTitle, { color: colors.textPrimary }]}>
                      Select {activeDateField === 'from' ? 'Start' : 'End'} Date
                    </Text>
                    <TouchableOpacity onPress={closeDatePicker}>
                      <Text style={[styles.iosPickerDone, { color: colors.primary }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <DateTimePicker
                  value={activeDateField === 'from' ? effectiveFrom : (effectiveTo || new Date())}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={activeDateField === 'to' ? effectiveFrom : undefined}
                  accentColor={colors.primary}
                  themeVariant="light"
                />
              </View>
            )}

            <View style={{ height: 100 }} />
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
          backgroundStyle={{ backgroundColor: colors.cellBackground }}
          handleIndicatorStyle={{ backgroundColor: colors.gray400 }}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.gray100 }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Select Item</Text>
          </View>
          <View style={styles.sheetSearchContainer}>
            <BottomSheetTextInput
              style={[styles.sheetSearchInput, { backgroundColor: colors.gray50, borderColor: colors.gray200, color: colors.textPrimary }]}
              placeholder="Search items..."
              placeholderTextColor={colors.gray400}
              value={itemSearchQuery}
              onChangeText={handleItemSearchChange}
              autoFocus
            />
          </View>
          <BottomSheetFlatList<Item>
            data={items}
            keyExtractor={(item: Item) => item.id}
            renderItem={renderItemOption}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.sheetEmpty}>
                {searchingItems ? (
                  <ActivityIndicator color={colors.primary} />
                ) : itemSearchQuery.length > 0 ? (
                  <Text style={[styles.sheetEmptyText, { color: colors.textTertiary }]}>No items found</Text>
                ) : (
                  <Text style={[styles.sheetEmptyText, { color: colors.textTertiary }]}>Type to search items</Text>
                )}
              </View>
            }
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
          backgroundStyle={{ backgroundColor: colors.cellBackground }}
          handleIndicatorStyle={{ backgroundColor: colors.gray400 }}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.gray100 }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Select Customer</Text>
          </View>
          <View style={styles.sheetSearchContainer}>
            <BottomSheetTextInput
              style={[styles.sheetSearchInput, { backgroundColor: colors.gray50, borderColor: colors.gray200, color: colors.textPrimary }]}
              placeholder="Search customers..."
              placeholderTextColor={colors.gray400}
              value={customerSearchQuery}
              onChangeText={handleCustomerSearchChange}
              autoFocus
            />
          </View>
          <BottomSheetFlatList<Customer>
            data={customers}
            keyExtractor={(item: Customer) => item.id}
            renderItem={renderCustomerOption}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.sheetEmpty}>
                {searchingCustomers ? (
                  <ActivityIndicator color={colors.primary} />
                ) : customerSearchQuery.length > 0 ? (
                  <Text style={[styles.sheetEmptyText, { color: colors.textTertiary }]}>No customers found</Text>
                ) : (
                  <Text style={[styles.sheetEmptyText, { color: colors.textTertiary }]}>Type to search customers</Text>
                )}
              </View>
            }
          />
        </BottomSheetModal>
      </View>
    </BottomSheetModalProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  saveButton: {
    height: FIORI.button.height,
    borderRadius: FIORI.button.borderRadius,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  iosPickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  textInput: {},
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  priceTypeContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  priceTypeContainerDisabled: {
    opacity: 0.6,
  },
  priceTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  priceTypeButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  priceTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    marginTop: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Bottom Sheet Styles
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSearchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sheetSearchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  sheetList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetItemContent: {
    flex: 1,
  },
  sheetItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  sheetItemMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  sheetEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  sheetEmptyText: {
    fontSize: 14,
  },
});

export default ItemPricingFormScreen;
