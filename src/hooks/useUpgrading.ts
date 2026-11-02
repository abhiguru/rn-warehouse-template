import { useSyncExternalStore } from 'react';
import { isUpgrading, subscribeUpgrading } from '@/config/upgradeNotice';

/**
 * True while the facility's server is being upgraded: the gateway answered "upgrading" (503) to the last request
 * (src/config/upgradeNotice.ts). It clears once the server answers normally.
 */
export function useUpgrading(): boolean {
  return useSyncExternalStore(subscribeUpgrading, isUpgrading, isUpgrading);
}
