/**
 * CustomerReviewStep Screen
 *
 * Step 3 of customer form: Documents & Review
 * Shows summary of all entered data and allows document upload.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { useCustomerForm } from '@/hooks/useCustomerForm';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import { CUSTOMER_STEPS, CUSTOMER_STEP_NUMBERS, getCompletedSteps } from '@/constants/customerSteps';
import { CustomerFormMode, CustomerDocumentImage } from '@/types/customer.types';

// =============================================================================
// COMPONENT
// =============================================================================

type CustomerReviewStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerReviewStep({ mode, customerId }: CustomerReviewStepProps) {
  // Theme colors
  const colors = useListColors();

  // Form hook
  const {
    formData,
    currentStep,
    isCreateMode,
    isSubmitting,
    addDocument,
    removeDocument,
    goToPreviousStep,
    navigateToStep,
    submitForm,
    resetFormState,
    isDirty,
  } = useCustomerForm({ mode, customerIdParam: customerId });

  // Local state
  const [isPickingImage, setIsPickingImage] = useState(false);

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleCancel = useCallback(() => {
    const confirmDiscard = () => {
      resetFormState();
      router.replace('/customers');
    };

    if (isDirty) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
        ]
      );
    } else {
      confirmDiscard();
    }
  }, [isDirty, resetFormState]);

  const handleStepIndicatorPress = useCallback(
    async (step: number) => {
      if (step < currentStep) {
        await navigateToStep(step as 1 | 2 | 3);
      }
    },
    [currentStep, navigateToStep]
  );

  const handleBack = useCallback(() => {
    goToPreviousStep();
  }, [goToPreviousStep]);

  const handleSubmit = useCallback(async () => {
    const result = await submitForm();
    if (result.success) {
      console.log('[CustomerReviewStep] Customer saved:', result.customerId);
    }
  }, [submitForm]);

  const handleEditSection = useCallback(
    (step: number) => {
      navigateToStep(step as 1 | 2 | 3);
    },
    [navigateToStep]
  );

  // Document handling
  const handleAddDocument = useCallback(async () => {
    if (formData.document_images.length >= 10) {
      Alert.alert('Limit Reached', 'Maximum 10 documents allowed');
      return;
    }

    setIsPickingImage(true);

    try {
      // Note: No permissions needed - Android 13+ Photo Picker handles access
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as const,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10 - formData.document_images.length,
      });

      if (!result.canceled && result.assets) {
        result.assets.forEach((asset) => {
          const newImage: CustomerDocumentImage = {
            uri: asset.uri,
            type: asset.mimeType || 'image/jpeg',
            name: asset.fileName || `document_${Date.now()}.jpg`,
            uploaded: false,
          };
          addDocument(newImage);
        });
      }
    } catch (error) {
      console.error('[CustomerReviewStep] Image picker error:', error);
      Alert.alert('Error', 'Failed to select images');
    } finally {
      setIsPickingImage(false);
    }
  }, [formData.document_images.length, addDocument]);

  const handleRemoveDocument = useCallback(
    (uri: string) => {
      Alert.alert(
        'Remove Document',
        'Are you sure you want to remove this document?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeDocument(uri) },
        ]
      );
    },
    [removeDocument]
  );

  // ===========================================================================
  // RENDER HELPERS
  // ===========================================================================

  const renderSectionCard = (
    title: string,
    icon: string,
    step: number,
    children: React.ReactNode
  ) => (
    <View style={[styles.sectionCard, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.gray100 }]}>
        <View style={styles.sectionTitleRow}>
          <Icon name={icon} size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>{title}</Text>
        </View>
        <TouchableOpacity
          style={[styles.editButton, { backgroundColor: colors.primaryLight }]}
          onPress={() => handleEditSection(step)}
          activeOpacity={0.7}
        >
          <Icon name="pencil" size={16} color={colors.primary} />
          <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderDetailRow = (label: string, value: string | undefined) => {
    if (!value) return null;
    return (
      <View style={[styles.detailRow, { borderBottomColor: colors.gray100 }]}>
        <Text style={[styles.detailLabel, { color: colors.gray600 }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.gray900 }]}>{value}</Text>
      </View>
    );
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={CUSTOMER_STEPS}
        currentStep={CUSTOMER_STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        colorScheme="teal"
        entityName={isCreateMode ? 'Customer' : 'Customer'}
        entityId={isCreateMode ? undefined : formData.name || 'Editing'}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.gray900 }]}>Review & Submit</Text>
          <Text style={[styles.subtitle, { color: colors.gray600 }]}>
            Verify the information below before {isCreateMode ? 'creating' : 'updating'} the customer
          </Text>
        </View>

        {/* Basic Information Section */}
        {renderSectionCard('Basic Information', 'account', CUSTOMER_STEP_NUMBERS.BASIC, (
          <>
            {renderDetailRow('Name', formData.name)}
            {renderDetailRow('Mobile', formData.mobile ? `+91 ${formData.mobile}` : undefined)}
            {renderDetailRow('Email', formData.email)}
            {!formData.name && !formData.mobile && (
              <Text style={[styles.emptyText, { color: colors.gray400 }]}>No basic information entered</Text>
            )}
          </>
        ))}

        {/* Address & Tax Section */}
        {renderSectionCard('Address & Tax Details', 'map-marker', CUSTOMER_STEP_NUMBERS.DETAILS, (
          <>
            {/* Address */}
            {(formData.city || formData.state || formData.pincode || formData.address) && (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray500 }]}>Address</Text>
                {renderDetailRow('City', formData.city)}
                {renderDetailRow('State', formData.state)}
                {renderDetailRow('Pincode', formData.pincode)}
                {renderDetailRow('Address', formData.address)}
              </View>
            )}

            {/* Tax Details */}
            {(formData.gst || formData.pan) && (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray500 }]}>Tax Details</Text>
                {renderDetailRow('GST', formData.gst)}
                {renderDetailRow('PAN', formData.pan)}
              </View>
            )}

            {/* Contact Person */}
            {(formData.contact_name || formData.contact_mobile || formData.contact_email) && (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: colors.gray500 }]}>Contact Person</Text>
                {renderDetailRow('Name', formData.contact_name)}
                {renderDetailRow('Mobile', formData.contact_mobile ? `+91 ${formData.contact_mobile}` : undefined)}
                {renderDetailRow('Email', formData.contact_email)}
              </View>
            )}

            {!formData.city && !formData.gst && !formData.contact_name && (
              <Text style={[styles.emptyText, { color: colors.gray400 }]}>No additional details entered</Text>
            )}
          </>
        ))}

        {/* Documents Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cellBackground, borderColor: colors.gray200 }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.gray100 }]}>
            <View style={styles.sectionTitleRow}>
              <Icon name="file-document" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.gray900 }]}>Documents</Text>
            </View>
            <Text style={[styles.documentCount, { color: colors.gray500 }]}>
              {formData.document_images.length}/10
            </Text>
          </View>

          <View style={styles.sectionContent}>
            {/* Document Grid */}
            <View style={styles.documentGrid}>
              {formData.document_images.map((doc) => (
                <View key={doc.uri} style={styles.documentItem}>
                  <Image
                    source={{ uri: doc.uri }}
                    style={[styles.documentImage, { backgroundColor: colors.gray200 }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                  <TouchableOpacity
                    style={[styles.removeDocumentButton, { backgroundColor: colors.cellBackground }]}
                    onPress={() => handleRemoveDocument(doc.uri)}
                  >
                    <Icon name="close-circle" size={24} color={colors.statusNegative} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add Document Button */}
              {formData.document_images.length < 10 && (
                <TouchableOpacity
                  style={[styles.addDocumentButton, { borderColor: colors.primaryLight, backgroundColor: colors.primaryLight }]}
                  onPress={handleAddDocument}
                  disabled={isPickingImage}
                  activeOpacity={0.7}
                >
                  {isPickingImage ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Icon name="plus" size={32} color={colors.primary} />
                      <Text style={[styles.addDocumentText, { color: colors.primary }]}>Add</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.helperText, { color: colors.gray500 }]}>
              Optional: Upload customer documents like ID proof, address proof, etc.
            </Text>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.buttonContainer, { backgroundColor: colors.gray50, borderTopColor: colors.gray200 }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.cellBackground, borderColor: colors.primary }]}
          onPress={handleBack}
          activeOpacity={0.7}
          disabled={isSubmitting}
        >
          <Icon name="chevron-left" size={20} color={colors.primary} />
          <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.statusPositive }, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.8}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Icon name="check" size={20} color={colors.white} />
              <Text style={[styles.submitButtonText, { color: colors.white }]}>
                {isCreateMode ? 'Create Customer' : 'Update Customer'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingVertical: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
  },

  // Section Cards
  sectionCard: {
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    padding: 16,
  },

  // Edit Button
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Subsections
  subsection: {
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Detail Rows
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 14,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Documents
  documentCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  documentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  documentItem: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  documentImage: {
    width: '100%',
    height: '100%',
  },
  removeDocumentButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    borderRadius: 12,
  },
  addDocumentButton: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDocumentText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  helperText: {
    fontSize: 13,
  },

  // Bottom
  bottomSpacer: {
    height: 40,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomerReviewStep;
