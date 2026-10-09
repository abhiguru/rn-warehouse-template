/**
 * GRNOverviewTab Component
 *
 * Uses shared overview tab components for consistent Fiori styling
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import { useTokens } from '@/hooks/useTheme';
import {
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
          <SectionHeader title="Participants" />

          {customer_details && (
            <ContactCard
              type="Customer"
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
              type="Supervisor"
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
          <SectionHeader title="Vehicle" />
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
          <SectionHeader title="Billing" />
          <View style={overviewStyles.chipsCard}>
            <InfoChip
              icon={isOneTime ? 'calendar-check' : 'calendar-sync'}
              label={isOneTime ? 'One-time charge' : 'Monthly recurring'}
              iconColor={t.status.neutral.text}
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
