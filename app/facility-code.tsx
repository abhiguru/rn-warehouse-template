/**
 * Sign-in with a code from the facility (style guide §14.8, docs/CENTRAL_LOGIN.md): for a worker who cannot use the
 * association's sign-in. Three steps on one screen: choose the facility from the facilities this phone has used,
 * the mobile number, the 6-digit code the facility's operator made. Back goes one step back; the first step goes back
 * to the association's sign-in. The layouts are the sign-in's own (PhoneSignInForm, CodeEntryForm).
 *
 * With `mode=sms` (WH-148) the same list is the way to the facility's OWN SMS sign-in, offered when the association's sign-in
 * cannot send a code: choosing a facility makes it the selected server and opens its sign-in screen (app/login.tsx, app/otp.tsx),
 * which gives a session for that facility only. A phone with no facility types the facility's address instead.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { CentralHeader } from '@/components/central/CentralHeader';
import { Button } from '@/components/ui/Button';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { PhoneSignInForm, isValidMobile, toInternationalMobile } from '@/components/auth/PhoneSignInForm';
import AppTooOldScreen from '@/components/AppTooOldScreen';
import type { AppTooOldInfo } from '@/config/appTooOld';
import { listFacilitiesForCode, prepareFacilityForCode } from '@/config/breakGlass';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { setCentralState } from '@/config/centralState';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { facilityNameOf } from '@/config/openFacility';
import type { MyFacility } from '@/config/centralFacilities';
import { breakGlassSignIn, type BreakGlassFailure } from '@/config/supabaseConfig';
import { useAppDispatch } from '@/store/hooks';
import { setUserProfile } from '@/store/slices/authSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { t as tr, type TranslationKey } from '@/i18n';
import { clearSignInDraft } from '@/utils/signInDraft';

type Step = 'choose' | 'phone' | 'code' | 'address';

/** The words for each way the facility can refuse a code (a used, expired or locked code each has its own text). */
const REFUSAL_TEXT: Record<BreakGlassFailure, TranslationKey> = {
  code_used: 'auth.facilityCode.codeUsed',
  code_expired: 'auth.facilityCode.codeExpired',
  code_locked: 'auth.facilityCode.codeLocked',
  refused: 'auth.facilityCode.refused',
  rate_limited: 'auth.facilityCode.rateLimited',
  unavailable: 'auth.facilityCode.unavailable',
  network: 'common.checkConnection',
  session_changed: 'errors.auth.sessionChanged',
  failed: 'errors.auth.otpVerificationFailed',
};

const NO_RATE_LIMIT = { isRateLimited: false, countdown: '', message: '' };

