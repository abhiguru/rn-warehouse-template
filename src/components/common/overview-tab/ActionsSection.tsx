/**
 * ActionsSection Component
 *
 * Reusable actions section for overview tabs (Share PDF, Edit, Delete)
 * Based on SAP Fiori for iOS Button Patterns
 */

import React from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { overviewStyles, useOverviewColors } from './FioriStyles';
import { SectionHeader } from './SectionHeader';

interface ActionsSectionProps {
  /** Entity type label for edit/delete buttons (e.g., "GRN", "Dispatch", "Invoice") */
  entityType: string;
  /** Entity number for delete confirmation message */
  entityNumber?: string;
  /** Entity ID - actions are disabled if not provided */
  entityId?: string;
  /** Called when Share PDF button is pressed */
  onSharePDF?: () => void;
  /** Whether Share PDF is in loading state */
  isShareLoading?: boolean;
  /** Called when Print button is pressed */
  onPrint?: () => void;
  /** Whether Print is in loading state */
  isPrintLoading?: boolean;
  /** Called when Edit button is pressed */
  onEdit?: () => void;
  /** Whether edit is allowed (for role-based access) */
  canEdit?: boolean;
  /** Whether delete is allowed (for role-based access) - defaults to canEdit for backward compatibility */
  canDelete?: boolean;
  /** Called when Delete is confirmed */
  onDelete?: () => void;
  /** Whether Delete is in loading state */
  isDeleting?: boolean;
}

export const ActionsSection: React.FC<ActionsSectionProps> = ({
  entityType,
  entityNumber,
  entityId,
  onSharePDF,
  isShareLoading = false,
  onPrint,
  isPrintLoading = false,
  onEdit,
  canEdit = true,
  canDelete, // If not provided, defaults to canEdit for backward compatibility
  onDelete,
  isDeleting = false,
}) => {
  const colorStyles = useOverviewColors();

  // Resolve canDelete - if not explicitly provided, fall back to canEdit
  const resolvedCanDelete = canDelete ?? canEdit;

  const showShareButton = onSharePDF && entityNumber;
  const showPrintButton = onPrint && entityNumber;
  const showEditButton = canEdit && onEdit && entityId;
  const showDeleteButton = resolvedCanDelete && onDelete && entityId;

  // Don't render if no actions available
  if (!showShareButton && !showPrintButton && !showEditButton && !showDeleteButton) {
    return null;
  }

  const handleDeletePress = () => {
    const entityLabel = entityNumber || `this ${entityType.toLowerCase()}`;
    Alert.alert(
      `Delete ${entityType}`,
      `Are you sure you want to delete ${entityType} ${entityLabel}?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: onDelete,
        },
      ]
    );
  };

  return (
    <>
      <SectionHeader title="Actions" />
      <View style={overviewStyles.actionsContainer}>
        {/* Share PDF Button - Secondary Tint */}
        {showShareButton && (
          <Pressable
            style={({ pressed }) => [
              overviewStyles.secondaryTintButton,
              colorStyles.secondaryTintButton,
              pressed && colorStyles.secondaryTintButtonPressed,
              isShareLoading && overviewStyles.buttonDisabled,
            ]}
            onPress={onSharePDF}
            disabled={isShareLoading}
            accessibilityRole="button"
            accessibilityLabel="Share PDF"
            accessibilityState={{ disabled: isShareLoading }}
          >
            {isShareLoading ? (
              <ActivityIndicator size="small" color={colorStyles.iconSuccess} />
            ) : (
              <Icon name="share-variant" size={20} color={colorStyles.iconSuccess} />
            )}
            <Text style={[overviewStyles.secondaryTintButtonText, colorStyles.secondaryTintButtonText]}>
              {isShareLoading ? 'Generating PDF...' : 'Share PDF'}
            </Text>
          </Pressable>
        )}

        {/* Print Button - Secondary Tint */}
        {showPrintButton && (
          <Pressable
            style={({ pressed }) => [
              overviewStyles.secondaryTintButton,
              colorStyles.secondaryTintButton,
              pressed && colorStyles.secondaryTintButtonPressed,
              isPrintLoading && overviewStyles.buttonDisabled,
            ]}
            onPress={onPrint}
            disabled={isPrintLoading}
            accessibilityRole="button"
            accessibilityLabel={`Print ${entityType}`}
            accessibilityState={{ disabled: isPrintLoading }}
          >
            {isPrintLoading ? (
              <ActivityIndicator size="small" color={colorStyles.iconSuccess} />
            ) : (
              <Icon name="printer" size={20} color={colorStyles.iconSuccess} />
            )}
            <Text style={[overviewStyles.secondaryTintButtonText, colorStyles.secondaryTintButtonText]}>
              {isPrintLoading ? 'Printing...' : `Print ${entityType}`}
            </Text>
          </Pressable>
        )}

        {/* Edit Button - Primary */}
        {showEditButton && (
          <Pressable
            style={({ pressed }) => [
              overviewStyles.primaryButton,
              colorStyles.primaryButton,
              pressed && colorStyles.primaryButtonPressed,
            ]}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${entityType}`}
          >
            <Icon name="pencil" size={20} color="#fff" />
            <Text style={[overviewStyles.primaryButtonText, colorStyles.primaryButtonText]}>Edit {entityType}</Text>
          </Pressable>
        )}

        {/* Delete Button - Secondary Negative */}
        {showDeleteButton && (
          <Pressable
            style={({ pressed }) => [
              overviewStyles.secondaryNegativeButton,
              colorStyles.secondaryNegativeButton,
              pressed && colorStyles.secondaryNegativeButtonPressed,
              isDeleting && overviewStyles.buttonDisabled,
            ]}
            onPress={handleDeletePress}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${entityType}`}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colorStyles.iconError} />
            ) : (
              <Icon name="delete" size={20} color={colorStyles.iconError} />
            )}
            <Text style={[overviewStyles.secondaryNegativeButtonText, colorStyles.secondaryNegativeButtonText]}>
              {isDeleting ? 'Deleting...' : `Delete ${entityType}`}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
};
