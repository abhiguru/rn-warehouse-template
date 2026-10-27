import { useSyncExternalStore } from 'react';
import { isUpgrading, subscribeUpgrading } from '@/config/upgradeNotice';
import { useMaintenanceMode } from '@/hooks/useConfig';

/**
 * True while the facility's server is being upgraded: the gateway answered "upgrading" to the last request
 * (src/config/upgradeNotice.ts), or the facility's configuration says it is in maintenance mode.
 */
export function useUpgrading(): boolean {
  const answered = useSyncExternalStore(subscribeUpgrading, isUpgrading, isUpgrading);
  const maintenance = useMaintenanceMode();
  return answered || maintenance;
}
