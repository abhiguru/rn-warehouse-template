/**
 * The account actions of Settings and Profile, in one place, so both screens
 * say the same thing and do the same cleanup (docs/STYLE_GUIDE.md §14.8, §14.12).
 *
 * Which actions there are depends on the sign-in in use:
 *
 * - `legacy` (no central login in this build): "Sign out" ends the facility
 *   session and opens the sign-in screen.
 * - `central` (central login on, signed in to the association): "Leave this
 *   facility" returns to My facilities and keeps the association sign-in;
 *   "Sign out of this phone" ends both (the same as Sign out on My facilities).
 * - `centralSignedOut` (central login on, but the association sign-in is not
 *   there, for example a facility opened with its own SMS sign-in after the
 *   association sign-in ended): "Sign out" leaves the facility with the same
 *   cleanup as leaving it; a code is needed to come back.
 *
 * Deleting the account is here too: in a central build it deletes the account
 * at the facility that is open only, and both steps of the dialog say so.
 */
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { deleteAccount as deleteAccountThunk, isDeleteAccountRejection, logout } from '@/store/slices/authSlice';
import { leaveFacility } from '@/store/operatorSwitch';
import { deleteFacilityAccount, signOutEverywhere, type CentralEndOutcome } from '@/store/centralSignOut';
import { isCentralLoginConfigured } from '@/config/envConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { adminUserService } from '@/services/admin-user-service';
import { useCentralState } from '@/hooks/useCentralState';
import { normalizeDigits, t } from '@/i18n';
import { showAlert } from '@/utils/alert';
import type { ConfirmDialogProps } from '@/components/ConfirmDialog';
import type { ConfirmInputDialogProps } from '@/components/ConfirmInputDialog';

type Dispatch = (action: any) => any;

export type AccountMode = 'legacy' | 'central' | 'centralSignedOut';
export type AccountActionId = 'signOut' | 'leaveFacility' | 'signOutPhone';

export interface AccountAction {
  id: AccountActionId;
  icon: string;
  label: string;
  subtitle: string;
  /** Drawn in the negative colour, without a chevron. */
  destructive: boolean;
  testID: string;
}

export type AccountDialogProps = ConfirmDialogProps & { busy: boolean };

export interface AccountDeletion {
  /**
   * False for a profile without a mobile number: the final step asks for it, so
   * such an account could never be deleted here, and the row is not shown.
   */
  available: boolean;
  /** The row: "Delete account", or "Delete my account at <facility>" with central login. */
  label: string;
  subtitle: string;
  /**
   * Opens the first step (the warning). An administrator is checked first: the only one is told
   * so in an alert and the warning stays closed. The check runs in the background; the caller waits for nothing.
   */
  open: () => void;
  /** Props for one ConfirmInputDialog: the warning step, then the step with the mobile number. */
  dialog: ConfirmInputDialogProps;
  /** The final step: checks the number and deletes. */
  deleteAccount: () => Promise<void>;
}

/**
 * "Sign out" on My facilities and "Sign out of this phone" inside a facility:
 * ends the association sign-in and the facility, and tells the person when the
 * phone could not do it all.
 */
export async function signOutPhoneWithMessages(dispatch: Dispatch): Promise<CentralEndOutcome> {
  const result = await signOutEverywhere(dispatch);
  if (result.ok && result.facilityCleanup === 'failed')
    showAlert(t('central.switch.failedTitle'), t('common.checkConnection'));
  else if (!result.ok)
    showAlert(
      t('auth.signOut.couldNotTitle'),
      result.reason === 'local_clear_failed' ? t('central.signOut.notCleared') : t('central.switch.busyMessage')
    );
  return result;
}

/** Tells the person why leaving the facility did not happen. True when it did. */
function reportLeave(outcome: 'left' | 'busy' | 'failed' | 'reported'): boolean {
  if (outcome === 'busy') showAlert(t('auth.server.busyTitle'), t('central.switch.busyMessage'));
  else if (outcome === 'failed') showAlert(t('central.switch.failedTitle'), t('common.checkConnection'));
  return outcome === 'left';
}

