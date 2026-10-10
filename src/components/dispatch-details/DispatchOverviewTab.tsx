/**
 * DispatchOverviewTab Component
 *
 * Uses shared overview tab components for consistent Fiori styling
 */

import React from 'react';
import { View, ScrollView } from 'react-native';
import { useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import {
  useOverviewStyles,
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
  const overviewStyles = useOverviewStyles();
  const t = useTokens();

  return (
    <ScrollView
      style={[overviewStyles.container, colorStyles.container]}
      contentContainerStyle={overviewStyles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SECTION: PARTICIPANTS */}
      {(customer_details || supervisor_details) && (
        <>
          <SectionHeader title={tr('dispatch.details.participants')} />

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
              type={tr('dispatch.form.supervisor')}
              name={supervisor_details.name}
              phone={supervisor_details.mobile || undefined}
              iconName="account-tie"
              iconColor={t.status.informative.text}
              iconBgColor={t.status.informative.background}
            />
          )}
        </>
      )}

      {/* SECTION: ADDITIONAL INFORMATION */}
      {(registration || source_order_no) && (
        <>
          <SectionHeader title={tr('dispatch.details.additionalInfo')} />
          <View style={overviewStyles.chipsCard}>
            {registration && (
              <InfoChip
                icon="truck-outline"
                label={registration}
                iconColor={t.icon.secondary}
              />
            )}
            {source_order_no && (
              <InfoChip
                icon="file-document-outline"
                label={source_order_no}
                iconColor={t.icon.secondary}
              />
            )}
          </View>
        </>
      )}

      {/* SECTION: NOTES */}
      {note && <NotesSection note={note} />}

      {/* SECTION: ACTIONS */}
      <ActionsSection
        entity="dispatch"
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
