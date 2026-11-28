/**
 * What Customer activity adds when its answer is a kept one (WH-305, Design offline-capture.md 8.6 DQ5 and 8.7): the age line
 * or strip (the same words as dues and the statement), the "not on this phone yet" state, and the period chip that shows the
 * kept answer's own dates, disabled while offline.
 */
import React, { useEffect, useState } from 'react';
import type { KeptActivity } from '@/features/reports/keptActivity';
import { t as tr } from '@/i18n';
import { formatCardDate } from '@/utils/formatters';
import { businessDate } from '../pgCompat';
import { useCopyOffline } from '../useCopyOffline';
import { needsConnectionLabel } from '../useNeedsConnection';
import { MoneyAgeLine } from './MoneyAgeLine';
import { copyHasStock } from './moneyStore';

interface ActivityQuery {
  moneyKept?: KeptActivity;
  moneyNotHere?: boolean;
}

/** Whether the copy holds goods in store for the customer (null: every customer). True until it is read: the cautious wording. */
function useCopyStock(customerId: string | null): boolean {
  const [has, setHas] = useState(true);
  useEffect(() => {
    let live = true;
    void copyHasStock(customerId).then(found => {
      if (live) setHas(found);
    });
    return () => {
      live = false;
    };
  }, [customerId]);
  return has;
}

export function useActivityMoney(query: ActivityQuery) {
  const offline = useCopyOffline();
  const kept = query.moneyKept;
  const hasStock = useCopyStock(kept?.customerId ?? null);
  const notHere = query.moneyNotHere
    ? { testID: 'customer-activity-not-here', title: tr('money.activityNotHereTitle'), text: tr('money.statementNotHereText') }
    : undefined;
  const label = kept ? `${formatCardDate(kept.from)} – ${formatCardDate(kept.to)}` : '';
  const periodChip = kept && offline ? { label, accessibilityLabel: needsConnectionLabel(label) } : undefined;
  const ageLine = kept ? <MoneyAgeLine asOf={kept.asOf} today={businessDate(kept.asOf)} hasStock={hasStock} /> : null;
  return { notHere, periodChip, ageLine };
}
