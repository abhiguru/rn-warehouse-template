/**
 * The quick change of a lot's rack and mark from a row (WH-302, product/tech/app-offline-quick-change.md section 5;
 * Design Part 5). One hook per screen: `open(target)` shows the sheet, Save stores the change through `saveLotChange` and,
 * with the server reachable, waits up to 8 s for the answer. A refusal while the sheet is open is told at once and nothing
 * is kept on the phone.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { backendHasFeature } from '@/config/backendFeatures';
import { hasCapability } from '@/config/facilityCapabilities';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import { refuseAtLimit } from '@/features/unsent/limitDialog';
import { deleteItem } from '@/features/unsent/unsentQueue';
import { t as tr } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { showAlert } from '@/utils/alert';
import { createLogger, loggableError } from '@/utils/logger';
import { showToast } from '@/utils/toast';
import { saveLotChange, type LotValues } from './lotChangeService';
import { QUICK_CHANGE_WAIT_MS, waitForOutcome } from './quickChangeOutcome';
import { QuickChangeSheet } from './QuickChangeSheet';

const logger = createLogger('[quick-change]');

/** What a row tells the sheet about the lot. */
export interface QuickChangeTarget {
  lotId: string;
  grnId: string;
  /** The GRN number, an identifier (0-9). */
  grnNumber: string;
  customer: string | null;
  itemName: string;
  /** What the row shows now (the phone's values, an unsent change applied). */
  shown: LotValues;
  /** What the server holds, when the phone knows it apart from `shown` (the copy's row); else `shown`. */
  confirmed?: LotValues;
}

const ROLES: readonly string[] = ['admin', 'supervisor', 'staff'];

export function useQuickChange(): {
  /** The button shows: the feature is on, the server has the function, and the role may. */
  available: boolean;
  open: (target: QuickChangeTarget) => void;
  /** The sheet, to render once in the screen. */
  sheet: React.ReactElement | null;
} {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const [target, setTarget] = useState<QuickChangeTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const available = hasCapability('sync') && backendHasFeature('lotQuickChange') && typeof role === 'string' && ROLES.includes(role);

  const open = useCallback((next: QuickChangeTarget) => {
    // The 2-hour limit: the dialog instead of the sheet.
    if (refuseAtLimit()) return;
    setRefusal(null);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setSaving(false);
    setRefusal(null);
  }, []);

  const save = useCallback(
    async (values: { rack?: string | null; package_mark?: string | null }) => {
      if (!target || saving) return;
      setSaving(true);
      setRefusal(null);
      // The limit may have been reached while the sheet was open: the dialog, and nothing is kept.
      if (refuseAtLimit()) {
        setSaving(false);
        return;
      }
      try {
        const saved = await saveLotChange({
          lotId: target.lotId,
          grnId: target.grnId,
          grnNumber: target.grnNumber,
          ...(target.customer ? { customer: target.customer } : {}),
          copy: target.confirmed ?? target.shown,
          ...values,
        });
        if (saved.dropped) {
          close();
          return;
        }
        if (isCopyOffline()) {
          close();
          showToast(tr('offline.quickChange.savedOnPhone'));
          return;
        }
        const outcome = await waitForOutcome(saved.id, QUICK_CHANGE_WAIT_MS);
        if (outcome.kind === 'refused') {
          // Told at once and nothing kept: the item leaves the queue, the sheet stays with what was typed.
          await deleteItem(saved.id);
          setRefusal(outcome.reason ? tr('offline.quickChange.refused', { reason: outcome.reason }) : tr('offline.quickChange.refusedUnknown'));
          setSaving(false);
          return;
        }
        close();
        showToast(tr(outcome.kind === 'sent' ? 'offline.quickChange.saved' : 'offline.quickChange.savedOnPhone'));
      } catch (error) {
        logger.warn('A quick change could not be saved', loggableError(error));
        setSaving(false);
        showAlert(tr('offline.quickChange.title'), tr('errors.general.unexpectedRetry'));
      }
    },
    [target, saving, close]
  );

  const sheet = useMemo(
    () =>
      target ? (
        <QuickChangeSheet
          key={target.lotId}
          target={target}
          saving={saving}
          refusal={refusal}
          onClearRefusal={() => setRefusal(null)}
          onSave={values => void save(values)}
          onClose={close}
        />
      ) : null,
    [target, saving, refusal, save, close]
  );

  return { available, open, sheet };
}
