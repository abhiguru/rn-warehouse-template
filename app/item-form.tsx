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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Switch,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useListColors } from '@/hooks/useListColors';
import { itemService } from '@/services/item-service';
import type { ItemFormData, ItemValidationErrors } from '@/types/item.types';

const FIORI = {
  button: { height: 44, borderRadius: 8 },
  input: { height: 56, borderRadius: 8 },
} as const;

const ItemFormScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const colors = useListColors();

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
        Alert.alert('Success', 'Item created successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Check for duplicate name error
        if (result.message?.toLowerCase().includes('duplicate') ||
            result.message?.toLowerCase().includes('unique') ||
            result.message?.toLowerCase().includes('already exists')) {
          setErrors({ name: 'An item with this name already exists' });
        } else {
          Alert.alert('Error', result.message || 'Failed to create item');
        }
      }
    } catch (err) {
      console.error('[ItemForm] Save error:', err);
      Alert.alert('Error', 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={{ height: insets.top, backgroundColor: colors.cellBackground }} />
      <View style={[styles.container, { backgroundColor: colors.cellBackground }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.gray100 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Item</Text>
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
            {/* Name Field - Required */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Item Name *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => handleFieldChange('name', text)}
                placeholder="Enter item name"
                placeholderTextColor={colors.textTertiary}
                maxLength={80}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.textPrimary },
                  errors.name && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
              />
              {errors.name && <Text style={[styles.errorText, { color: colors.statusNegative }]}>{errors.name}</Text>}
              <Text style={[styles.charCount, { color: colors.textTertiary }]}>{formData.name.length}/80</Text>
            </View>

            {/* Packaging Field */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Packaging</Text>
              <TextInput
                value={formData.packaging}
                onChangeText={(text) => handleFieldChange('packaging', text)}
                placeholder="e.g., Box, Bag, Carton"
                placeholderTextColor={colors.textTertiary}
                maxLength={40}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.textPrimary },
                  errors.packaging && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
              />
              {errors.packaging && <Text style={[styles.errorText, { color: colors.statusNegative }]}>{errors.packaging}</Text>}
              <Text style={[styles.charCount, { color: colors.textTertiary }]}>{formData.packaging.length}/40</Text>
            </View>

            {/* Description Field */}
            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                value={formData.description}
                onChangeText={(text) => handleFieldChange('description', text)}
                placeholder="Brief description"
                placeholderTextColor={colors.textTertiary}
                maxLength={40}
                style={[
                  styles.textInput,
                  { backgroundColor: colors.cellBackground, borderColor: colors.gray300, color: colors.textPrimary },
                  errors.description && { borderColor: colors.statusNegative, borderWidth: 2 },
                ]}
              />
              {errors.description && <Text style={[styles.errorText, { color: colors.statusNegative }]}>{errors.description}</Text>}
              <Text style={[styles.charCount, { color: colors.textTertiary }]}>{formData.description.length}/40</Text>
            </View>

            {/* Active Toggle */}
            <View style={styles.formSection}>
              <View style={[styles.switchRow, { backgroundColor: colors.gray50 }]}>
                <View style={styles.switchLabel}>
                  <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>Active</Text>
                  <Text style={[styles.switchDescription, { color: colors.textTertiary }]}>
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
                  thumbColor={colors.white}
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

export default ItemFormScreen;
