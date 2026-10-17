/**
 * The central account (docs/CENTRAL_LOGIN.md): the name the association's
 * identity service holds, "Sign out on all phones" and "Delete my account".
 * Reached from My facilities.
 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppDispatch } from '@/store/hooks';
import { deleteAccountEverywhere, signOutAllDevices } from '@/store/centralSignOut';
import { useCentralState } from '@/hooks/useCentralState';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { updateCentralName } from '@/config/centralSession';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

/** The service accepts 1 to 80 printable characters on one line. */
export const isValidCentralName = (name: string): boolean => {
  const trimmed = name.trim();
  // eslint-disable-next-line no-control-regex
  return trimmed.length >= 1 && trimmed.length <= 80 && !/[\u0000-\u001f\u007f]/.test(trimmed);
};

export default function CentralAccountScreen() {
  const dispatch = useAppDispatch();
  const user = useCentralState().user;
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const busy = saving || deleting || signingOutAll;

  const saveName = async () => {
    if (busy) return;
    if (!isValidCentralName(name)) {
      setNameError(tr('central.account.nameInvalid'));
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      const result = await updateCentralName(name);
      if (result.ok) {
        setName(result.user.name ?? '');
        showAlert(tr('central.account.savedTitle'));
      } else {
        showAlert(tr('central.account.saveFailedTitle'), result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      // On success the central session is gone and the route guard shows central sign-in.
      const result = await deleteAccountEverywhere(dispatch);
      if (!result.ok)
        showAlert(
          tr('central.account.deleteFailedTitle'),
          result.reason === 'central' ? result.failure.message : tr('central.switch.busyMessage')
        );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    showAlert(tr('central.account.deleteTitle'), tr('central.account.deleteMessage'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('central.account.deleteAccount'), style: 'destructive', onPress: () => { void deleteAccount(); } },
    ]);
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    try {
      // On success the central session is gone and the route guard shows central sign-in.
      const result = await signOutAllDevices(dispatch);
      if (result.ok) {
        if (result.facilityCleanup === 'failed') showAlert(tr('central.switch.failedTitle'), tr('common.checkConnection'));
      } else if (result.reason === 'central') {
        showAlert(tr('central.account.signOutAllFailedTitle'), result.failure.message);
      } else if (result.reason === 'local_clear_failed') {
        // Ended at the service, but this phone's secure storage kept its copy: same words as "Sign out".
        showAlert(tr('auth.signOut.couldNotTitle'), tr('central.signOut.notCleared'));
      } else {
        showAlert(tr('central.account.signOutAllFailedTitle'), tr('central.switch.busyMessage'));
      }
    } finally {
      setSigningOutAll(false);
    }
  };

  const confirmSignOutAll = () => {
    showAlert(tr('central.account.signOutAllTitle'), tr('central.account.signOutAllMessage'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('central.account.signOutAll'), onPress: () => { void signOutAll(); } },
    ]);
  };

  return (
    <View style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <CentralHeader title={tr('nav.screens.account')} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <Text style={styles.signedIn}>
            {tr('central.account.signedInAs', { phone: formatMobile(user?.phoneNumber) })}
          </Text>

          <Input
            label={tr('central.account.nameLabel')}
            placeholder={tr('central.account.namePlaceholder')}
            value={name}
            onChangeText={value => { setName(value); setNameError(undefined); }}
            helperText={tr('central.account.nameHelp')}
            error={nameError}
            maxLength={80}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={() => { void saveName(); }}
            editable={!busy}
            testID="central-name"
          />
          <Button
            size="fullWidth"
            onPress={() => { void saveName(); }}
            disabled={busy}
            loading={saving}
            loadingText={tr('common.saving')}
          >
            {tr('central.account.saveName')}
          </Button>

          <View style={styles.allPhones}>
            <Button
              type="secondary"
              size="fullWidth"
              leftIcon="cellphone-remove"
              onPress={confirmSignOutAll}
              disabled={busy}
              loading={signingOutAll}
              testID="central-sign-out-all"
            >
              {tr('central.account.signOutAll')}
            </Button>
            <Text style={styles.note}>{tr('central.account.signOutAllSubtitle')}</Text>
          </View>

          <View style={styles.danger}>
            <Button
              type="secondary"
              variant="negative"
              size="fullWidth"
              leftIcon="trash-can-outline"
              onPress={confirmDelete}
              disabled={busy}
              loading={deleting}
              loadingText={tr('common.deleting')}
            >
              {tr('central.account.deleteAccount')}
            </Button>
            <Text style={styles.dangerNote}>{tr('central.account.deleteSubtitle')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  content: { flexGrow: 1, paddingHorizontal: layout.marginCompact, paddingTop: space.xl },
  column: { width: '100%' as const, maxWidth: layout.maxFormWidth, alignSelf: 'center' as const, gap: space.lg },
  signedIn: { ...typography.subhead, color: t.text.secondary },
  allPhones: { marginTop: space.xxl, gap: space.sm },
  note: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
  danger: { marginTop: space.xxxl, gap: space.sm },
  dangerNote: { ...typography.footnote, color: t.text.secondary, textAlign: 'center' as const },
});
