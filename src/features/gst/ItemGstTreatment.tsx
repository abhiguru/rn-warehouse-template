/**
 * "GST on storage" on the item page (WH-151, backend migration 173): Exempt (agricultural produce) or Taxable. Administrators and
 * supervisors change it (`set_item_gst_treatment`, audited); it is the server that keeps the value, and the row shows only what
 * the server confirmed. Every item is Taxable until it is marked, so no bill changes until then.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { backendHasFeature } from '@/config/backendFeatures';
import { canOpenScreen } from '@/config/roles';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { SettingsRow, SettingsSection } from '@/features/settings/components/SettingsList';
import { PreferenceSheet, type PreferenceOption } from '@/features/settings/components/PreferenceSheet';
import {
  GstTreatmentUnconfirmedError,
  getItemGstTreatment,
  setItemGstTreatment,
  type GstTreatment,
} from '@/services/gstService';
import { t as tr } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';

const LABEL_KEY: Record<GstTreatment, 'gst.item.exemptAgri' | 'gst.item.taxable'> = {
  exempt_agri: 'gst.item.exemptAgri',
  taxable: 'gst.item.taxable',
};

export function ItemGstTreatment({ itemId }: { itemId: string }) {
  const role = useAppSelector((state) => state.auth.userProfile?.role);
  const offline = useIsOffline();
  const enabled = backendHasFeature('gstDocuments') && canOpenScreen(role, 'masterData');
  const [treatment, setTreatment] = useState<GstTreatment | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentItem = useRef(itemId);
  currentItem.current = itemId;

  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    setTreatment(null);
    void getItemGstTreatment(itemId).then((value) => {
      if (current) setTreatment(value);
    });
    return () => {
      current = false;
    };
  }, [enabled, itemId]);

  const choose = useCallback(
    async (value: GstTreatment) => {
      setSheet(false);
      if (value === treatment) return;
      if (offline) {
        showAlert(tr('gst.item.label'), tr('gst.item.offline'));
        return;
      }
      setBusy(true);
      try {
        const saved = await setItemGstTreatment(itemId, value);
        if (currentItem.current === itemId) setTreatment(saved);
        showToast(tr('gst.item.changed'));
      } catch (failure) {
        showAlert(tr('gst.item.label'), failure instanceof Error ? failure.message : tr('gst.item.saveFailed'));
        if (failure instanceof GstTreatmentUnconfirmedError) {
          void getItemGstTreatment(itemId).then((current) => {
            if (currentItem.current === itemId) setTreatment(current);
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [itemId, offline, treatment]
  );

  if (!enabled) return null;

  const options: PreferenceOption<GstTreatment>[] = [
    { value: 'taxable', label: tr('gst.item.taxable') },
    { value: 'exempt_agri', label: tr('gst.item.exemptAgri') },
  ];

  return (
    <>
      <SettingsSection title={tr('gst.item.label')} footer={tr('gst.item.help')} testID="item-gst-treatment">
        <SettingsRow
          testID="item-gst-treatment-row"
          label={tr('gst.item.label')}
          value={treatment ? tr(LABEL_KEY[treatment]) : tr('gst.item.readFailed')}
          onPress={() => setSheet(true)}
          busy={busy}
          last
        />
      </SettingsSection>
      {sheet ? (
        <PreferenceSheet
          visible
          title={tr('gst.item.label')}
          options={options}
          selected={treatment ?? 'taxable'}
          onSelect={(value) => void choose(value)}
          onClose={() => setSheet(false)}
          notes={[tr('gst.item.help')]}
          testID="item-gst-treatment-sheet"
        />
      ) : null}
    </>
  );
}
