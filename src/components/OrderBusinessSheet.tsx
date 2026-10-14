/**
 * OrderBusinessSheet - a customer account with several businesses picks the one
 * to order for (docs/STYLE_GUIDE.md §13.9). Opened by Create order on the Orders
 * tab; the staff roles use the customer search sheet instead.
 *
 * The businesses are asked of the facility each time the sheet opens, not taken
 * from the ids the phone holds (src/features/customer/ownBusinesses.ts), so the
 * sheet is also where an account with no business linked is told so.
 *
 * Up to five businesses the sheet is as high as its rows; above that it takes
 * most of the screen and the rows scroll. There is no search: an account has a
 * handful of businesses.
 *
 * Every state sits in one scroll view. A short sheet's scroll view is as high as
 * what it holds, up to a share of the window, so at the largest text sizes the
 * rows or the message scroll instead of running off the sheet.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, useWindowDimensions, View } from 'react-native';
import { CustomerChoiceRows } from '@/components/common/CustomerChoiceRows';
import { ReportEmptyState } from '@/components/reports/ReportEmptyState';
import { readOwnBusinesses, type OwnBusiness } from '@/features/customer/ownBusinesses';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { useLoadWithRetry } from '@/hooks/useLoadWithRetry';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { layout, space } from '@/theme/tokens';

export interface OrderBusinessSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (business: OwnBusiness) => void;
}

/** More businesses than this and the sheet is tall with a scrolling list. */
export const SHORT_SHEET_MAX_ROWS = 5;
/** The share of the window a short sheet's content may take before it scrolls. */
const SHORT_SHEET_WINDOW_SHARE = 0.6;

const makeStyles = () => ({
  // About two rows high, so the sheet moves little when the rows arrive.
  loading: {
    minHeight: layout.objectCellMinHeight * 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // The scroll view runs to the edges of the sheet and pads its content instead,
  // so the shadow of the card of rows is not cut off at the sides.
  scroll: { marginHorizontal: -layout.marginCompact },
  scrollTall: { flex: 1 },
  scrollContent: {
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
});

type SheetBodyProps = Pick<OrderBusinessSheetProps, 'onClose' | 'onPick'>;

/** The open sheet. Mounted only while open, so every opening asks the facility again. */
function OpenOrderBusinessSheet({ onClose, onPick }: SheetBodyProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { height: windowHeight } = useWindowDimensions();
  const businesses = useLoadWithRetry('own-businesses', readOwnBusinesses);
  const tall = businesses.state === 'loaded' && businesses.data.length > SHORT_SHEET_MAX_ROWS;

  let body: React.ReactNode;
  if (businesses.state === 'loading') {
    body = (
      <View style={styles.loading}>
        <ActivityIndicator
          testID="order-business-loading"
          size="large"
          color={t.brand.tint}
          accessibilityLabel={tr('common.loading')}
        />
      </View>
    );
  } else if (businesses.state === 'failed') {
    body = (
      <ReportEmptyState
        icon="alert-circle-outline"
        tone="error"
        message={tr('lists.order.businessesFailed')}
        description={tr('common.checkConnection')}
        actionLabel={tr('common.retry')}
        onAction={businesses.retry}
      />
    );
  } else if (businesses.data.length === 0) {
    body = (
      <ReportEmptyState
        icon="account-off-outline"
        message={tr('lists.order.noBusinessTitle')}
        description={tr('lists.order.noBusinessMessage')}
      />
    );
  } else {
    body = (
      <CustomerChoiceRows
        customers={businesses.data.map((business) => ({ ...business, detail: business.city }))}
        onPick={({ id, name, city }) => onPick({ id, name, city })}
        hint={tr('lists.order.chooseBusinessHint')}
        testIDPrefix="order-business-"
        unnamedLabel={tr('common.customer')}
      />
    );
  }

  return (
    <SheetFrame visible title={tr('lists.order.chooseBusiness')} onClose={onClose} tall={tall}>
      <ScrollView
        testID="order-business-scroll"
        style={[styles.scroll, tall ? styles.scrollTall : { maxHeight: windowHeight * SHORT_SHEET_WINDOW_SHARE }]}
        contentContainerStyle={styles.scrollContent}
      >
        {body}
      </ScrollView>
    </SheetFrame>
  );
}

export function OrderBusinessSheet({ visible, onClose, onPick }: OrderBusinessSheetProps) {
  if (!visible) return null;
  return <OpenOrderBusinessSheet onClose={onClose} onPick={onPick} />;
}

export default OrderBusinessSheet;
