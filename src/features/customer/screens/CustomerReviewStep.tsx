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
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { withNativeHandoff } from '@/config/nativeHandoff';
import { router } from 'expo-router';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { useCustomerForm } from '@/hooks/useCustomerForm';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import {
  CUSTOMER_STEPS,
  CUSTOMER_STEP_NUMBERS,
  getCompletedSteps,
} from '@/constants/customerSteps';
import {
  CustomerFormMode,
  CustomerDocumentImage,
} from '@/types/customer.types';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
// =============================================================================
// COMPONENT
// =============================================================================

type CustomerReviewStepProps = {
  mode: CustomerFormMode;
  customerId?: string;
};

export function CustomerReviewStep({
  mode,
  customerId,
}: CustomerReviewStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();

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
      showAlert(
        isCreateMode ? 'Discard this customer?' : 'Discard your changes?',
        'Your unsaved changes will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: confirmDiscard },
        ]
      );
    } else {
      confirmDiscard();
    }
  }, [isDirty, isCreateMode, resetFormState]);

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
      showAlert('Document limit reached', 'A customer can have up to 10 documents. Remove one to add another.');
      return;
    }

    setIsPickingImage(true);

    try {
      // Note: No permissions needed - Android 13+ Photo Picker handles access
      const result = await withNativeHandoff(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images' as const,
          allowsMultipleSelection: true,
          quality: 0.8,
          selectionLimit: 10 - formData.document_images.length,
        })
      );

      if (!result.canceled && result.assets) {
        result.assets.forEach(asset => {
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
      showAlert("Couldn't add photos", 'Try again, or choose different photos.');
    } finally {
      setIsPickingImage(false);
    }
  }, [formData.document_images.length, addDocument]);

  const handleRemoveDocument = useCallback(
    (uri: string) => {
      showAlert(
        'Remove this document?',
        'It will not be saved with the customer.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove document',
            style: 'destructive',
            onPress: () => removeDocument(uri),
          },
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
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name={icon} size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          onPress={() => handleEditSection(step)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title.toLowerCase()}`}
          hitSlop={space.sm}
        >
          <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderDetailRow = (label: string, value: string | undefined) => {
    if (!value) return null;
    return (
      <View style={styles.detailRow} accessible accessibilityLabel={`${label}, ${value}`}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const submitLabel = isCreateMode ? 'Create customer' : 'Save customer';

  return (
    <View style={styles.container}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={CUSTOMER_STEPS}
        currentStep={CUSTOMER_STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        entityName="Customer"
        entityId={isCreateMode ? undefined : formData.name || 'Editing'}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Review
          </Text>
          <Text style={styles.subtitle}>
            Check the details below before you {isCreateMode ? 'create' : 'save'} the customer.
          </Text>
        </View>

        {/* Basic Information Section */}
        {renderSectionCard(
          'Basic information',
          'account-outline',
          CUSTOMER_STEP_NUMBERS.BASIC,
          <>
            {renderDetailRow('Name', formData.name)}
            {renderDetailRow('Mobile', formatMobile(formData.mobile))}
            {renderDetailRow('Email', formData.email)}
            {!formData.name && !formData.mobile && (
              <Text style={styles.emptyText}>No basic information entered.</Text>
            )}
          </>
        )}

        {/* Address & Tax Section */}
        {renderSectionCard(
          'Address and tax details',
          'map-marker-outline',
          CUSTOMER_STEP_NUMBERS.DETAILS,
          <>
            {/* Address */}
            {(formData.city ||
              formData.state ||
              formData.pincode ||
              formData.address) && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle} accessibilityRole="header">
                  Address
                </Text>
                {renderDetailRow('City', formData.city)}
                {renderDetailRow('State', formData.state)}
                {renderDetailRow('Pincode', formData.pincode)}
                {renderDetailRow('Address', formData.address)}
              </View>
            )}

            {/* Tax Details */}
            {(formData.gst || formData.pan) && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle} accessibilityRole="header">
                  Tax details
                </Text>
                {renderDetailRow('GST', formData.gst)}
                {renderDetailRow('PAN', formData.pan)}
              </View>
            )}

            {/* Contact Person */}
            {(formData.contact_name ||
              formData.contact_mobile ||
              formData.contact_email) && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle} accessibilityRole="header">
                  Contact person
                </Text>
                {renderDetailRow('Name', formData.contact_name)}
                {renderDetailRow('Mobile', formatMobile(formData.contact_mobile))}
                {renderDetailRow('Email', formData.contact_email)}
              </View>
            )}

            {!formData.city && !formData.gst && !formData.contact_name && (
              <Text style={styles.emptyText}>No additional details entered.</Text>
            )}
          </>
        )}

        {/* Documents Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="file-document-outline" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Documents
              </Text>
            </View>
            <Text
              style={styles.documentCount}
              accessibilityLabel={`${formData.document_images.length} of 10 documents`}
            >
              {formData.document_images.length} of 10
            </Text>
          </View>

          <View style={styles.sectionContent}>
            {/* Document Grid */}
            <View style={styles.documentGrid}>
              {formData.document_images.map((doc, index) => (
                <View key={doc.uri} style={styles.documentItem}>
                  <Image
                    source={{ uri: doc.uri }}
                    style={styles.documentImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    accessibilityLabel={`Customer document ${index + 1}`}
                  />
                  <Pressable
                    style={styles.removeDocumentButton}
                    onPress={() => handleRemoveDocument(doc.uri)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove document ${index + 1}`}
                  >
                    <View style={styles.removeDocumentCircle}>
                      <Icon name="close" size={iconSize.sm} color={t.overlay.onImage} />
                    </View>
                  </Pressable>
                </View>
              ))}

              {/* Add Document Button */}
              {formData.document_images.length < 10 && (
                <Pressable
                  style={({ pressed }) => [
                    styles.addDocumentButton,
                    pressed && styles.addDocumentButtonPressed,
                  ]}
                  onPress={() =>
                    showAlert(
                      'Uploads unavailable',
                      "Customer document uploads aren't available in the local demo."
                    )
                  }
                  disabled={isPickingImage}
                  accessibilityRole="button"
                  accessibilityLabel="Add document"
                  accessibilityState={{ disabled: isPickingImage, busy: isPickingImage }}
                >
                  {isPickingImage ? (
                    <ActivityIndicator color={t.brand.tint} />
                  ) : (
                    <>
                      <Icon name="camera-outline" size={iconSize.xl} color={t.brand.tint} />
                      <Text style={styles.addDocumentText}>Add</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <Text style={styles.helperText}>
              Customer document uploads aren't available in the local demo.
            </Text>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.buttonContainer, { paddingBottom: space.lg + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
            isSubmitting && styles.disabled,
          ]}
          onPress={handleBack}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Back to address and tax details"
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ busy: isSubmitting }}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator color={t.brand.onFill} />
              <Text style={styles.submitButtonText}>Saving…</Text>
            </>
          ) : (
            <>
              <Icon name="check" size={iconSize.md} color={t.brand.onFill} />
              <Text style={styles.submitButtonText}>{submitLabel}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingVertical: space.xl,
  },
  title: {
    ...typography.title2,
    color: t.text.primary,
    marginBottom: space.xs,
  },
  subtitle: {
    ...typography.subhead,
    color: t.text.secondary,
  },

  // Section Cards
  sectionCard: {
    borderRadius: radius.card,
    marginBottom: space.lg,
    backgroundColor: t.surface.card,
    ...t.shadow[2],
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: touchTarget + space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  sectionTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 1,
  },
  sectionTitle: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  sectionContent: {
    padding: space.lg,
  },

  // Edit Button
  editButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    borderRadius: radius.button,
  },
  editButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  editButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },

  // Subsections
  subsection: {
    marginBottom: space.lg,
  },
  subsectionTitle: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.sm,
  },

  // Detail Rows
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  detailLabel: {
    ...typography.subhead,
    color: t.text.secondary,
    flex: 1,
  },
  detailValue: {
    ...typography.subhead,
    fontWeight: fontWeight.medium,
    color: t.text.primary,
    flex: 2,
    textAlign: 'right' as const,
  },
  emptyText: {
    ...typography.subhead,
    color: t.text.secondary,
    textAlign: 'center' as const,
    paddingVertical: space.md,
  },

  // Documents
  documentCount: {
    ...typography.subhead,
    color: t.text.secondary,
    fontVariant: ['tabular-nums' as const],
  },
  documentGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.md,
    marginBottom: space.md,
  },
  documentItem: {
    width: 80,
    height: 80,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  documentImage: {
    width: '100%' as const,
    height: '100%' as const,
    backgroundColor: t.surface.cardActive,
  },
  removeDocumentButton: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    width: touchTarget,
    height: touchTarget,
    alignItems: 'flex-end' as const,
    justifyContent: 'flex-start' as const,
    padding: space.xs,
  },
  removeDocumentCircle: {
    width: iconSize.lg,
    height: iconSize.lg,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.overlay.scrim,
  },
  addDocumentButton: {
    width: 80,
    height: 80,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.border.field,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  addDocumentButtonPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  addDocumentText: {
    ...typography.caption1,
    fontWeight: fontWeight.medium,
    color: t.brand.tint,
    marginTop: space.xxs,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
  },

  // Bottom
  bottomSpacer: {
    height: space.huge,
  },
  buttonContainer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderRadius: radius.button,
    borderColor: t.border.button,
    minHeight: 48,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  backButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  backButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  disabled: {
    opacity: t.interaction.disabledOpacity,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
    minHeight: 48,
    paddingHorizontal: space.xl,
    gap: space.sm,
    backgroundColor: t.brand.fill,
  },
  submitButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  submitButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
});

export default CustomerReviewStep;
