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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useListColors } from '@/hooks/useListColors';
import { itemService } from '@/services/item-service';
import type { ItemFormData, ItemValidationErrors, Item } from '@/types/item.types';

const FIORI = {
  button: { height: 44, borderRadius: 8 },
  input: { height: 56, borderRadius: 8 },
} as const;

const ItemEditScreen: React.FC = () => {
  // Theme colors for dark mode support
  const colors = useListColors();

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
        Alert.alert('Error', result.message || 'Item not found', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('[ItemEdit] Load error:', err);
      Alert.alert('Error', 'Failed to load item', [
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
      newErrors.name = 'Item name is required';
    } else if (formData.name.length > 80) {
      newErrors.name = 'Item name cannot exceed 80 characters';
    }

    // Packaging validation
    if (formData.packaging && formData.packaging.length > 40) {
      newErrors.packaging = 'Packaging cannot exceed 40 characters';
    }

    // Description validation
    if (formData.description && formData.description.length > 40) {
      newErrors.description = 'Description cannot exceed 40 characters';
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
      Alert.alert('No Changes', 'No changes were made to the item.');
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
        Alert.alert('Success', 'Item updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Check for duplicate name error
        if (
          result.message?.toLowerCase().includes('duplicate') ||
          result.message?.toLowerCase().includes('unique') ||
          result.message?.toLowerCase().includes('already exists')
        ) {
          setErrors({ name: 'An item with this name already exists' });
        } else {
          Alert.alert('Error', result.message || 'Failed to update item');
        }
      }
    } catch (err) {
      console.error('[ItemEdit] Save error:', err);
      Alert.alert('Error', 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  // Handle back with unsaved changes
  const handleBack = () => {
    if (hasChanges()) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  if (loading || !originalItem) {
    return (
      <>
        <View style={{ height: insets.top, backgroundColor: colors.cellBackground }} />
        <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.cellBackground }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.gray600 }]}>Loading item...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <View style={{ height: insets.top, backgroundColor: colors.cellBackground }} />
      <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.cellBackground, borderBottomColor: colors.cellDivider }]}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.gray900} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.gray900 }]}>Edit Item</Text>
          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.cellBackground} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.cellBackground }]}>Save</Text>
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
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name Field - Required */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.gray600 }]}>Item Name *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => handleFieldChange('name', text)}
                placeholder="Enter item name"
                placeholderTextColor={colors.gray400}
                maxLength={80}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider, color: colors.gray900 },
                  errors.name && { borderColor: colors.error, borderWidth: 2 },
                ]}
              />
              {errors.name && <Text style={[styles.errorText, { color: colors.error }]}>{errors.name}</Text>}
              <Text style={[styles.charCount, { color: colors.gray500 }]}>{formData.name.length}/80</Text>
            </View>

            {/* Packaging Field */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.gray600 }]}>Packaging</Text>
              <TextInput
                value={formData.packaging}
                onChangeText={(text) => handleFieldChange('packaging', text)}
                placeholder="e.g., Box, Bag, Carton"
                placeholderTextColor={colors.gray400}
                maxLength={40}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider, color: colors.gray900 },
                  errors.packaging && { borderColor: colors.error, borderWidth: 2 },
                ]}
              />
              {errors.packaging && <Text style={[styles.errorText, { color: colors.error }]}>{errors.packaging}</Text>}
              <Text style={[styles.charCount, { color: colors.gray500 }]}>{formData.packaging.length}/40</Text>
            </View>

            {/* Description Field */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.gray600 }]}>Description</Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => handleFieldChange('description', text)}
                placeholder="Brief description"
                placeholderTextColor={colors.gray400}
                maxLength={40}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.cellDivider, color: colors.gray900 },
                  errors.description && { borderColor: colors.error, borderWidth: 2 },
                ]}
              />
              {errors.description && <Text style={[styles.errorText, { color: colors.error }]}>{errors.description}</Text>}
              <Text style={[styles.charCount, { color: colors.gray500 }]}>{formData.description.length}/40</Text>
            </View>

            {/* Active Toggle */}
            <View style={styles.formSection}>
              <View style={[styles.switchRow, { backgroundColor: colors.gray100 }]}>
                <View style={styles.switchLabel}>
                  <Text style={[styles.switchTitle, { color: colors.gray900 }]}>Active</Text>
                  <Text style={[styles.switchDescription, { color: colors.gray500 }]}>
                    Inactive items won't appear in searches
                  </Text>
                </View>
                <Switch
                  value={formData.active}
                  onValueChange={(value) => handleFieldChange('active', value)}
                  trackColor={{
                    false: colors.gray300,
                    true: colors.primary,
                  }}
                  thumbColor={colors.cellBackground}
                />
              </View>
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
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
  keyboardView: {
    flex: 1,
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
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 13,
  },
});

export default ItemEditScreen;
