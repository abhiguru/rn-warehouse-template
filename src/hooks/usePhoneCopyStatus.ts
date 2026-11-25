/**
 * The phone copy's published state for screens (WH-298, contract 7.2), and whether the copy and its status bar are on
 * for the signed-in person.
 */
import { useSyncExternalStore } from 'react';
import { getFacilityCapabilities, subscribeFacilityCapabilities } from '@/config/facilityCapabilities';
import { onOperatorServerChange } from '@/config/operatorServer';
import { getSyncSnapshot, subscribeSync, type SyncSnapshot } from '@/features/phone-copy/syncStore';
import { useAppSelector } from '@/store/hooks';
import type { UserRole } from '@/types/user.types';

/** Customer accounts keep today's behaviour until WH-306 (Product's P5). */
const COPY_ROLES: readonly UserRole[] = ['admin', 'supervisor', 'staff'];

export function usePhoneCopyStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

const subscribeCapabilities = (listener: () => void) => {
  const stopCapabilities = subscribeFacilityCapabilities(listener);
  const stopServer = onOperatorServerChange(listener);
  return () => {
    stopCapabilities();
    stopServer();
  };
};
const readSync = () => getFacilityCapabilities().sync;

/** A signed-in administrator, supervisor or staff member: the person the phone copy is for. */
export function useCopySession(): boolean {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  return role !== undefined && COPY_ROLES.includes(role);
}

/** The facility has the feature for this session and the server has not turned it off since. */
export function useCopyFeatureOn(): boolean {
  const session = useCopySession();
  const capability = useSyncExternalStore(subscribeCapabilities, readSync, readSync);
  const feature = useSyncExternalStore(subscribeSync, () => getSyncSnapshot().feature, () => getSyncSnapshot().feature);
  return session && capability && feature !== 'off';
}
