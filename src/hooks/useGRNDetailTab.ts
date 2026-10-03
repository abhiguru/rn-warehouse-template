import { useEffect, useState } from 'react';
import type { TabKey } from '@/components/grn-details';

/** Honor an explicit Overview link while keeping the usual GRN Items entry. */
export function useGRNDetailTab(id: string | string[] | undefined, requestedTab?: string | string[]) {
  const grnId = Array.isArray(id) ? id[0] : id;
  const entryTab: TabKey = requestedTab === 'overview' ? 'overview' : 'items';
  const [activeTab, setActiveTab] = useState<TabKey>(entryTab);
  useEffect(() => { setActiveTab(entryTab); }, [grnId, entryTab]);
  return [activeTab, setActiveTab] as const;
}
