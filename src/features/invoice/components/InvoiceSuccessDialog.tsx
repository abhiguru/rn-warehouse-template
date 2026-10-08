/**
 * InvoiceSuccessDialog - SAP Fiori Compliant Success Dialog
 *
 * Based on SAP Fiori for iOS Design Guidelines
 * Features:
 * - Fiori Dialog pattern with proper spacing
 * - SafeArea handling for status bar
 * - Proper text containment for long customer names
 * - 44pt minimum touch targets
 * - Semantic colors
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FIORI } from '@/components/common/overview-tab/FioriTokens';
import { colors, darkColors } from '@/theme';
import { SavedInvoiceData } from '@/types/invoice.types';

interface InvoiceSuccessDialogProps {
  isVisible: boolean;
  invoiceData: SavedInvoiceData | null;
  onCreateAnother: () => void;
  onViewList: () => void;
  onPrint?: () => void;
  onSharePDF?: () => void;
  isShareLoading?: boolean;
  isEditMode?: boolean;
}

export const InvoiceSuccessDialog: React.FC<InvoiceSuccessDialogProps> = ({
  isVisible,
  invoiceData,
  onCreateAnother,
  onViewList,
  onPrint,
  onSharePDF,
  isShareLoading = false,
  isEditMode = false,
}) => {
  const insets = useSafeAreaInsets();

  // Dark mode support
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? darkColors : colors;

  if (!invoiceData) return null;

  const title = isEditMode ? 'Invoice Updated!' : 'Invoice Created!';
  const message = isEditMode
    ? 'The invoice has been updated successfully.'
    : 'The invoice has been saved successfully.';
  const secondaryButtonText = isEditMode ? 'Edit Another' : 'Create Another';

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.dialog, { backgroundColor: themeColors.white }]}>
          {/* Fiori Success Icon */}
          <View style={[styles.iconContainer, { backgroundColor: themeColors.fiori.semantic.positiveLight }]}>
            <MaterialCommunityIcons
              name="check-circle"
              size={56}
              color={themeColors.fiori.semantic.positive}
            />
          </View>

          {/* Title - Fiori Headline */}
          <Text style={[styles.title, { color: themeColors.fiori.text.primary }]}>{title}</Text>

          {/* Invoice Details Card - Fiori Object Cell */}
          <View style={[styles.detailsCard, { backgroundColor: themeColors.gray[50], borderColor: themeColors.fiori.objectCell.divider }]}>
            {/* Invoice Number Row */}
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Invoice No.</Text>
              <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]} numberOfLines={1}>
                #{invoiceData.invoice_no}
              </Text>
            </View>

            {/* Financial Year Row */}
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Financial Year</Text>
              <Text style={[styles.detailValue, { color: themeColors.fiori.text.primary }]} numberOfLines={1}>
                {invoiceData.fin_year}
              </Text>
            </View>

            {/* Customer Row - with proper text containment */}
            <View style={styles.detailRowVertical}>
              <Text style={[styles.detailLabel, { color: themeColors.fiori.text.secondary }]}>Customer</Text>
              <Text style={[styles.detailValueCustomer, { color: themeColors.fiori.text.primary }]} numberOfLines={2}>
                {invoiceData.customer_name}
              </Text>
            </View>

            {/* Total Amount Row - Emphasized */}
            <View style={[styles.totalRow, { borderTopColor: themeColors.fiori.objectCell.divider }]}>
              <Text style={[styles.totalLabel, { color: themeColors.fiori.text.primary }]}>Total Amount</Text>
              <Text style={[styles.totalValue, { color: themeColors.fiori.semantic.positive }]}>
                ₹{invoiceData.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Message - Fiori Caption */}
          <Text style={[styles.message, { color: themeColors.fiori.text.secondary }]}>{message}</Text>

          {/* Action Buttons - Fiori Button Spec */}
          <View style={styles.buttonContainer}>
            {/* Primary Action: View List */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: themeColors.primary },
                pressed && { backgroundColor: themeColors.orange[600] },
              ]}
              onPress={onViewList}
            >
              <Text style={[styles.primaryButtonText, { color: themeColors.white }]}>View Invoice List</Text>
            </Pressable>

            {/* Share PDF Button */}
            {onSharePDF && (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.successButton,
                  { backgroundColor: themeColors.fiori.semantic.positive },
                  pressed && { backgroundColor: themeColors.fiori.semantic.positiveDark },
                  isShareLoading && styles.buttonDisabled,
                ]}
                onPress={onSharePDF}
                disabled={isShareLoading}
              >
                {isShareLoading ? (
                  <ActivityIndicator size="small" color={themeColors.white} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="share-variant"
                      size={20}
                      color={themeColors.white}
                    />
                    <Text style={[styles.successButtonText, { color: themeColors.white }]}>Share PDF</Text>
                  </>
                )}
              </Pressable>
            )}

            {/* Print Button */}
            {onPrint && (
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.infoButton,
                  { backgroundColor: themeColors.fiori.semantic.neutral },
                  pressed && { backgroundColor: themeColors.fiori.semantic.neutralDark },
                ]}
                onPress={onPrint}
              >
                <MaterialCommunityIcons
                  name="printer"
                  size={20}
                  color={themeColors.white}
                />
                <Text style={[styles.infoButtonText, { color: themeColors.white }]}>Print Invoice</Text>
              </Pressable>
            )}

            {/* Secondary Action: Create Another */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                { borderColor: themeColors.primary },
                pressed && { backgroundColor: themeColors.orange[50] },
              ]}
              onPress={onCreateAnother}
            >
              <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>{secondaryButtonText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// =============================================================================
// FIORI DIALOG STYLES
// Based on SAP Fiori for iOS Design Guidelines
// =============================================================================

const styles = StyleSheet.create({
  // Overlay with SafeArea support
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: FIORI.spacing.lg,
  },

  // Dialog Card - Fiori Dialog Spec
  dialog: {
    borderRadius: FIORI.dimensions.cardRadius,
    padding: FIORI.spacing.xl,
    width: '100%',
    maxWidth: 360,
    ...FIORI.shadows.card,
  },

  // Success Icon Container
  iconContainer: {
    alignSelf: 'center',
    marginBottom: FIORI.spacing.lg,
  },

  // Title - Fiori Large Title
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: FIORI.spacing.lg,
    letterSpacing: 0.35,
  },

  // Details Card - Fiori Object Cell Container
  detailsCard: {
    borderRadius: FIORI.dimensions.buttonRadius,
    padding: FIORI.spacing.md,
    marginBottom: FIORI.spacing.lg,
    borderWidth: 1,
  },

  // Detail Row - Horizontal Layout
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: FIORI.spacing.xs,
  },

  // Detail Row - Vertical Layout for long text (Customer Name)
  detailRowVertical: {
    paddingVertical: FIORI.spacing.sm,
  },

  // Detail Label - Fiori Caption
  detailLabel: {
    ...FIORI.typography.caption,
    marginBottom: 2,
  },

  // Detail Value - Fiori Body Medium
  detailValue: {
    ...FIORI.typography.bodyMedium,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '60%',
  },

  // Customer Name Value - Full width with wrapping
  detailValueCustomer: {
    ...FIORI.typography.headline,
    marginTop: FIORI.spacing.xs,
  },

  // Total Row - Emphasized with divider
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: FIORI.spacing.sm,
    paddingTop: FIORI.spacing.md,
    borderTopWidth: 1,
  },

  // Total Label
  totalLabel: {
    ...FIORI.typography.bodyMedium,
  },

  // Total Value - Large and emphasized
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.41,
  },

  // Message - Fiori Body
  message: {
    ...FIORI.typography.body,
    textAlign: 'center',
    marginBottom: FIORI.spacing.lg,
  },

  // Button Container
  buttonContainer: {
    gap: FIORI.spacing.md,
  },

  // Base Button - Fiori 44pt touch target
  button: {
    height: FIORI.dimensions.buttonHeight,
    borderRadius: FIORI.dimensions.buttonRadius,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: FIORI.spacing.sm,
  },

  // Primary Button - Fiori Primary Tint
  primaryButton: {},
  primaryButtonPressed: {},
  primaryButtonText: {
    ...FIORI.typography.button,
  },

  // Secondary Button - Fiori Secondary Tint
  secondaryButton: {
    borderWidth: 1,
  },
  secondaryButtonPressed: {},
  secondaryButtonText: {
    ...FIORI.typography.button,
  },

  // Success Button - For Share PDF
  successButton: {},
  successButtonPressed: {},
  successButtonText: {
    ...FIORI.typography.button,
  },

  // Info Button - For Print
  infoButton: {},
  infoButtonPressed: {},
  infoButtonText: {
    ...FIORI.typography.button,
  },

  // Disabled State
  buttonDisabled: {
    opacity: 0.5,
  },
});
