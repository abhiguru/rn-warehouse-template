/**
 * Central sign-in (style guide §14.8 step 1, docs/CENTRAL_LOGIN.md): the
 * person proves who they are once, to the association's identity service.
 * Shown only in a build that names the central origin. The layout is the
 * facility sign-in's: src/components/auth/PhoneSignInForm.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhoneSignInForm, isValidMobile, toInternationalMobile } from '@/components/auth/PhoneSignInForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { setCentralState } from '@/config/centralState';
import { requestCentralCode } from '@/config/centralSession';
import { getCentralLoginConfig, TERMS_VERSION } from '@/config/envConfig';
import { showAlert } from '@/utils/alert';
import { getLanguage, localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft, readSignInDraft, saveSignInDraft } from '@/utils/signInDraft';

/** The terms version this phone last signed in under; no tick is asked for again until it changes. */
export const CENTRAL_TERMS_KEY = 'central_terms_accepted_v1';

export default function CentralLoginScreen() {
  const central = useCentralState();
  // The draft of a half-typed number is kept per sign-in service, as the facility sign-in keeps it per facility.
  const draftKey = getCentralLoginConfig()?.origin ?? 'central';
  const [phoneNumber, setPhoneNumberState] = useState(() => readSignInDraft(draftKey));
  const setPhoneNumber = useCallback((value: string) => {
    setPhoneNumberState(value);
    saveSignInDraft(value, draftKey);
  }, [draftKey]);
  const typedNumber = useRef(phoneNumber);
  typedNumber.current = phoneNumber;
  useEffect(() => {
    const languageAtMount = getLanguage();
    saveSignInDraft(typedNumber.current, draftKey);
    // Leaving for another screen forgets the number; a rebuild for a new language keeps it.
    return () => {
      if (getLanguage() === languageAtMount) clearSignInDraft();
    };
  }, [draftKey]);

  const [busy, setBusy] = useState(false);
  // First sign-in on this phone: the terms are accepted with a tick.
  const [termsNeeded, setTermsNeeded] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CENTRAL_TERMS_KEY)
      .then(version => {
        if (active && version === TERMS_VERSION) setTermsNeeded(false);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // A session the service ended is explained once.
  const endedMessage = central.endedMessage;
  useEffect(() => {
    if (!endedMessage) return;
    setCentralState({ endedMessage: null });
    showAlert(tr('central.signIn.endedTitle'), endedMessage);
  }, [endedMessage]);

  const { isRateLimited, countdownText, message: rateLimitMessage, triggerRateLimit } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

  const sendCode = async () => {
    if (isRateLimited || busy) return;
    if (termsNeeded && !termsAccepted) return;
    if (!phoneNumber.trim()) {
      showAlert(tr('auth.login.enterMobileTitle'), tr('auth.login.enterMobileMessage'));
      return;
    }
    if (!isValidMobile(phoneNumber)) {
      showAlert(tr('auth.login.checkMobileTitle'), tr('auth.login.checkMobileMessage'));
      return;
    }
    const formattedPhone = toInternationalMobile(phoneNumber);
    setBusy(true);
    try {
      const result = await requestCentralCode(formattedPhone);
      if (result.ok) {
        setCentralState({ signInPhone: formattedPhone });
        router.push('/central-otp');
      } else if (result.retryAfterSeconds) {
        // A wait the service named: count it down instead of an alert.
        triggerRateLimit(result.retryAfterSeconds * 1000, result.message);
      } else {
        showAlert(tr('auth.login.couldNotSendTitle'), result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhoneSignInForm
      note={tr('central.signIn.note')}
      phoneNumber={phoneNumber}
      onChangePhone={setPhoneNumber}
      busy={busy}
      rateLimit={{ isRateLimited, countdown, message: rateLimitMessage }}
      onSubmit={sendCode}
      terms={termsNeeded ? { accepted: termsAccepted, onToggle: () => setTermsAccepted(value => !value) } : undefined}
      onOpenTerms={() => router.push('/terms-of-service')}
      onOpenPrivacy={() => router.push('/privacy-policy')}
    />
  );
}
