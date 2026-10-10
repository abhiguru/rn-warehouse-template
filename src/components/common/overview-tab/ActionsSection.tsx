/**
 * ActionsSection Component
 *
 * Actions section for overview tabs (Share PDF, Print, Edit, Delete).
 * Buttons follow docs/STYLE_GUIDE.md §13.1: Share and Print secondary tint,
 * Edit primary, Delete secondary negative behind a confirmation.
 */

import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { iconSize } from '@/theme/tokens';
import { overviewStyles, useOverviewColors } from './FioriStyles';
import { SectionHeader } from './SectionHeader';

import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import type { DocumentEntity } from '@/i18n/entities';

interface ActionsSectionProps {
  /** Which document the actions are for. Selects whole-sentence texts in both languages. */
  entity?: DocumentEntity;
  /**
   * Older way to name the document: a word placed into the English sentences
   * ("Edit {{entity}}"). Used only when `entity` is not given.
   */
  entityType?: string;
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
  entity,
  entityType = '',
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

  const labels = entity
    ? {
        deleteNumberedTitle: (number: string) => t(`components.actions.${entity}.deleteNumberedTitle`, { number }),
        deleteThisTitle: t(`components.actions.${entity}.deleteThisTitle`),
        delete: t(`components.actions.${entity}.delete`),
        print: t(`components.actions.${entity}.print`),
        edit: t(`components.actions.${entity}.edit`),
      }
    : {
        deleteNumberedTitle: (number: string) => t('components.actions.deleteNumberedTitle', { entity: entityType, number }),
        deleteThisTitle: t('components.actions.deleteThisTitle', { entity: entityType }),
        delete: t('components.actions.deleteEntity', { entity: entityType }),
        print: t('components.actions.printEntity', { entity: entityType }),
        edit: t('components.actions.editEntity', { entity: entityType }),
      };

  const handleDeletePress = () => {
    showAlert(
      entityNumber ? labels.deleteNumberedTitle(entityNumber) : labels.deleteThisTitle,
      t('components.actions.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: labels.delete,
          style: 'destructive',
          onPress: onDelete,
        },
      ]
    );
  };

  return (
    <>
      <SectionHeader title={t('components.actions.title')} />
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
            accessibilityLabel={t('components.sharePdf')}
            accessibilityState={{ disabled: isShareLoading, busy: isShareLoading }}
          >
            {isShareLoading ? (
              <ActivityIndicator size="small" color={colorStyles.iconBrand} />
            ) : (
              <Icon name="share-variant-outline" size={iconSize.lg} color={colorStyles.iconBrand} />
            )}
            <Text style={[overviewStyles.secondaryTintButtonText, colorStyles.secondaryTintButtonText]}>
              {isShareLoading ? t('components.preparingPdf') : t('components.sharePdf')}
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
            accessibilityLabel={labels.print}
            accessibilityState={{ disabled: isPrintLoading, busy: isPrintLoading }}
          >
            {isPrintLoading ? (
              <ActivityIndicator size="small" color={colorStyles.iconBrand} />
            ) : (
              <Icon name="printer-outline" size={iconSize.lg} color={colorStyles.iconBrand} />
            )}
            <Text style={[overviewStyles.secondaryTintButtonText, colorStyles.secondaryTintButtonText]}>
              {isPrintLoading ? t('components.printRange.printing') : labels.print}
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
            accessibilityLabel={labels.edit}
          >
            <Icon name="pencil-outline" size={iconSize.lg} color={colorStyles.iconOnFill} />
            <Text style={[overviewStyles.primaryButtonText, colorStyles.primaryButtonText]}>{labels.edit}</Text>
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
            accessibilityLabel={labels.delete}
            accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colorStyles.iconError} />
            ) : (
              <Icon name="trash-can-outline" size={iconSize.lg} color={colorStyles.iconError} />
            )}
            <Text style={[overviewStyles.secondaryNegativeButtonText, colorStyles.secondaryNegativeButtonText]}>
              {isDeleting ? t('common.deleting') : labels.delete}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
};
