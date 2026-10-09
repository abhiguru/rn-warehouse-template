/**
 * DocumentSuccessDialog - Success confirmation modal
 *
 * SAP Fiori dialog (docs/STYLE_GUIDE.md §13.9, wizard §14.3): surface.sheet,
 * radius.card, shadow[4] over overlay.scrim, success icon in status.positive.
 *
 * Displays success confirmation after document creation/update.
 * Provides actions for creating another, sharing PDF, printing, and viewing list.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatCurrency } from '@/utils/formatters';

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
      noun: 'GRN',
      title: isEditMode ? 'GRN updated' : 'GRN created',
      message: isEditMode ? 'Your changes to the GRN are saved.' : 'The GRN is saved.',
      listLabel: 'View GRNs',
      createText: isEditMode ? 'Edit another GRN' : 'Create another GRN',
      numberLabel: 'GRN number',
    },
    Dispatch: {
      noun: 'Dispatch',
      title: isEditMode ? 'Dispatch updated' : 'Dispatch created',
      message: isEditMode
        ? 'Your changes to the dispatch are saved.'
        : 'The dispatch is saved.',
      listLabel: 'View dispatches',
      createText: isEditMode ? 'Edit another dispatch' : 'Create another dispatch',
      numberLabel: 'Dispatch number',
    },
    Invoice: {
      noun: 'Invoice',
      title: isEditMode ? 'Invoice updated' : 'Invoice created',
      message: isEditMode
        ? 'Your changes to the invoice are saved.'
        : 'The invoice is saved.',
      listLabel: 'View invoices',
      createText: isEditMode ? 'Edit another invoice' : 'Create another invoice',
      numberLabel: 'Invoice number',
    },
  };
  return configs[type];
};

const makeStyles = (t: ThemeTokens) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.overlay.scrim,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: space.lg,
  },
  dialog: {
    backgroundColor: t.surface.sheet,
    borderRadius: radius.card,
    width: '100%' as const,
    maxWidth: layout.maxFormWidth,
    maxHeight: '90%' as const,
    ...t.shadow[4],
  },
  scrollContent: {
    padding: space.xxl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    marginBottom: space.lg,
    backgroundColor: t.status.positive.background,
  },
  title: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginBottom: space.xs,
  },
  message: {
    ...typography.body,
    color: t.text.secondary,
    textAlign: 'center' as const,
    marginBottom: space.xl,
  },
  detailsContainer: {
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginBottom: space.xxl,
    backgroundColor: t.background.base,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.xs,
  },
  detailLabel: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  detailValue: {
    ...typography.body,
    fontWeight: fontWeight.semibold,
    color: t.text.primary,
    flexShrink: 1,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  totalRow: {
    marginTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalLabel: {
    ...typography.headline,
    color: t.text.primary,
  },
  totalValue: {
    ...typography.title3,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  buttonContainer: {
    gap: space.sm,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: t.border.button,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  primaryButton: {
    backgroundColor: t.brand.fill,
  },
  primaryButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

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
  // Hooks must be called before any early returns
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const config = getDocumentConfig(documentType, isEditMode);

  // Early return after hooks
  if (!documentData) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onViewList}
    >
      <View style={styles.overlay}>
        <View
          style={styles.dialog}
          accessibilityViewIsModal
          accessibilityLabel={`${config.title}, ${config.noun} ${documentData.documentNo}`}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
            {/* Success icon */}
            <View style={styles.iconContainer} accessible={false} importantForAccessibility="no">
              <Icon name="check-circle" size={iconSize.xl} color={t.status.positive.text} />
            </View>

            {/* Title and message */}
            <Text style={styles.title} accessibilityRole="header">
              {config.title}
            </Text>
            <Text style={styles.message}>{config.message}</Text>

            {/* Document details */}
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{config.numberLabel}</Text>
                <Text style={styles.detailValue}>{documentData.documentNo}</Text>
              </View>

              {documentData.finYear && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Financial year</Text>
                  <Text style={styles.detailValue}>{documentData.finYear}</Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Customer</Text>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {documentData.customerName}
                </Text>
              </View>

              {documentData.date && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{documentData.date}</Text>
                </View>
              )}

              {documentData.itemCount !== undefined && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Items</Text>
                  <Text style={styles.detailValue}>{documentData.itemCount}</Text>
                </View>
              )}

              {documentData.totalAmount !== undefined && (
                <View style={[styles.detailRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total amount</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(documentData.totalAmount, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions: one primary, the rest secondary */}
            <View style={styles.buttonContainer}>
              {onPrint && (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  onPress={onPrint}
                  accessibilityRole="button"
                  accessibilityLabel={`Print ${config.noun === 'GRN' ? 'GRN' : config.noun.toLowerCase()}`}
                >
                  <Icon name="printer-outline" size={iconSize.md} color={t.brand.tint} />
                  <Text style={styles.secondaryButtonText}>Print</Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                  isShareLoading && styles.buttonDisabled,
                ]}
                onPress={onSharePDF}
                disabled={isShareLoading}
                accessibilityRole="button"
                accessibilityLabel="Share PDF"
                accessibilityState={{ busy: isShareLoading, disabled: isShareLoading }}
              >
                {isShareLoading ? (
                  <ActivityIndicator size="small" color={t.brand.tint} />
                ) : (
                  <Icon name="share-variant-outline" size={iconSize.md} color={t.brand.tint} />
                )}
                <Text style={styles.secondaryButtonText}>
                  {isShareLoading ? 'Preparing PDF…' : 'Share PDF'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
                onPress={onCreateAnother}
                accessibilityRole="button"
                accessibilityLabel={config.createText}
              >
                <Icon name="plus" size={iconSize.md} color={t.brand.tint} />
                <Text style={styles.secondaryButtonText}>{config.createText}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
                onPress={onViewList}
                accessibilityRole="button"
                accessibilityLabel={config.listLabel}
              >
                <Text style={styles.primaryButtonText}>{config.listLabel}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};


export default DocumentSuccessDialog;
