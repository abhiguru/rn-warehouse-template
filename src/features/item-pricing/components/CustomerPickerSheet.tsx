/**
 * Choose the customer for "Add customer rate": a searchable bottom sheet at 90% so the rows do
 * not move after typing (P-28). Each row shows name, then city and mobile number, so customers
 * with the same name can be told apart.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SearchableBottomSheet } from '@/components/common/SearchableBottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { searchService } from '@/services/search-service';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { formatMobile } from '@/utils/formatters';

export interface PickedCustomer {
  id: string;
  name: string;
  city?: string;
  mobile?: string;
}

export interface CustomerPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (customer: PickedCustomer) => void;
}

/**
 * The shared sheet opens at its second snap point, so two are needed; both are nearly the same
 * height, so the rows do not move after typing (P-28).
 */
export const CUSTOMER_PICKER_SNAP_POINTS = ['90%', '95%'];

const makeStyles = (th: ThemeTokens) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: layout.marginCompact },
  body: { flex: 1 },
  name: { ...typography.headline, color: th.text.primary },
  detail: { ...typography.subhead, color: th.text.secondary },
});

export function CustomerPickerSheet({ visible, onClose, onSelect }: CustomerPickerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const [lastQuery, setLastQuery] = useState('');
  const searchFn = useCallback(async (query: string): Promise<PickedCustomer[]> => {
    setLastQuery(query);
    const results = await searchService.searchCustomers(query);
    return results.map(r => ({ id: r.value, name: r.label, city: r.city, mobile: r.mobile }));
  }, []);

  const renderItem = useCallback(
    (customer: PickedCustomer, select: (c: PickedCustomer) => void) => {
      const mobile = customer.mobile ? formatMobile(customer.mobile) : '';
      const detail = [customer.city, mobile].filter(Boolean);
      return (
        <Pressable
          onPress={() => select(customer)}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={[customer.name, ...detail].join(', ')}
          testID={`picker-customer-${customer.id}`}
        >
          <Avatar name={customer.name} id={customer.id} size="sm" />
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={2}>{customer.name}</Text>
            {detail.length > 0 ? (
              <Text style={styles.detail} testID={`picker-detail-${customer.id}`}>
                {customer.city && mobile ? t('pricing.picker.detail', { city: customer.city, mobile }) : detail[0]}
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [styles],
  );

  return (
    <SearchableBottomSheet<PickedCustomer>
      isVisible={visible}
      onClose={onClose}
      onSelect={onSelect}
      title={t('pricing.picker.title')}
      placeholder={t('pricing.picker.placeholder')}
      searchFn={searchFn}
      renderItem={renderItem}
      keyExtractor={c => c.id}
      snapPoints={CUSTOMER_PICKER_SNAP_POINTS}
      emptyInitialText={t('pricing.picker.initial')}
      emptySearchText={t('pricing.picker.empty', { search: lastQuery })}
    />
  );
}
