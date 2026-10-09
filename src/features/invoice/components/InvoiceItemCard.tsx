import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { InvoiceItemData } from '@/types/invoice.types';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';

interface InvoiceItemCardProps {
  item: InvoiceItemData;
  onUpdate: (tempId: string, field: string, value: number) => void;
  overriddenFields?: string[]; // List of fields that are individually overridden
}

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Quantities use Indian digit grouping. */
const qtyFormat = new Intl.NumberFormat('en-IN');

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    marginBottom: space.sm,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
    minHeight: layout.objectCellMinHeight,
    padding: space.lg,
  },
  headerPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xs,
  },
  metaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.status.neutral.background,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    gap: space.xs,
  },
  chipText: {
    ...typography.caption1,
    ...tabular,
    color: t.status.neutral.text,
  },
  rightSection: {
    alignItems: 'flex-end' as const,
  },
  totalAmount: {
    ...typography.headline,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },
  expandIcon: {
    marginTop: space.xs,
  },
  expandedContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.divider,
  },
  inputSection: {
    marginTop: space.lg,
  },
  sectionTitle: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: t.text.secondary,
    marginBottom: space.sm,
  },
  inputGroup: {
    marginBottom: space.lg,
  },
  inputLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    flexShrink: 1,
  },
  readOnlyLabel: {
    marginBottom: space.xs,
  },
  required: {
    color: t.text.required,
  },
  labelRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginBottom: space.xs,
  },
  overrideBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.brand.subtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
    gap: space.xs,
  },
  overrideBadgeText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  readOnlyField: {
    minHeight: 44,
    backgroundColor: t.surface.fieldReadOnly,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
  },
  readOnlyText: {
    ...typography.body,
    ...tabular,
    color: t.text.primary,
  },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
  },
  fieldOverridden: {
    borderWidth: 2,
    borderColor: t.brand.tint,
  },
  input: {
    ...typography.body,
    ...tabular,
    flex: 1,
    minHeight: 44,
    color: t.text.primary,
    ...Platform.select({
      android: {
        textAlignVertical: 'center' as const,
        includeFontPadding: false,
      },
    }),
  },
  affix: {
    ...typography.body,
    color: t.text.secondary,
  },
  prefix: {
    marginRight: space.sm,
  },
  suffix: {
    marginLeft: space.sm,
  },
  calculationSection: {
    marginBottom: space.sm,
  },
  amountRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  amountLabel: {
    ...typography.subhead,
    color: t.text.secondary,
    flexShrink: 1,
  },
  amountValue: {
    ...typography.body,
    ...tabular,
    color: t.text.primary,
    textAlign: 'right' as const,
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: t.border.separator,
  },
  totalLabel: {
    ...typography.headline,
    color: t.text.primary,
    flexShrink: 1,
  },
  formulaToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    minHeight: touchTarget,
    borderRadius: radius.button,
  },
  formulaTogglePressed: {
    backgroundColor: t.brand.subtle,
  },
  formulaToggleText: {
    ...typography.subhead,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  formulaSection: {
    backgroundColor: t.background.base,
    padding: space.md,
    borderRadius: radius.button,
    marginTop: space.sm,
    gap: space.sm,
  },
  formulaText: {
    ...typography.footnote,
    ...tabular,
    color: t.text.secondary,
  },
});

type Styles = ReturnType<typeof makeStyles>;

function AmountRow({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.amountRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={styles.amountValue}>{value}</Text>
    </View>
  );
}

