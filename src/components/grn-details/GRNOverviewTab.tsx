/**
 * GRNOverviewTab Component
 *
 * Uses shared overview tab components for consistent Fiori styling
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import {
  FIORI,
  overviewStyles,
  useOverviewColors,
  SectionHeader,
  ContactCard,
  InfoChip,
  NotesSection,
  ActionsSection,
} from '@/components/common/overview-tab';

// Using snake_case to match backend RPC types
interface CustomerDetails {
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
  gr_no?: string;
  can_edit?: boolean;
  can_delete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSharePDF?: () => void;
  is_share_loading?: boolean;
  onPrint?: () => void;
  is_print_loading?: boolean;
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
  can_delete,
  onEdit,
  onDelete,
  onSharePDF,
  is_share_loading = false,
  onPrint,
  is_print_loading = false,
}) => {
  const colorStyles = useOverviewColors();

  return (
    <ScrollView
      style={[overviewStyles.container, colorStyles.container]}
      contentContainerStyle={overviewStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: PARTICIPANTS */}
      {(customer_details || supervisor_details) && (
        <>
          <SectionHeader title="Participants" />

          {customer_details && (
            <ContactCard
              type="Customer"
              name={customer_details.name}
              phone={customer_details.mobile || undefined}
              email={customer_details.email || undefined}
              iconName="account"
              iconColor={FIORI.colors.primary}
              iconBgColor={FIORI.colors.primaryLight}
            />
          )}

          {supervisor_details && (
            <ContactCard
              type="Supervisor"
              name={supervisor_details.name}
              phone={supervisor_details.mobile || undefined}
              iconName="account-supervisor"
              iconColor={FIORI.colors.info}
              iconBgColor={FIORI.colors.infoLight}
            />
          )}
        </>
      )}

      {/* SECTION: VEHICLE INFORMATION */}
      {registration && (
        <>
          <SectionHeader title="Vehicle Information" />
          <View style={overviewStyles.chipsCard}>
            <InfoChip
              icon="truck"
              label={registration}
              iconColor={FIORI.colors.success}
            />
          </View>
        </>
      )}

      {/* SECTION: BILLING TYPE */}
      {pricing_mode && (
        <>
          <SectionHeader title="Billing Type" />
          <View style={overviewStyles.chipsCard}>
            <InfoChip
              icon={pricing_mode.toUpperCase() === 'ONE_TIME' ? 'calendar-check' : 'calendar-sync'}
              label={pricing_mode.toUpperCase() === 'ONE_TIME' ? 'One-Time Charge' : 'Monthly Recurring'}
              iconColor={pricing_mode.toUpperCase() === 'ONE_TIME' ? FIORI.colors.info : FIORI.colors.primary}
            />
          </View>
        </>
      )}

      {/* SECTION: NOTES */}
      {note && <NotesSection note={note} />}

      {/* SECTION: ACTIONS */}
      <ActionsSection
        entityType="GRN"
        entityNumber={gr_no}
        entityId={grn_id}
        onSharePDF={onSharePDF}
        isShareLoading={is_share_loading}
        onPrint={onPrint}
        isPrintLoading={is_print_loading}
        onEdit={onEdit}
        canEdit={can_edit}
        canDelete={can_delete}
        onDelete={onDelete}
      />

      {/* Bottom Spacing */}
      <View style={overviewStyles.bottomSpacer} />
    </ScrollView>
  );
};
