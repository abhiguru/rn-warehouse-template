import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import theme from '@/theme';
import { InvoiceItemData } from '@/types/invoice.types';
import { formatCurrency } from '@/utils/formatters';
import { KeyValueCell } from '@/components/fiori';

interface InvoiceItemCardProps {
  item: InvoiceItemData;
  onUpdate: (tempId: string, field: string, value: number) => void;
  overriddenFields?: string[]; // List of fields that are individually overridden
}

export const InvoiceItemCard: React.FC<InvoiceItemCardProps> = ({ item, onUpdate, overriddenFields = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  // Helper to check if a field is overridden
  const isOverridden = (field: string) => overriddenFields.includes(field);

  const handleFieldChange = (field: string, text: string) => {
    const value = parseFloat(text);
    if (!isNaN(value) && value >= 0) {
      onUpdate(item.temp_id, field, value);
    } else if (text === '') {
      onUpdate(item.temp_id, field, 0);
    }
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <TouchableOpacity
      style={[styles.card, isExpanded && styles.cardExpanded]}
      onPress={toggleExpand}
      activeOpacity={0.7}
    >
      {/* Collapsed State - Always Visible */}
      <View style={styles.collapsedContent}>
        <View style={styles.headerRow}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.item_name}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.chip}>
                <Icon name="package-variant" size={14} color={theme.colors.gray[600]} />
                <Text style={styles.chipText}>Qty: {item.qty}</Text>
              </View>
              {item.package_mark && (
                <View style={styles.chip}>
                  <Icon name="package-variant" size={14} color={theme.colors.gray[600]} style={{ marginRight: 4 }} />
                  <Text style={styles.chipText}>{item.package_mark}</Text>
                </View>
              )}
              {item.rack && (
                <View style={styles.chip}>
                  <Icon name="map-marker" size={14} color={theme.colors.gray[600]} style={{ marginRight: 4 }} />
                  <Text style={styles.chipText}>{item.rack}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.rightSection}>
            <Text style={styles.totalAmount}>{formatCurrency(item.item_total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <View style={styles.expandButton}>
              <Icon
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={theme.colors.primary}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Expanded State - Pricing Inputs */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.divider} />

          {/* Pricing Fields - Single Column */}
          <View style={styles.inputSection}>
            <Text style={styles.sectionTitle}>Pricing Details</Text>

            {/* Duration - Read Only */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Duration (Months)</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{item.duration} months</Text>
              </View>
            </View>

            {/* Number of Days - Read Only */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Number of Days</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{item.no_of_days} days</Text>
              </View>
            </View>

            {/* Charge */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Storage Charge (₹/unit/month) *</Text>
                {isOverridden('charge') && (
                  <View style={styles.overrideBadge}>
                    <Icon name="pencil" size={12} color={theme.colors.white} />
                    <Text style={styles.overrideBadgeText}>Custom</Text>
                  </View>
                )}
              </View>
              <View style={[styles.inputWithIcon, isOverridden('charge') && styles.inputOverridden]}>
                <Text style={styles.currencyIcon}>₹</Text>
                <TextInput
                  style={[styles.input, styles.inputWithPadding]}
                  value={item.charge > 0 ? item.charge.toString() : ''}
                  onChangeText={(text) => handleFieldChange('charge', text)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.gray[400]}
                />
              </View>
            </View>

            {/* Labour Rate */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Labour Rate (₹/unit) *</Text>
                {isOverridden('labour_rate') && (
                  <View style={styles.overrideBadge}>
                    <Icon name="pencil" size={12} color={theme.colors.white} />
                    <Text style={styles.overrideBadgeText}>Custom</Text>
                  </View>
                )}
              </View>
              <View style={[styles.inputWithIcon, isOverridden('labour_rate') && styles.inputOverridden]}>
                <Text style={styles.currencyIcon}>₹</Text>
                <TextInput
                  style={[styles.input, styles.inputWithPadding]}
                  value={item.labour_rate > 0 ? item.labour_rate.toString() : ''}
                  onChangeText={(text) => handleFieldChange('labour_rate', text)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.gray[400]}
                />
              </View>
            </View>

            {/* Tax */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Tax (%) *</Text>
                {isOverridden('tax') && (
                  <View style={styles.overrideBadge}>
                    <Icon name="pencil" size={12} color={theme.colors.white} />
                    <Text style={styles.overrideBadgeText}>Custom</Text>
                  </View>
                )}
              </View>
              <View style={[styles.inputWithIcon, isOverridden('tax') && styles.inputOverridden]}>
                <TextInput
                  style={[styles.input, styles.inputWithPadding]}
                  value={item.tax > 0 ? item.tax.toString() : ''}
                  onChangeText={(text) => handleFieldChange('tax', text)}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.gray[400]}
                />
                <Text style={styles.percentIcon}>%</Text>
              </View>
            </View>
          </View>

          {/* Calculated Amounts - Fiori Key Value Table View Cell */}
          <View style={styles.calculationSection}>
            <Text style={styles.sectionTitle}>Calculated Amounts</Text>
            <View style={styles.keyValueContainer}>
              <KeyValueCell
                keyLabel="Storage Amount"
                value={formatCurrency(item.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                showDivider
              />
              <KeyValueCell
                keyLabel="Labour Amount"
                value={formatCurrency(item.labour_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                showDivider
              />
              <KeyValueCell
                keyLabel="Tax Amount"
                value={formatCurrency(item.tax_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                showDivider
              />
              <View style={styles.totalRow}>
                <KeyValueCell
                  keyLabel="Item Total"
                  value={formatCurrency(item.item_total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  emphasized
                />
              </View>
            </View>
          </View>

          {/* Formula Section - Collapsible */}
          <TouchableOpacity
            style={styles.formulaToggle}
            onPress={() => setShowFormula(!showFormula)}
          >
            <Text style={styles.formulaToggleText}>
              {showFormula ? '▼' : '▶'} View Calculation Formula
            </Text>
          </TouchableOpacity>

          {showFormula && (
            <View style={styles.formulaSection}>
              <Text style={styles.formulaText}>
                Storage = Qty × Charge × Duration{'\n'}
                = {item.qty} × {formatCurrency(item.charge)} × {item.duration} = {formatCurrency(item.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.formulaText}>
                Labour = Qty × Labour Rate{'\n'}
                = {item.qty} × {formatCurrency(item.labour_rate)} = {formatCurrency(item.labour_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.formulaText}>
                Tax = (Storage + Labour) × Tax %{'\n'}
                = {formatCurrency(item.amount + item.labour_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × {item.tax}% = {formatCurrency(item.tax_amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// SAP Fiori Form Cell Styles
const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  cardExpanded: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  collapsedContent: {
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  itemName: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.fiori.text.primary,
    marginBottom: theme.spacing.xs,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.fiori.semantic.noneLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.fiori.text.secondary,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.fiori.semantic.positive,
    marginBottom: theme.spacing.xs,
  },
  expandButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -theme.spacing.sm,
    marginBottom: -theme.spacing.sm,
  },
  expandedContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.fiori.objectCell.divider,
    marginBottom: theme.spacing.md,
  },
  inputSection: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.fiori.text.primary,
    marginBottom: theme.spacing.sm,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  // Fiori: Label uses 13pt, primary text color
  inputLabel: {
    fontSize: 13,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.fiori.text.primary,
    marginBottom: 6,
    lineHeight: 18,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  overrideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  overrideBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.white,
  },
  // Fiori: Read-only field - gray background #F2F2F7, no border
  readOnlyField: {
    height: 44,
    backgroundColor: '#F2F2F7',
    borderWidth: 0,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.fiori.text.secondary,
    lineHeight: 22,
  },
  inputOverridden: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  // Fiori: Input field - 44pt height, 17pt text, #E5E5E5 border
  input: {
    height: 44,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    fontSize: theme.fontSize.base,
    color: theme.colors.fiori.text.primary,
    ...Platform.select({
      android: {
        textAlignVertical: 'center',
        includeFontPadding: false,
      },
    }),
  },
  inputWithIcon: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWithPadding: {
    paddingLeft: 36,
  },
  currencyIcon: {
    position: 'absolute',
    left: 12,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.fiori.text.secondary,
    zIndex: 1,
  },
  percentIcon: {
    position: 'absolute',
    right: 12,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.fiori.text.secondary,
  },
  // Fiori: Calculation section with Key Value cells
  calculationSection: {
    marginBottom: theme.spacing.sm,
  },
  // Fiori: Key Value container - white bg, rounded corners
  keyValueContainer: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    overflow: 'hidden',
  },
  // Fiori: Total row - emphasized with top border
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.fiori.objectCell.divider,
    backgroundColor: theme.colors.fiori.semantic.positiveLight,
  },
  formulaToggle: {
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  formulaToggleText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 18,
  },
  formulaSection: {
    backgroundColor: theme.colors.fiori.semantic.criticalLight,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  formulaText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: theme.colors.fiori.text.secondary,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
});
