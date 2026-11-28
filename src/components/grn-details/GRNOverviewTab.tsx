/**
 * GRNOverviewTab Component
 *
 * Uses shared overview tab components for consistent Fiori styling
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import { useTokens } from '@/hooks/useTheme';
import {
  useOverviewStyles,
  useOverviewColors,
  ContactCard,
  InfoChip,
  NotesSection,
  ActionsSection,
} from '@/components/common/overview-tab';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { t as tr } from '@/i18n';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { GrnItemRates } from '@/features/grn/rates/GrnItemRates';
import type { RpcGrnRate } from '@/types/rpc-canonical.types';

// Using snake_case to match backend RPC types
interface CustomerDetails {
  id?: string;
  name: string;
  mobile?: string | null;
  email?: string | null;
}

interface SupervisorDetails {
  name: string;
  mobile?: string | null;
}

interface GRNOverviewTabProps {
  customer_details?: CustomerDetails | null;
  supervisor_details?: SupervisorDetails | null;
  registration?: string | null;
  note?: string | null;
  pricing_mode?: 'monthly' | 'one_time' | 'MONTHLY' | 'ONE_TIME' | string | null;
  grn_id?: string;
  gr_no?: string | null;
  can_edit?: boolean;
  /** The rates action (WH-180: stays available on an imported GRN, where `can_edit` is false). Defaults to `can_edit`. */
  can_edit_rates?: boolean;
  /** WH-180: the GRN was imported; its rates get a Set rates entry. */
  imported?: boolean;
  can_delete?: boolean;
  /** The GRN is being deleted: the Delete button is disabled. */
  is_deleting?: boolean;
  /** Delete is busy only because the orders it would change are being read: the button says so. */
  is_checking_orders?: boolean;
  onDelete?: () => void;
  onSharePDF?: () => void;
  is_share_loading?: boolean;
  onPrint?: () => void;
  is_print_loading?: boolean;
  /** Rates for this GRN only (backend migration 86). */
  rates?: RpcGrnRate[] | null;
  /** The rates are not on the phone (WH-299): the section keeps its heading and says it needs a connection. */
  ratesNeedConnection?: boolean;
  /** The phone is offline and reads its copy: every action needs the server. */
  needsConnection?: boolean;
  /** Why they wait, when it is not "Needs a connection" (WH-161). */
  needsConnectionNote?: string;
  /** What the GRN's items are counted in (see sharedPackaging): the rates note says "per box" for boxes. */
  packaging?: string;
  /** What each lot (GRN item id) is counted in, for the Your-rate page. */
  packagingByLot?: Record<string, string | null | undefined>;
}

export const GRNOverviewTab: React.FC<GRNOverviewTabProps> = ({
  customer_details,
  supervisor_details,
  registration,
  note,
  pricing_mode,
  grn_id,
  gr_no,
  can_edit = false,
  can_edit_rates,
  imported = false,
  can_delete,
  is_deleting = false,
  is_checking_orders = false,
  onDelete,
  onSharePDF,
  is_share_loading = false,
  onPrint,
  is_print_loading = false,
  rates,
  ratesNeedConnection = false,
  needsConnection = false,
  needsConnectionNote,
  packaging,
  packagingByLot,
}) => {
  const colorStyles = useOverviewColors();
  const overviewStyles = useOverviewStyles();
  const t = useTokens();
  const isOneTime = pricing_mode?.toUpperCase() === 'ONE_TIME';

  return (
    <ScrollView
      style={[overviewStyles.container, colorStyles.container]}
      contentContainerStyle={overviewStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: PARTICIPANTS */}
      {(customer_details || supervisor_details) && (
        <>
          <SectionHeader title={tr('grn.overview.participants')} inset={false} />

          {customer_details && (
            <ContactCard
              type={tr('common.customer')}
              name={customer_details.name}
              phone={customer_details.mobile || undefined}
              email={customer_details.email || undefined}
              iconName="account-outline"
              iconColor={t.brand.tint}
              iconBgColor={t.brand.subtle}
            />
          )}

          {supervisor_details && (
            <ContactCard
              type={tr('grn.header.supervisor')}
              name={supervisor_details.name}
              phone={supervisor_details.mobile || undefined}
              iconName="account-supervisor-outline"
              iconColor={t.status.neutral.text}
              iconBgColor={t.status.neutral.background}
            />
          )}
        </>
      )}

      {/* SECTION: VEHICLE INFORMATION */}
      {registration && (
        <>
          <SectionHeader title={tr('grn.overview.vehicle')} inset={false} />
          <View style={overviewStyles.chipsCard}>
            <InfoChip
              icon="truck-outline"
              label={registration}
              iconColor={t.status.neutral.text}
            />
          </View>
        </>
      )}

      {/* SECTION: BILLING TYPE */}
      {pricing_mode && (
        <>
          <SectionHeader title={tr('grn.overview.billing')} inset={false} />
          <View style={overviewStyles.chipsCard}>
            <InfoChip
              icon={isOneTime ? 'calendar-check' : 'calendar-sync'}
              label={isOneTime ? tr('grn.overview.oneTimeCharge') : tr('grn.overview.monthlyRecurring')}
              iconColor={t.status.neutral.text}
            />
          </View>
        </>
      )}

      {/* SECTION: RATES (the rate each item is invoiced at; the GRN-only rates on a server without migration 88) */}
      {ratesNeedConnection ? (
        <>
          <SectionHeader title={tr('grn.rates.title')} inset={false} />
          <NeedsConnectionLine testID="grn-details-section-needs-connection-rates" text={tr('components.offlineRead.screenNeedsConnection')} icon />
        </>
      ) : (
      <GrnItemRates grnId={grn_id} grnNumber={gr_no} customerId={customer_details?.id} customerName={customer_details?.name} canEdit={can_edit_rates ?? can_edit} imported={imported} fallbackRates={rates} packaging={packaging} packagingByLot={packagingByLot} />
      )}

      {/* SECTION: NOTES */}
      {note && <NotesSection note={note} />}

      {/* SECTION: ACTIONS */}
      <ActionsSection
        entity="grn"
        entityNumber={gr_no ?? undefined}
        entityId={grn_id}
        onSharePDF={onSharePDF}
        isShareLoading={is_share_loading}
        onPrint={onPrint}
        isPrintLoading={is_print_loading}
        canEdit={can_edit}
        canDelete={can_delete}
        onDelete={onDelete}
        isDeleting={is_deleting || is_checking_orders}
        deleteBusyLabel={is_checking_orders && !is_deleting ? tr('orders.effect.checking') : undefined}
        // The GRN page asks its own, fuller question (the items leave stock; a GRN with dispatches or invoices can't be
        // deleted): the person is asked once, not twice.
        confirmDelete={false}
        needsConnectionTestId={needsConnection ? 'grn-details-bottom-bar-needs-connection' : undefined}
        needsConnectionNote={needsConnectionNote}
      />

      {/* Bottom Spacing */}
      <View style={overviewStyles.bottomSpacer} />
    </ScrollView>
  );
};
