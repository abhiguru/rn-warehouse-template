/**
 * Central sign-in, the code step (style guide §14.8 step 2): the code the
 * association's identity service sent. On success the central session is
 * stored and the person goes to My facilities. The layout is the facility
 * sign-in's: src/components/auth/CodeEntryForm.tsx.
 */
import React, { useEffect, useRef, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { setCentralState } from '@/config/centralState';
import { requestCentralCode, verifyCentralCode } from '@/config/centralSession';
import { TERMS_VERSION } from '@/config/envConfig';
import { recordTermsAccepted } from '@/config/centralTerms';
import { startAtMyFacilities } from '@/navigation/myFacilities';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft } from '@/utils/signInDraft';

export default function CentralOtpScreen() {
  const phoneNumber = useCentralState().signInPhone ?? '';
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { isRateLimited, countdownText, message: rateLimitMessage, triggerRateLimit } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

  // Set when this screen is taken off the stack: by the hardware Back button, by the back
  // arrow, or by the navigation that follows a correct code. The check may still be running.
  const removed = useRef(false);
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        removed.current = true;
      }),
    [navigation]
  );

  useEffect(() => {
    if (!phoneNumber) router.replace('/central-login');
  }, [phoneNumber]);

  const verify = async (code: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const result = await verifyCentralCode(phoneNumber, code, TERMS_VERSION);
      if (result.ok) {
        clearSignInDraft();
        // The terms were accepted for this number; the tick is not asked of it again on this phone.
        await recordTermsAccepted(phoneNumber);
        // A new sign-in is a start: one approved facility is opened without showing the list.
        setCentralState({ autoOpenSpent: false });
        // The person left while the code was being checked. The session is stored, so the
        // route guard shows My facilities in place of the sign-in screen that is shown now;
        // starting again from this screen would put a second My facilities on top of it.
        if (removed.current) return;
        // Alone in the stack: central sign-in must not stay under it.
        startAtMyFacilities();
      } else if (!removed.current) {
        // Not over the screen the person has gone back to.
        showAlert(tr('auth.otp.couldNotVerifyTitle'), result.message);
      }
    } finally {
      setVerifying(false);
    }
  };

  const resend = async (): Promise<boolean> => {
    setResending(true);
    try {
      const result = await requestCentralCode(phoneNumber);
      if (result.ok) {
        showAlert(tr('auth.otp.codeSentTitle'), tr('auth.otp.codeSentMessage', { phone: formatMobile(phoneNumber) }));
        return true;
      }
      if (result.retryAfterSeconds) triggerRateLimit(result.retryAfterSeconds * 1000, result.message);
      else showAlert(tr('auth.login.couldNotSendTitle'), result.message);
      return false;
    } finally {
      setResending(false);
    }
  };

  return (
    <CodeEntryForm
      phoneNumber={phoneNumber}
      verifying={verifying}
      resending={resending}
      rateLimit={{ isRateLimited, countdown, message: rateLimitMessage }}
      onVerify={verify}
      onResend={resend}
      onBack={() => router.back()}
    />
  );
}
