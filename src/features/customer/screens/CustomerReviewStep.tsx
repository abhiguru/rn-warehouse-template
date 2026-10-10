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
  CUSTOMER_STEP_NUMBERS,
  getCompletedSteps,
} from '@/constants/customerSteps';
import {
  CustomerFormMode,
  CustomerDocumentImage,
} from '@/types/customer.types';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { customerSteps } from '@/features/customer/customerStepLabels';
import { t as tr } from '@/i18n';
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
        isCreateMode ? tr('customers.form.discardNewTitle') : tr('customers.form.discardChangesTitle'),
        tr('customers.form.discardMessage'),
        [
          { text: tr('common.keepEditing'), style: 'cancel' },
          { text: tr('common.discard'), style: 'destructive', onPress: confirmDiscard },
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
      showAlert(tr('customers.review.documentLimitTitle'), tr('customers.review.documentLimitMessage', { max: 10 }));
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
      showAlert(tr('customers.review.couldNotAddPhotosTitle'), tr('customers.review.couldNotAddPhotosMessage'));
    } finally {
      setIsPickingImage(false);
    }
  }, [formData.document_images.length, addDocument]);

  const handleRemoveDocument = useCallback(
    (uri: string) => {
      showAlert(
        tr('customers.review.removeDocumentTitle'),
        tr('customers.review.removeDocumentMessage'),
        [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('customers.review.removeDocument'),
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
    editLabel: string,
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
          accessibilityLabel={editLabel}
          hitSlop={space.sm}
        >
          <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
          <Text style={styles.editButtonText}>{tr('common.edit')}</Text>
        </Pressable>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderDetailRow = (label: string, value: string | undefined) => {
    if (!value) return null;
    return (
      <View style={styles.detailRow} accessible accessibilityLabel={tr('customers.review.labelValue', { label, value })}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const submitLabel = isCreateMode ? tr('customers.review.createCustomer') : tr('customers.review.saveCustomer');

  return (
    <View style={styles.container}>
      {/* Step Indicator */}
      <GenericStepIndicatorHeader
        steps={customerSteps()}
        currentStep={CUSTOMER_STEP_NUMBERS.REVIEW}
        completedSteps={getCompletedSteps(CUSTOMER_STEP_NUMBERS.REVIEW)}
        onCancel={handleCancel}
        onStepPress={handleStepIndicatorPress}
        entityName={tr('common.customer')}
        entityId={isCreateMode ? undefined : formData.name || tr('customers.form.editing')}
        cancelTitle={tr('customers.form.discardHeaderTitle')}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {tr('customers.review.title')}
          </Text>
          <Text style={styles.subtitle}>
            {isCreateMode ? tr('customers.review.subtitleCreate') : tr('customers.review.subtitleSave')}
          </Text>
        </View>

        {/* Basic Information Section */}
        {renderSectionCard(
          tr('customers.steps.basic.label'),
          tr('customers.review.editBasic'),
          'account-outline',
          CUSTOMER_STEP_NUMBERS.BASIC,
          <>
            {renderDetailRow(tr('customers.fields.name'), formData.name)}
            {renderDetailRow(tr('customers.fields.mobile'), formatMobile(formData.mobile))}
            {renderDetailRow(tr('customers.fields.email'), formData.email)}
            {!formData.name && !formData.mobile && (
              <Text style={styles.emptyText}>{tr('customers.review.noBasic')}</Text>
            )}
          </>
        )}

        {/* Address & Tax Section */}
        {renderSectionCard(
          tr('customers.steps.details.label'),
          tr('customers.review.editDetails'),
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
                  {tr('customers.form.address')}
                </Text>
                {renderDetailRow(tr('customers.fields.city'), formData.city)}
                {renderDetailRow(tr('customers.fields.state'), formData.state)}
                {renderDetailRow(tr('customers.fields.pincode'), formData.pincode)}
                {renderDetailRow(tr('customers.fields.address'), formData.address)}
              </View>
            )}

            {/* Tax Details */}
            {(formData.gst || formData.pan) && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle} accessibilityRole="header">
                  {tr('customers.form.taxDetails')}
                </Text>
                {renderDetailRow(tr('customers.fields.gst'), formData.gst)}
                {renderDetailRow(tr('customers.fields.pan'), formData.pan)}
              </View>
            )}

            {/* Contact Person */}
            {(formData.contact_name ||
              formData.contact_mobile ||
              formData.contact_email) && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle} accessibilityRole="header">
                  {tr('customers.form.contactPerson')}
                </Text>
                {renderDetailRow(tr('customers.fields.name'), formData.contact_name)}
                {renderDetailRow(tr('customers.fields.mobile'), formatMobile(formData.contact_mobile))}
                {renderDetailRow(tr('customers.fields.email'), formData.contact_email)}
              </View>
            )}

            {!formData.city && !formData.gst && !formData.contact_name && (
              <Text style={styles.emptyText}>{tr('customers.review.noDetails')}</Text>
            )}
          </>
        )}

        {/* Documents Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="file-document-outline" size={iconSize.md} color={t.brand.tint} />
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {tr('customers.review.documents')}
              </Text>
            </View>
            <Text
              style={styles.documentCount}
              accessibilityLabel={tr('customers.review.documentCountLabel', { count: formData.document_images.length, max: 10 })}
            >
              {tr('customers.review.documentCount', { count: formData.document_images.length, max: 10 })}
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
                    accessibilityLabel={tr('customers.review.documentImage', { number: index + 1 })}
                  />
                  <Pressable
                    style={styles.removeDocumentButton}
                    onPress={() => handleRemoveDocument(doc.uri)}
                    accessibilityRole="button"
                    accessibilityLabel={tr('customers.review.removeDocumentNumber', { number: index + 1 })}
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
                      tr('customers.review.uploadsUnavailableTitle'),
                      tr('customers.review.uploadsUnavailableMessage')
                    )
                  }
                  disabled={isPickingImage}
                  accessibilityRole="button"
                  accessibilityLabel={tr('customers.review.addDocument')}
                  accessibilityState={{ disabled: isPickingImage, busy: isPickingImage }}
                >
                  {isPickingImage ? (
                    <ActivityIndicator color={t.brand.tint} />
                  ) : (
                    <>
                      <Icon name="camera-outline" size={iconSize.xl} color={t.brand.tint} />
                      <Text style={styles.addDocumentText}>{tr('common.add')}</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <Text style={styles.helperText}>
              {tr('customers.review.uploadsUnavailableMessage')}
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
          accessibilityLabel={tr('customers.form.backToDetails')}
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.backButtonText}>{tr('common.back')}</Text>
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
              <Text style={styles.submitButtonText}>{tr('common.saving')}</Text>
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
