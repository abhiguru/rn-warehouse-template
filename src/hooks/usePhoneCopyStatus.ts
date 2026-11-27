/**
 * The phone copy's published state for screens (WH-298, contract 7.2), and whether the copy and its status bar are on
 * for the signed-in person.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useFacilityCapabilities } from '@/hooks/useCapability';
import { formatCopySize } from '@/features/phone-copy/copyStorage';
import { getSyncSnapshot, subscribeSync, type SyncSnapshot } from '@/features/phone-copy/syncStore';
import { t } from '@/i18n';
import { useAppSelector } from '@/store/hooks';
import { isCopyRole } from '@/config/copyRoles';
import { copyKindOf } from '@/features/phone-copy/copyKind';
import { eraseCopy } from '@/features/phone-copy/copyDb';

export function usePhoneCopyStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

/** A signed-in administrator, supervisor, staff member or customer account: the person the phone copy is for. */
export function useCopySession(): boolean {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  return isCopyRole(role);
}

/**
 * A signed-in person whose role has no phone copy keeps none, and a copy is kept only for the kind of role it was loaded
 * for (a warehouse copy holds every customer's rows, a customer account's only its own; WH-306): the file and its key are
 * erased, and the next first load builds the copy for the new role. A facility without the feature is
 * PhoneCopyLifecycle's to erase; a sign-out erases through the session teardown.
 */
export function useEraseCopyForRole(): void {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const kind = usePhoneCopyStatus().kind;
  useEffect(() => {
    if (role === undefined) return;
    if (isCopyRole(role) && (kind === undefined || kind === copyKindOf(role))) return;
    void eraseCopy();
  }, [role, kind]);
}

/** The facility has the feature for this session and the server has not turned it off since. */
export function useCopyFeatureOn(): boolean {
  const session = useCopySession();
  const capability = useFacilityCapabilities().sync === true;
  const feature = useSyncExternalStore(subscribeSync, () => getSyncSnapshot().feature, () => getSyncSnapshot().feature);
  return session && capability && feature !== 'off';
}

/**
 * Settings' note on the space the copy takes (Design offline-capture.md 1.4, "Space used"): "Data on this phone:
 * 151 MB. 2.3 GB free on the phone."; undefined when the copy is off or its size is not known yet. Both are read
 * after each stage and each full sync.
 */
export function useCopySpaceText(): string | undefined {
  const on = useCopyFeatureOn();
  const { copyBytes, freeBytes } = usePhoneCopyStatus();
  if (!on || copyBytes === null || freeBytes === null || freeBytes === undefined) return undefined;
  return t('settings.copySpace.footer', { size: formatCopySize(copyBytes), free: formatCopySize(freeBytes) });
}
