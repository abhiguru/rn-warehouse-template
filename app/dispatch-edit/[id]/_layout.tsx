/**
 * Dispatch Edit Form Layout
 *
 * Reads the dispatch before it draws any step, on every entry, and empties the form when it goes.
 *
 * - It is registered as an open dispatch form while it is open (src/features/dispatch/utils/openDispatchForms.ts). It
 *   is not opened over another dispatch form (a new dispatch, or another edit): that visit is turned away with a
 *   message and an "Open it" button, and the open form is not touched. The form is emptied only when the last open
 *   form closes.
 * - It starts on a spinner, so the form is never drawn empty (or with an earlier edit's values) first.
 * - Every entry resets the form and reads the dispatch again: what is in the form is never what an earlier visit
 *   left, and not what another phone changed meanwhile.
 * - A failed read shows a full screen error with "Try again" and "Close". The form is empty then, and no step is drawn:
 *   a step over an unloaded form would show (and save) another dispatch's values.
 * - The form is reset when the layout goes (if no other form is open), however the edit is left (the X, a Back key, a
 *   save).
 * - Stack: steps replace each other without animation, and the swipe back is off.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import { loadDispatchData as loadDispatchIntoForm, resetForm } from '@/store/slices/dispatchFormSlice';
import { loadDispatchData } from '@/features/dispatch/services/dispatchFormService';
import {
  openDispatchFormBlocking,
  openDispatchFormCount,
  registerDispatchForm,
  type OpenDispatchForm,
} from '@/features/dispatch/utils/openDispatchForms';
import { showOpenDispatchFormRefusal } from '@/features/dispatch/utils/refuseOpenForm';
import { ErrorStateView } from '@/components/ErrorBoundary';
import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';

const log = createLogger('DispatchEditLayout');

// `blocked`: another dispatch's form (or a new dispatch) is open, and this edit is not opened over it.
type Phase = 'loading' | 'ready' | 'error' | 'blocked';

export default function DispatchEditLayout() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canUpdate } = usePermissions();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  // Asked once, before anything is read or reset: the form that is open must not be touched.
  const [blocker] = useState<OpenDispatchForm | null>(() => openDispatchFormBlocking());

  // Starts on loading: the first render never draws a step.
  const [phase, setPhase] = useState<Phase>(() => (blocker ? 'blocked' : 'loading'));
  const [errorMessage, setErrorMessage] = useState('');

  // Protect edit routes - redirect if user cannot update
  useEffect(() => {
    if (!canUpdate) {
      if (__DEV__) console.log('[DispatchEditLayout] User lacks update permission, redirecting');
      router.replace('/(tabs)/dispatch');
    }
  }, [canUpdate]);

  // The latest read; an answer is used only while its read is the latest and the layout is open.
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setPhase('loading');

    // Whatever an earlier visit left is gone before this one begins.
    dispatch(resetForm());

    if (!id) {
      setErrorMessage(tr('dispatch.edit.openFailedMessage'));
      setPhase('error');
      return;
    }

    try {
      const result = await loadDispatchData(id);
      if (request !== loadRequest.current) return;

      if (result.success && result.data) {
        dispatch(
          loadDispatchIntoForm({
            dispatchId: id,
            header: result.data.header,
            items: result.data.items,
            images: [], // Photos are not loaded for an edit
          })
        );
        setPhase('ready');
      } else {
        dispatch(resetForm());
        setErrorMessage(serverText(result.error, tr('dispatch.wizard.loadFailed')));
        setPhase('error');
      }
    } catch (error) {
      if (request !== loadRequest.current) return;
      log.error('Failed to load dispatch data', error);
      dispatch(resetForm());
      setErrorMessage(tr('dispatch.wizard.loadFailed'));
      setPhase('error');
    }
  }, [id, dispatch]);

  // Blocked: say why and go back, leaving the form that is open as it is. Once, whatever mounts again.
  const turnedAway = useRef(false);
  useEffect(() => {
    if (!blocker || turnedAway.current) return;
    turnedAway.current = true;
    // The number of the dispatch that is open, from its own loaded form (the slice was not touched by this visit).
    showOpenDispatchFormRefusal(blocker, store.getState().dispatchForm.header.disp_no || undefined);
    router.back();
  }, []);

  // Read on every entry (a blocked visit reads and resets nothing).
  useEffect(() => {
    if (!canUpdate || blocker) return undefined;
    void load();
    return () => {
      loadRequest.current += 1;
    };
  }, [load, canUpdate]);

  // The registry names this dispatch by its own number once it is loaded, for the refusal of a form opened over it.
  const openForm = useRef<OpenDispatchForm | null>(null);

  // Open for as long as this layout is. When it goes, the form is emptied if no other form is open (the last one to
  // close empties it). A blocked layout never loaded or registered anything, so its going changes nothing.
  useEffect(() => {
    if (blocker || !canUpdate || !id) return undefined;
    const form: OpenDispatchForm = { kind: 'edit', id };
    openForm.current = form;
    const release = registerDispatchForm(form);
    return () => {
      release();
      openForm.current = null;
      loadRequest.current += 1;
      if (openDispatchFormCount() === 0) dispatch(resetForm());
    };
  }, [id, canUpdate, dispatch]);

  const loadedNumber = useAppSelector((state) => (state.dispatchForm.dispatch_id === id ? state.dispatchForm.header.disp_no : ''));
  useEffect(() => {
    if (openForm.current?.kind === 'edit' && loadedNumber) openForm.current.number = loadedNumber;
  }, [loadedNumber]);

  // Don't render if no permission, or while this visit is being turned away
  if (!canUpdate || phase === 'blocked') {
    return null;
  }

  if (phase === 'loading') {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityLabel={tr('dispatch.form.loading')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('dispatch.form.loading')}</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <ErrorStateView
        title={tr('dispatch.edit.openFailedTitle')}
        message={errorMessage}
        onRetry={id ? () => { void load(); } : undefined}
        secondaryActionLabel={tr('common.close')}
        onSecondaryAction={() => {
          // The edit was opened over the dispatch's page: one step back is that page.
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/dispatch');
        }}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        gestureEnabled: false,
      }}
    />
  );
}

const makeStyles = (t: ThemeTokens) => ({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.body,
    marginTop: space.lg,
    color: t.text.secondary,
  },
});
