/**
 * The status a dispatch shows (style guide §3.5): the Dispatch list card and the hero of the dispatch page
 * use this one, so both say the same words in the same colours.
 */
import type { IconName } from '@/types/icon.types';
import { t as translate } from '@/i18n';

export interface DispatchStatus {
  kind: 'positive' | 'critical';
  label: string;
  icon: IconName;
}

/** Complete once something has been dispatched (total quantity above 0); Pending before that. */
export function getDispatchStatus(dispatch: { total_qty?: number | null }): DispatchStatus {
  if (dispatch.total_qty && dispatch.total_qty > 0) {
    return { kind: 'positive', label: translate('lists.dispatch.statusComplete'), icon: 'check-circle' };
  }
  return { kind: 'critical', label: translate('common.pending'), icon: 'alert' };
}