export const InvoiceItemCard: React.FC<InvoiceItemCardProps> = ({ item, onUpdate, overriddenFields = [] }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
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

  const customBadge = (
    <View style={styles.overrideBadge} accessible accessibilityLabel="Custom price for this item">
      <Icon name="pencil-outline" size={iconSize.sm} color={t.brand.tint} />
      <Text style={styles.overrideBadgeText}>Custom</Text>
    </View>
  );

  const total = formatInvoiceAmount(item.item_total);
  const summaryLabel = [
    item.item_name,
    `quantity ${qtyFormat.format(item.qty)}`,
    item.package_mark ? `mark ${item.package_mark}` : null,
    item.rack ? `rack ${item.rack}` : null,
    total,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      {/* Collapsed state - always visible */}
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggleExpand}
        accessibilityRole="button"
        accessibilityLabel={summaryLabel}
        accessibilityHint={isExpanded ? 'Hides the pricing' : 'Shows the pricing to edit'}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.item_name}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.chip}>
              <Icon name="cube-outline" size={iconSize.sm} color={t.status.neutral.text} />
              <Text style={styles.chipText}>Qty {qtyFormat.format(item.qty)}</Text>
            </View>
            {!!item.package_mark && (
              <View style={styles.chip}>
                <Icon name="tag-outline" size={iconSize.sm} color={t.status.neutral.text} />
                <Text style={styles.chipText}>{item.package_mark}</Text>
              </View>
            )}
            {!!item.rack && (
              <View style={styles.chip}>
                <Icon name="view-grid-outline" size={iconSize.sm} color={t.status.neutral.text} />
                <Text style={styles.chipText}>{item.rack}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.totalAmount}>{total}</Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.lg}
            color={t.icon.secondary}
            style={styles.expandIcon}
          />
        </View>
      </Pressable>

      {/* Expanded state - pricing inputs */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.inputSection}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Pricing</Text>

            {/* Duration - read only */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, styles.readOnlyLabel]}>Duration</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>
                  {item.duration} {item.duration === 1 ? 'month' : 'months'}
                </Text>
              </View>
            </View>

            {/* Number of days - read only */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, styles.readOnlyLabel]}>Number of days</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>
                  {item.no_of_days} {item.no_of_days === 1 ? 'day' : 'days'}
                </Text>
              </View>
            </View>

            {/* Charge */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>
                  Storage charge (₹ per unit per month)<Text style={styles.required}> *</Text>
                </Text>
                {isOverridden('charge') && customBadge}
              </View>
              <View style={[styles.field, isOverridden('charge') && styles.fieldOverridden]}>
                <Text style={[styles.affix, styles.prefix]}>₹</Text>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Storage charge per unit per month"
                  value={item.charge > 0 ? item.charge.toString() : ''}
                  onChangeText={(text) => handleFieldChange('charge', text)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={t.text.placeholder}
                />
              </View>
            </View>

            {/* Labour rate */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>
                  Labour rate (₹ per unit)<Text style={styles.required}> *</Text>
                </Text>
                {isOverridden('labour_rate') && customBadge}
              </View>
              <View style={[styles.field, isOverridden('labour_rate') && styles.fieldOverridden]}>
                <Text style={[styles.affix, styles.prefix]}>₹</Text>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Labour rate per unit"
                  value={item.labour_rate > 0 ? item.labour_rate.toString() : ''}
                  onChangeText={(text) => handleFieldChange('labour_rate', text)}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={t.text.placeholder}
                />
              </View>
            </View>

            {/* Tax */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>
                  Tax (%)<Text style={styles.required}> *</Text>
                </Text>
                {isOverridden('tax') && customBadge}
              </View>
              <View style={[styles.field, isOverridden('tax') && styles.fieldOverridden]}>
                <TextInput
                  style={styles.input}
                  accessibilityLabel="Tax percent"
                  value={item.tax > 0 ? item.tax.toString() : ''}
                  onChangeText={(text) => handleFieldChange('tax', text)}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor={t.text.placeholder}
                />
                <Text style={[styles.affix, styles.suffix]}>%</Text>
              </View>
            </View>
          </View>

          {/* Calculated amounts */}
          <View style={styles.calculationSection}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Calculated amounts</Text>
            <AmountRow styles={styles} label="Storage amount" value={formatInvoiceAmount(item.amount)} />
            <AmountRow styles={styles} label="Labour amount" value={formatInvoiceAmount(item.labour_amount)} />
            <AmountRow styles={styles} label="Tax" value={formatInvoiceAmount(item.tax_amount)} />
            <View style={styles.totalRow} accessible accessibilityLabel={`Item total, ${total}`}>
              <Text style={styles.totalLabel}>Item total</Text>
              <Text style={styles.totalAmount}>{total}</Text>
            </View>
          </View>

          {/* Formula section - collapsible */}
          <Pressable
            style={({ pressed }) => [styles.formulaToggle, pressed && styles.formulaTogglePressed]}
            onPress={() => setShowFormula(!showFormula)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFormula }}
          >
            <Icon
              name={showFormula ? 'chevron-up' : 'chevron-down'}
              size={iconSize.md}
              color={t.brand.tint}
            />
            <Text style={styles.formulaToggleText}>
              {showFormula ? 'Hide calculation' : 'Show calculation'}
            </Text>
          </Pressable>

          {showFormula && (
            <View style={styles.formulaSection}>
              <Text style={styles.formulaText}>
                Storage = Qty × Charge × Duration{'\n'}
                = {item.qty} × {formatInvoiceAmount(item.charge)} × {item.duration} = {formatInvoiceAmount(item.amount)}
              </Text>
              <Text style={styles.formulaText}>
                Labour = Qty × Labour rate{'\n'}
                = {item.qty} × {formatInvoiceAmount(item.labour_rate)} = {formatInvoiceAmount(item.labour_amount)}
              </Text>
              <Text style={styles.formulaText}>
                Tax = (Storage + Labour) × Tax %{'\n'}
                = {formatInvoiceAmount(item.amount + item.labour_amount)} × {item.tax}% = {formatInvoiceAmount(item.tax_amount)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};
