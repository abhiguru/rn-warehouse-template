/**
 * DocumentSuccessDialog - Success confirmation modal
 *
 * SAP Fiori Design System - Modal/Dialog Component
 * Spec: design/sap-fiori-specs/10-modal-dialog.md
 *
 * Displays success confirmation after document creation/update.
 * Provides actions for creating another, sharing PDF, printing, and viewing list.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme, { colors, darkColors } from '@/theme';
import { listColors } from '@/theme/listColors';

// ============================================================================
// SAP Fiori Design Constants
// Spec: design/sap-fiori-specs/10-modal-dialog.md
// ============================================================================
const FIORI = {
  // Modal dimensions
  modal: {
    cornerRadius: 16,
    padding: 24,
    maxWidth: 400,
    backdropOpacity: 0.4,
  },
  // Button dimensions (per 08-button.md)
  button: {
    height: 44,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  // Touch targets
  touch: {
    minHeight: 44,
  },
  // Typography
  typography: {
    title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
    body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
    caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    label: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
    value: { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
  },
  // Icon
  icon: {
    containerSize: 80,
    iconSize: 40,
  },
} as const;

export type DocumentType = 'GRN' | 'Dispatch' | 'Invoice';

export interface DocumentData {
  documentNo: string;
  customerName: string;
  date?: string;
  totalAmount?: number;
  finYear?: string;
  itemCount?: number;
}

interface DocumentSuccessDialogProps {
  isVisible: boolean;
  documentType: DocumentType;
  documentData: DocumentData | null;
  onCreateAnother: () => void;
  onViewList: () => void;
  onPrint?: () => void;
  onSharePDF: () => void;
  isShareLoading?: boolean;
  isEditMode?: boolean;
}

const getDocumentConfig = (type: DocumentType, isEditMode: boolean) => {
  const configs = {
    GRN: {
      title: isEditMode ? 'GRN Updated Successfully!' : 'GRN Created Successfully!',
      message: isEditMode
        ? 'The GRN has been updated successfully.'
        : 'The GRN has been saved successfully.',
      listRoute: 'GRN List',
      createText: isEditMode ? 'Edit Another' : 'Create Another',
      numberLabel: 'GRN Number:',
    },
    Dispatch: {
      title: isEditMode ? 'Dispatch Updated Successfully!' : 'Dispatch Created Successfully!',
      message: isEditMode
        ? 'The dispatch has been updated successfully.'
        : 'The dispatch has been saved successfully.',
      listRoute: 'Dispatch List',
      createText: isEditMode ? 'Edit Another' : 'Create Another',
      numberLabel: 'Dispatch Number:',
    },
    Invoice: {
      title: isEditMode ? 'Invoice Updated Successfully!' : 'Invoice Created Successfully!',
      message: isEditMode
        ? 'The invoice has been updated successfully.'
        : 'The invoice has been saved successfully.',
      listRoute: 'Invoice List',
      createText: isEditMode ? 'Edit Another' : 'Create Another',
      numberLabel: 'Invoice Number:',
    },
  };
  return configs[type];
};

export const DocumentSuccessDialog: React.FC<DocumentSuccessDialogProps> = ({
  isVisible,
  documentType,
  documentData,
  onCreateAnother,
  onViewList,
  onPrint,
  onSharePDF,
  isShareLoading = false,
  isEditMode = false,
}) => {
  // Dark mode support - hooks must be called before any early returns
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  const config = getDocumentConfig(documentType, isEditMode);

  // Early return after hooks
  if (!documentData) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
      accessibilityViewIsModal={true}
      accessibilityLabel={`${documentType} Success Dialog`}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: themeColors.white }]}>
          {/* Success Icon - Fiori style */}
          <View style={[styles.iconContainer, { backgroundColor: themeColors.fiori.semantic.positiveLight }]}>
            <Ionicons
              name="checkmark"
              size={FIORI.icon.iconSize}
              color={themeColors.fiori.semantic.positive}
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: themeColors.fiori.text.primary }]}>{config.title}</Text>

          {/* Document Details - Fiori Card style */}
          <View style={[styles.detailsContainer, { backgroundColor: themeColors.gray[50] }]}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>{config.numberLabel}</Text>
              <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]}>#{documentData.documentNo}</Text>
            </View>

            {documentData.finYear && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Financial Year:</Text>
                <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]}>{documentData.finYear}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Customer:</Text>
              <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]} numberOfLines={1}>
                {documentData.customerName}
              </Text>
            </View>

            {documentData.date && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Date:</Text>
                <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]}>{documentData.date}</Text>
              </View>
            )}

            {documentData.itemCount !== undefined && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Items:</Text>
                <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]}>{documentData.itemCount}</Text>
              </View>
            )}

            {documentData.totalAmount !== undefined && (
              <View style={[styles.detailRow, styles.totalRow, { borderTopColor: themeColors.fiori.objectCell.divider }]}>
                <Text style={[styles.totalLabel, { color: themeColors.fiori.text.primary }]}>Total Amount:</Text>
                <Text style={[styles.totalValue, { color: themeColors.fiori.semantic.positive }]}>
                  ₹{documentData.totalAmount.toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          {/* Message */}
          <Text style={[styles.message, { color: themeColors.fiori.text.secondary }]}>{config.message}</Text>

          {/* Action Buttons - Fiori Button styles */}
          <View style={styles.buttonContainer}>
            {/* Secondary Tint (outlined) */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                { borderColor: themeColors.primary },
                pressed && [styles.secondaryButtonPressed, { backgroundColor: themeColors.orange[50] }],
              ]}
              onPress={onCreateAnother}
              accessibilityRole="button"
              accessibilityLabel={config.createText}
            >
              <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>{config.createText}</Text>
            </Pressable>

            {/* Share PDF Button - Fiori positive style */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.shareButton,
                { backgroundColor: themeColors.fiori.semantic.positive },
                pressed && { backgroundColor: themeColors.fiori.semantic.positiveDark },
                isShareLoading && styles.buttonDisabled,
              ]}
              onPress={onSharePDF}
              disabled={isShareLoading}
              accessibilityRole="button"
              accessibilityLabel="Share PDF"
            >
              {isShareLoading ? (
                <ActivityIndicator size="small" color={themeColors.white} />
              ) : (
                <>
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color={themeColors.white}
                    style={styles.buttonIcon}
                  />
                  <Text style={[styles.shareButtonText, { color: themeColors.white }]}>Share PDF</Text>
                </>
              )}
            </Pressable>

            {/* Print Button - Fiori secondary style */}
            {onPrint && (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.printButton,
                  { backgroundColor: themeColors.fiori.semantic.neutral },
                  pressed && { backgroundColor: themeColors.fiori.semantic.neutralDark },
                ]}
                onPress={onPrint}
                accessibilityRole="button"
                accessibilityLabel="Print document"
              >
                <Ionicons
                  name="print-outline"
                  size={20}
                  color={themeColors.white}
                  style={styles.buttonIcon}
                />
                <Text style={[styles.printButtonText, { color: themeColors.white }]}>Print</Text>
              </Pressable>
            )}

            {/* Primary Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: themeColors.primary },
                pressed && { backgroundColor: themeColors.orange[600] },
              ]}
              onPress={onViewList}
              accessibilityRole="button"
              accessibilityLabel={`View ${config.listRoute}`}
            >
              <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>View {config.listRoute}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// Styles - SAP Fiori Design System
// ============================================================================
const styles = StyleSheet.create({
  // Overlay - Fiori backdrop 40% opacity
  overlay: {
    flex: 1,
    backgroundColor: `rgba(0, 0, 0, ${FIORI.modal.backdropOpacity})`,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },

  // Dialog - Fiori Form Sheet style
  dialog: {
    borderRadius: FIORI.modal.cornerRadius,
    padding: FIORI.modal.padding,
    width: '100%',
    maxWidth: FIORI.modal.maxWidth,
    // Platform-specific shadows (Fiori elevation 16)
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },

  // Success Icon - Fiori positive semantic
  iconContainer: {
    width: FIORI.icon.containerSize,
    height: FIORI.icon.containerSize,
    borderRadius: FIORI.icon.containerSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },

  // Title - Fiori title typography
  title: {
    fontSize: FIORI.typography.title.fontSize,
    fontWeight: FIORI.typography.title.fontWeight,
    lineHeight: FIORI.typography.title.lineHeight,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Details Container - Fiori Card style
  detailsContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: FIORI.touch.minHeight,
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: FIORI.typography.label.fontSize,
    flex: 1,
  },
  detailValue: {
    fontSize: FIORI.typography.value.fontSize,
    fontWeight: FIORI.typography.value.fontWeight,
    flex: 1,
    textAlign: 'right',
  },

  // Total Row
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },

  // Message
  message: {
    fontSize: FIORI.typography.body.fontSize,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  // Button Container
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
  },

  // Base Button - Fiori 44pt height
  button: {
    height: FIORI.button.height,
    borderRadius: FIORI.button.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Primary Button - Fiori Primary Tint
  primaryButton: {
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  primaryButtonPressed: {},
  primaryButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },

  // Secondary Button - Fiori Secondary Tint (outlined)
  secondaryButton: {
    borderWidth: 1,
  },
  secondaryButtonPressed: {},
  secondaryButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },

  // Share Button - Fiori Positive style
  shareButton: {
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  shareButtonPressed: {},
  shareButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },

  // Print Button - Fiori Neutral/Info style
  printButton: {
    // Platform-specific shadows
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  printButtonPressed: {},
  printButtonText: {
    fontSize: FIORI.button.fontSize,
    fontWeight: FIORI.button.fontWeight,
  },
});

export default DocumentSuccessDialog;