export function useAccountActions(): {
  mode: AccountMode;
  facilityName: string;
  actions: AccountAction[];
  request: (id: AccountActionId) => void;
  dialog: AccountDialogProps;
  deletion: AccountDeletion;
} {
  const dispatch = useAppDispatch();
  const userProfile = useAppSelector(state => state.auth.userProfile);
  const central = useCentralState();
  const centralLogin = isCentralLoginConfigured();
  const mode: AccountMode = !centralLogin ? 'legacy' : central.status === 'signedIn' ? 'central' : 'centralSignedOut';
  const server = centralLogin ? getActiveOperatorServer() : null;
  const facilityName = server ? server.companyName || server.displayName || server.origin : '';

  const [pending, setPending] = useState<AccountActionId | null>(null);
  const [busy, setBusy] = useState(false);
  // Set at once, before the next draw: a second tap on the confirm button can arrive before `busy` is drawn.
  const running = useRef(false);

  const signOutAction: AccountAction = {
    id: 'signOut',
    icon: 'logout',
    label: t('auth.signOut.action'),
    subtitle: t('users.profile.signOutSubtitle'),
    destructive: false,
    testID: 'account-sign-out',
  };
  const actions: AccountAction[] =
    mode === 'central'
      ? [
          {
            id: 'leaveFacility',
            icon: 'exit-to-app',
            label: t('central.leave.action'),
            subtitle: facilityName
              ? t('central.leave.subtitle', { facility: facilityName })
              : t('central.leave.subtitleNoName'),
            destructive: false,
            testID: 'account-leave-facility',
          },
          {
            id: 'signOutPhone',
            icon: 'logout',
            label: t('central.phoneSignOut.action'),
            subtitle: t('central.phoneSignOut.subtitle'),
            destructive: false,
            testID: 'account-sign-out-phone',
          },
        ]
      : [signOutAction];

  const request = (id: AccountActionId) => {
    if (actions.some(action => action.id === id)) setPending(id);
  };
  const close = () => setPending(null);

  const run = async (id: AccountActionId) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (id === 'signOutPhone') {
        await signOutPhoneWithMessages(dispatch);
        close();
      } else if (id === 'leaveFacility' || mode !== 'legacy') {
        // Leaving the facility: the route guard shows My facilities, or the
        // association's sign-in when that has ended. No screen is pushed here.
        const outcome = await leaveFacility(dispatch);
        close();
        reportLeave(outcome);
      } else {
        try {
          await dispatch(logout()).unwrap();
          close();
          router.replace('/login');
        } catch {
          showAlert(t('auth.signOut.couldNotTitle'), t('common.checkConnection'));
          close();
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const dialogText = (id: AccountActionId | null): Pick<ConfirmDialogProps, 'title' | 'message' | 'confirmText' | 'variant' | 'icon'> => {
    if (id === 'leaveFacility')
      return {
        title: facilityName ? t('central.leave.confirmTitle', { facility: facilityName }) : t('central.leave.confirmTitleNoName'),
        message: t('central.leave.confirmMessage'),
        confirmText: t('central.leave.confirmAction'),
        variant: 'default',
        icon: 'exit-to-app',
      };
    if (id === 'signOutPhone')
      return {
        title: t('central.phoneSignOut.confirmTitle'),
        message: t('central.signOut.confirmMessage'),
        confirmText: t('auth.signOut.action'),
        variant: 'default',
        icon: 'logout',
      };
    return {
      title: t('auth.signOut.confirmTitle'),
      message: t('auth.signOut.confirmMessage'),
      confirmText: t('auth.signOut.action'),
      variant: 'default',
      icon: 'logout',
    };
  };

  const dialog: AccountDialogProps = {
    visible: pending !== null,
    ...dialogText(pending),
    busy,
    onCancel: () => {
      if (!busy) close();
    },
    onConfirm: () => {
      if (pending && !busy) void run(pending);
    },
  };

  // ---------------------------------------------------------------------------
  // Deleting the account (two steps: a warning, then the mobile number)
  // ---------------------------------------------------------------------------
  const [deleteStep, setDeleteStep] = useState<'warning' | 'confirm' | null>(null);
  const [deleteConfirmPhone, setDeleteConfirmPhone] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // As `running`: a second tap on Delete account before the next draw sends nothing.
  const deleting = useRef(false);
  // The account's number, the last ten digits (the profile may hold it in either field).
  const accountPhone = (userProfile?.mobile || userProfile?.phoneNumber || '').replace(/\D/g, '').slice(-10);
  // Without a number the final step could never match, so deletion is not offered.
  const deletionAvailable = accountPhone !== '';
  // With central login only the account at the open facility is deleted.
  const atFacility = centralLogin && facilityName !== '';

  // A second tap on Delete account while the administrator count is being read does nothing.
  const checkingAdmins = useRef(false);
  /** True only when the server says this is the one active administrator; a failed lookup says false (the server still refuses). */
  const isOnlyAdministrator = async (): Promise<boolean> => {
    try {
      // A connection (a service account) is not another administrator: the server's rule
      // (other_active_admin_exists) leaves it out, so the count does too.
      const result = await adminUserService.getUsersList({ roles: ['admin'], active: true }, 100, 0);
      if (!result.success || !result.data || result.data.pagination.has_more) return false;
      return result.data.users.filter(user => !user.is_service_account).length <= 1;
    } catch {
      return false;
    }
  };

  const cancelDeletion = () => {
    if (deletingAccount) return;
    setDeleteStep(null);
    setDeleteConfirmPhone('');
    setDeleteError(null);
  };

  const confirmDeleteAccount = async () => {
    if (!deletionAvailable || deleting.current) return;
    // ૦-૯ typed on a Gujarati keyboard count as 0-9.
    const normalizedInputPhone = normalizeDigits(deleteConfirmPhone)
      .replace(/\D/g, '')
      .slice(-10);

    // An empty field never matches, also for a profile without a number.
    if (!normalizedInputPhone || normalizedInputPhone !== accountPhone) {
      setDeleteError(t('settings.deleteAccount.mismatch'));
      return;
    }

    deleting.current = true;
    setDeletingAccount(true);
    setDeleteError(null);

    try {
      if (centralLogin) {
        // The profile at this facility is deleted; the route guard returns to My facilities.
        const outcome = await deleteFacilityAccount(dispatch);
        setDeleteStep(null);
        // 'reported': the failure was published on My facilities, where the person now is.
        reportLeave(outcome);
        return;
      }
      await dispatch(deleteAccountThunk()).unwrap();
      setDeleteStep(null);
      router.replace('/login');
    } catch (error) {
      setDeleteError(
        isDeleteAccountRejection(error)
          ? error.message
          : typeof error === 'string'
            ? error
            : t('settings.deleteAccount.failed')
      );
    } finally {
      deleting.current = false;
      setDeletingAccount(false);
    }
  };

  const facility = { facility: facilityName };
  const deletionDialog: ConfirmInputDialogProps =
    deleteStep === 'confirm'
      ? {
          visible: true,
          testID: 'delete-account-confirm',
          title: atFacility ? t('settings.deleteAccount.centralConfirmTitle', facility) : t('settings.deleteAccount.confirmTitle'),
          message: atFacility ? t('settings.deleteAccount.centralConfirmMessage', facility) : t('settings.deleteAccount.confirmMessage'),
          confirmText: t('settings.account.deleteAccount'),
          variant: 'danger',
          icon: 'trash-can-outline',
          busy: deletingAccount,
          onCancel: cancelDeletion,
          onConfirm: () => {
            if (!deletingAccount) void confirmDeleteAccount();
          },
          field: {
            value: deleteConfirmPhone,
            onChangeText: text => {
              setDeleteConfirmPhone(text);
              setDeleteError(null);
            },
            placeholder: t('settings.deleteAccount.phonePlaceholder'),
            accessibilityLabel: t('common.mobileNumber'),
            keyboardType: 'phone-pad',
            autoComplete: 'tel',
            textContentType: 'telephoneNumber',
            error: deleteError,
          },
        }
      : {
          visible: deleteStep === 'warning',
          testID: 'delete-account-warning',
          title: atFacility ? t('settings.deleteAccount.centralWarningTitle', facility) : t('settings.deleteAccount.warningTitle'),
          message: atFacility ? t('settings.deleteAccount.centralWarningMessage', facility) : t('settings.deleteAccount.warningMessage'),
          messageAlign: 'left',
          confirmText: t('common.continue'),
          variant: 'danger',
          icon: 'trash-can-outline',
          onCancel: cancelDeletion,
          onConfirm: () => setDeleteStep('confirm'),
        };

  const deletion: AccountDeletion = {
    available: deletionAvailable,
    label: atFacility ? t('settings.account.deleteAtFacility', facility) : t('settings.account.deleteAccount'),
    subtitle: atFacility ? t('settings.account.deleteAtFacilitySubtitle') : t('settings.account.deleteAccountSubtitle'),
    open: () => {
      if (!deletionAvailable) return;
      const showWarning = () => {
        setDeleteConfirmPhone('');
        setDeleteError(null);
        setDeleteStep('warning');
      };
      // Only an administrator can be the last one; everyone else opens the warning at once.
      if (userProfile?.role !== 'admin') return showWarning();
      if (checkingAdmins.current) return;
      checkingAdmins.current = true;
      // The last administrator cannot be deleted: say so before the two steps, not after the number.
      void isOnlyAdministrator()
        .then(only => {
          if (!only) return showWarning();
          showAlert(t('settings.deleteAccount.onlyAdminTitle'), t('settings.deleteAccount.onlyAdminMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('settings.deleteAccount.openUsers'), onPress: () => router.push('/users') },
          ]);
        })
        .finally(() => {
          checkingAdmins.current = false;
        });
    },
    dialog: deletionDialog,
    deleteAccount: confirmDeleteAccount,
  };

  return { mode, facilityName, actions, request, dialog, deletion };
}
