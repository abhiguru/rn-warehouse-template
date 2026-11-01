/**
 * Central sign-in (style guide §14.8 step 1, docs/CENTRAL_LOGIN.md): the
 * person proves who they are once, to the association's identity service.
 * Shown only in a build that names the central origin. The layout is the
 * facility sign-in's: src/components/auth/PhoneSignInForm.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { PhoneSignInForm, isValidMobile, toInternationalMobile } from '@/components/auth/PhoneSignInForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { setCentralState } from '@/config/centralState';
import { requestCentralCode } from '@/config/centralSession';
import { getCentralLoginConfig } from '@/config/envConfig';
import { hasAcceptedTerms } from '@/config/centralTerms';
import { SignOutReasonStrip } from '@/components/central/SignOutReasonStrip';
import { showAlert } from '@/utils/alert';
import { getLanguage, localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft, readSignInDraft, saveSignInDraft } from '@/utils/signInDraft';

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
  // The first sign-in of a NUMBER on this phone: the terms are accepted with a tick.
  // The box is shown unless the number on screen is the one the store was asked
  // about and it has accepted before; a number just typed therefore shows the box
  // in the very frame it appears, never a stale answer for the previous number.
  const [checked, setChecked] = useState<{ number: string; accepted: boolean } | null>(null);
  const termsNeeded = !(checked?.number === phoneNumber && checked.accepted);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // "Send code" was tapped with the box unticked: the line under the box says to tick it.
  const [termsError, setTermsError] = useState(false);
  useEffect(() => {
    let active = true;
    void hasAcceptedTerms(phoneNumber).then(accepted => {
      if (active) setChecked({ number: phoneNumber, accepted });
    });
    return () => { active = false; };
  }, [phoneNumber]);

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
    if (termsNeeded && !termsAccepted) {
      setTermsError(true);
      return;
    }
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
      terms={termsNeeded ? {
        accepted: termsAccepted,
        onToggle: () => { setTermsError(false); setTermsAccepted(value => !value); },
        error: termsError,
        onBlocked: () => setTermsError(true),
      } : undefined}
      onOpenTerms={() => router.push('/terms-of-service')}
      onOpenPrivacy={() => router.push('/privacy-policy')}
      banner={<SignOutReasonStrip />}
      alternative={{
        label: tr('auth.facilityCode.link'),
        hint: tr('auth.facilityCode.linkHint'),
        onPress: () => router.push('/facility-code'),
        testID: 'sign-in-with-facility-code',
      }}
    />
  );
}