export default function FacilityCodeScreen() {
  const dispatch = useAppDispatch();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const smsMode = mode === 'sms';
  const t = useTokens();
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState<Step>('choose');
  const [list, setList] = useState<MyFacility[] | null>(null);
  const [chosen, setChosen] = useState<MyFacility | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [tooOld, setTooOld] = useState<AppTooOldInfo | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  // A used, expired or locked code is told under the code boxes, where the typed code stays.
  const [codeRefusal, setCodeRefusal] = useState<string | null>(null);
  // A ref, not the state: a second submit made from an older render still sees it.
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    void listFacilitiesForCode().then(found => {
      if (active) setList(found);
    });
    return () => {
      active = false;
    };
  }, []);

  const goBack = useCallback(() => {
    setCodeRefusal(null);
    if (step === 'address') setStep('choose');
    else if (step === 'code') setStep('phone');
    else if (step === 'phone') setStep('choose');
    else router.back();
  }, [step]);

  // Android Back goes one step back inside the screen, and leaves it only from the first step.
  useEffect(() => {
    if (step === 'choose') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [step, goBack]);

  const choose = async (facility: MyFacility) => {
    if (busy.current) return;
    busy.current = true;
    setPreparing(facility.origin);
    try {
      const prepared = await prepareFacilityForCode(facility);
      if (!prepared.ok) {
        if (prepared.appTooOld) setTooOld(prepared.appTooOld);
        else showAlert(tr('auth.facilityCode.couldNotSignInTitle'), prepared.message);
        return;
      }
      if (smsMode) {
        // The facility's own SMS sign-in: the existing screens take over for the selected server.
        setCentralState({ facilitySmsOrigin: getActiveOperatorServer()?.origin ?? facility.origin });
        router.replace('/login');
        return;
      }
      setChosen(facility);
      setStep('phone');
    } finally {
      busy.current = false;
      setPreparing(null);
    }
  };

  const continueWithNumber = () => {
    if (!phoneNumber.trim()) {
      showAlert(tr('auth.login.enterMobileTitle'), tr('auth.login.enterMobileMessage'));
      return;
    }
    if (!isValidMobile(phoneNumber)) {
      showAlert(tr('auth.login.checkMobileTitle'), tr('auth.login.checkMobileMessage'));
      return;
    }
    setStep('code');
  };

  const verify = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setVerifying(true);
    setCodeRefusal(null);
    try {
      const result = await breakGlassSignIn(toInternationalMobile(phoneNumber), code);
      if (result.success && result.data.userProfile) {
        // The session is stored as a facility sign-in stores it; the route guard lets the signed-in person in.
        clearSignInDraft();
        dispatch(setUserProfile(result.data.userProfile));
        router.replace('/');
      } else if (!result.success && (result.reason === 'code_used' || result.reason === 'code_expired' || result.reason === 'code_locked')) {
        setCodeRefusal(tr(REFUSAL_TEXT[result.reason]));
      } else if (!result.success) {
        showAlert(tr('auth.facilityCode.couldNotSignInTitle'), tr(REFUSAL_TEXT[result.reason]));
      } else {
        showAlert(tr('auth.facilityCode.couldNotSignInTitle'), tr(REFUSAL_TEXT.failed));
      }
    } finally {
      busy.current = false;
      setVerifying(false);
    }
  };

  if (tooOld) return <AppTooOldScreen {...tooOld} onClose={() => setTooOld(null)} />;

  // No facility on this phone: the facility's address is typed (the "Choose your warehouse server" screen's own entry).
  if (step === 'address') {
    return (
      <OperatorServerSelection
        onCancel={() => setStep('choose')}
        onChoose={({ server }) => {
          const name = facilityNameOf(server);
          void choose({ origin: server.origin, instanceId: server.instanceId, name, city: '', status: 'requested', lastOpenedAt: null, addedAt: new Date().toISOString(), source: 'address', gone: false });
        }}
      />
    );
  }

  if (step === 'phone' && chosen) {
    return (
      <PhoneSignInForm
        facility={{
          name: chosen.name,
          host: chosen.origin.replace(/^https:\/\//, ''),
          onChange: () => setStep('choose'),
          changeLabel: tr('auth.facilityCode.changeFacility'),
        }}
        subtitle={tr('auth.facilityCode.phoneNote')}
        phoneNumber={phoneNumber}
        onChangePhone={setPhoneNumber}
        busy={false}
        rateLimit={NO_RATE_LIMIT}
        onSubmit={continueWithNumber}
        submitLabel={{ label: tr('common.continue'), busy: tr('common.loading'), hint: tr('auth.facilityCode.codeTitle') }}
        onOpenTerms={() => router.push('/terms-of-service')}
        onOpenPrivacy={() => router.push('/privacy-policy')}
      />
    );
  }

  if (step === 'code' && chosen) {
    return (
      <CodeEntryForm
        phoneNumber={toInternationalMobile(phoneNumber)}
        title={tr('auth.facilityCode.codeTitle')}
        lead={tr('auth.facilityCode.codeLead')}
        verifying={verifying}
        resending={false}
        rateLimit={NO_RATE_LIMIT}
        onVerify={verify}
        onResend={async () => false}
        onBack={goBack}
        facilityMade
        refusal={codeRefusal}
        leave={{
          label: tr('auth.otp.wrongNumber'),
          accessibilityLabel: tr('auth.otp.wrongNumberLabel'),
          accessibilityHint: tr('auth.otp.wrongNumberHint'),
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <CentralHeader title={tr('auth.facilityCode.chooseTitle')} onBack={goBack} />
      {list === null ? (
        <View style={styles.empty}>
          <ActivityIndicator color={t.brand.tint} accessibilityLabel={tr('central.facilities.loading')} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.empty} testID="facility-code-empty">
          <Icon name="office-building-plus-outline" size={iconSize.hero} color={t.icon.secondary} />
          <Text style={styles.emptyTitle}>{tr('auth.facilityCode.emptyTitle')}</Text>
          <Text style={styles.emptyMessage}>{smsMode ? tr('central.signIn.noFacilitiesYet') : tr('auth.facilityCode.emptyMessage')}</Text>
          {smsMode ? (
            <Button type="primary" onPress={() => setStep('address')} testID="facility-code-enter-address">
              {tr('central.catalogue.enterAddress')}
            </Button>
          ) : null}
          <Button type="secondary" onPress={goBack} testID="facility-code-back">
            {tr('common.back')}
          </Button>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={item => item.origin}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<Text style={styles.lead}>{smsMode ? tr('central.signIn.smsChooseLead') : tr('auth.facilityCode.chooseLead')}</Text>}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const opening = preparing === item.origin;
            return (
              <Pressable
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => void choose(item)}
                disabled={preparing !== null}
                accessibilityRole="button"
                accessibilityLabel={item.city ? `${item.name}, ${item.city}` : item.name}
                accessibilityState={{ busy: opening, disabled: preparing !== null && !opening }}
                testID={`facility-code-${item.origin}`}
              >
                <View style={styles.avatar}>
                  <Icon name="office-building-outline" size={iconSize.lg} color={t.brand.tint} />
                </View>
                <View style={styles.cellText}>
                  <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                  {item.city ? <Text style={styles.city} numberOfLines={1}>{item.city}</Text> : null}
                  {opening ? <Text style={styles.city}>{tr('central.facilities.opening', { facility: item.name })}</Text> : null}
                </View>
                {opening ? (
                  <ActivityIndicator color={t.brand.tint} />
                ) : (
                  <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  screen: { flex: 1, backgroundColor: t.background.base },
  listContent: {
    flexGrow: 1,
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    paddingBottom: space.lg,
  },
  lead: {
    ...typography.subhead,
    color: t.text.secondary,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.lg,
  },
  // Object cell (style guide §13.6)
  cell: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: 72,
    paddingHorizontal: layout.marginCompact,
    paddingVertical: space.md,
    backgroundColor: t.surface.card,
  },
  cellPressed: { backgroundColor: t.surface.cardPressed },
  avatar: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cellText: { flex: 1, gap: space.xxs },
  name: { ...typography.headline, color: t.text.primary },
  city: { ...typography.subhead, color: t.text.secondary },
  separator: { height: 1, backgroundColor: t.border.divider, marginLeft: layout.marginCompact + layout.avatar.md + space.md },
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: space.xxl, gap: space.md, minHeight: touchTarget },
  emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
  emptyMessage: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
});
