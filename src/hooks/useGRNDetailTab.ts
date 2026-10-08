import { useEffect, useState } from 'react';
import type { TabKey } from '@/components/grn-details';

/** Honor an explicit Overview link while keeping the usual GRN Items entry. */
export function useGRNDetailTab(id: string | string[] | undefined, requestedTab?: string | string[]) {
  const grnId = Array.isArray(id) ? id[0] : id;
  // Expo Router hands repeated query parameters over as arrays; honour the
  // first value the same way the id is unwrapped.
  const tab = Array.isArray(requestedTab) ? requestedTab[0] : requestedTab;
  const entryTab: TabKey = tab === 'overview' ? 'overview' : 'items';
  const [activeTab, setActiveTab] = useState<TabKey>(entryTab);
  useEffect(() => { setActiveTab(entryTab); }, [grnId, entryTab]);
  return [activeTab, setActiveTab] as const;
}
