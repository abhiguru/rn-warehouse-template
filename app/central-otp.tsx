/**
 * Central sign-in, the code step (style guide §14.8 step 2): the code the
 * association's identity service sent. On success the central session is
 * stored and the person goes to My facilities. The layout is the facility
 * sign-in's: src/components/auth/CodeEntryForm.tsx.
 */
import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { setCentralState } from '@/config/centralState';
import { requestCentralCode, verifyCentralCode } from '@/config/centralSession';
import { TERMS_VERSION } from '@/config/envConfig';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft } from '@/utils/signInDraft';
import { CENTRAL_TERMS_KEY } from './central-login';

export default function CentralOtpScreen() {
  const phoneNumber = useCentralState().signInPhone ?? '';
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { isRateLimited, countdownText, message: rateLimitMessage, triggerRateLimit } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

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
        // The terms were accepted for this sign-in; the tick is not asked for again on this phone.
        await AsyncStorage.setItem(CENTRAL_TERMS_KEY, TERMS_VERSION).catch(() => {});
        // A new sign-in is a start: one approved facility is opened without showing the list.
        setCentralState({ autoOpenSpent: false });
        router.replace('/facilities');
      } else {
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
