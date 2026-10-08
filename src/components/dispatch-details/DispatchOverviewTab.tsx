/**
 * DispatchOverviewTab Component
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

interface DispatchOverviewTabProps {
  customer_details?: CustomerDetails | null;
  supervisor_details?: SupervisorDetails | null;
  registration?: string;
  note?: string;
  source_order_no?: string;
  dispatch_id?: string;
  disp_no?: string;
  can_edit?: boolean;
  can_delete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSharePDF?: () => void;
  is_share_loading?: boolean;
  onPrint?: () => void;
  is_print_loading?: boolean;
}

export const DispatchOverviewTab: React.FC<DispatchOverviewTabProps> = ({
  customer_details,
  supervisor_details,
  registration,
  note,
  source_order_no,
  dispatch_id,
  disp_no,
  can_edit = true,
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
              iconName="account-tie"
              iconColor={FIORI.colors.info}
              iconBgColor={FIORI.colors.infoLight}
            />
          )}
        </>
      )}

      {/* SECTION: ADDITIONAL INFORMATION */}
      {(registration || source_order_no) && (
        <>
          <SectionHeader title="Additional Information" />
          <View style={overviewStyles.chipsCard}>
            {registration && (
              <InfoChip
                icon="truck"
                label={registration}
                iconColor={FIORI.colors.success}
              />
            )}
            {source_order_no && (
              <InfoChip
                icon="file-document-outline"
                label={source_order_no}
                iconColor={FIORI.colors.warning}
              />
            )}
          </View>
        </>
      )}

      {/* SECTION: NOTES */}
      {note && <NotesSection note={note} />}

      {/* SECTION: ACTIONS */}
      <ActionsSection
        entityType="Dispatch"
        entityNumber={disp_no}
        entityId={dispatch_id}
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
