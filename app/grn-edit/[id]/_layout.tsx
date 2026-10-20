import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { space, typography, type ThemeTokens } from '@/theme/tokens';
import { useAppDispatch } from '@/store/hooks';
import { loadGRNData, resetForm } from '@/store/slices/grnFormSlice';
import { loadGRNData as loadGRNDataService } from '@/features/grn/services/grnFormService';
import { nextGrnFormSession } from '@/features/grn/utils/grnFormSession';
import { LOCAL_PHOTO_OWNERS, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import { ErrorStateView } from '@/components/ErrorBoundary';

import { t as tr } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('GRNEditLayout');

type Phase = 'loading' | 'ready' | 'error';

// How many edit layouts are open. The form lives in one slice, so the form is emptied only when the last
// layout closes.
let openLayouts = 0;

/**
 * GRN Edit Layout
 *
 * Reads the GRN from the server every time the edit flow is entered, and empties the form when it is left.
 * The form holds the GRN as it was read, so a form kept from an earlier visit (including the photos removed in
 * it) would be saved over what others changed in between. The steps are shown only once the GRN is in the form,
 * so a read that failed shows an error and never a form that could be saved. The route's id is the one read.
 */
export default function GRNEditLayout() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // The latest load; an answer is used only while its load is the latest and the layout is open.
  const loadRequest = useRef(0);

  // Ensure parent navigation has no header
  useEffect(() => {
    navigation.getParent()?.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    if (!id) {
      setErrorMessage(tr('grn.form.reopenMessage'));
      setPhase('error');
      return;
    }
    setPhase('loading');

    // Whatever the form held (another GRN, an earlier visit) goes before the read starts.
    nextGrnFormSession();
    dispatch(resetForm());

    try {
      const result = await loadGRNDataService(id);
      if (request !== loadRequest.current) return;

      if (result.success && result.data) {
        dispatch(loadGRNData({
          header: result.data.header,
          items: result.data.items,
          grnId: id,
          grnRates: result.data.grnRates,
          grnInvoiced: result.data.grnInvoiced,
        }));
        setPhase('ready');
      } else {
        // Nothing is put in the form: a GRN that was read only in part must not be opened for saving.
        setErrorMessage(serverText(result.error, tr('common.checkConnection')));
        setPhase('error');
      }
    } catch (error) {
      if (request !== loadRequest.current) return;
      log.error('Failed to load GRN data', loggableError(error));
      setErrorMessage(tr('common.checkConnection'));
      setPhase('error');
    }
  }, [id, dispatch]);

  // Every entry reads the GRN again; a change of the route's id (another GRN) reads that one.
  useEffect(() => {
    void load();
  }, [load]);

  // The last layout to close empties the form, and everything still running for it is stale.
  useEffect(() => {
    openLayouts += 1;
    return () => {
      openLayouts -= 1;
      loadRequest.current += 1;
      if (openLayouts === 0) {
        nextGrnFormSession();
        dispatch(resetForm());
        // The photos picked in the form and not saved go with it (a file whose upload still runs is kept until it ends).
        void releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm, { createdBefore: Date.now() });
      }
    };
  }, [dispatch]);

  if (phase === 'loading') {
    return (
      <View style={styles.loadingContainer} accessibilityRole="progressbar" accessibilityState={{ busy: true }} accessibilityLabel={tr('grn.header.loading')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('grn.header.loading')}</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <ErrorStateView
        title={tr('errors.grn.form.loadFailedTitle')}
        message={errorMessage}
        onRetry={id ? () => { void load(); } : undefined}
        secondaryActionLabel={tr('common.close')}
        onSecondaryAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/grn'))}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // As the Dispatch wizard: an edge swipe (iOS) would leave a step without its question.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="step1" options={{ headerShown: false }} />
      <Stack.Screen name="step2" options={{ headerShown: false }} />
      <Stack.Screen name="step3" options={{ headerShown: false }} />
    </Stack>
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
