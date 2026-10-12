/**
 * OTP Verification Screen - SAP Fiori for iOS Design
 *
 * The code step of a facility's own SMS sign-in. The layout is shared with the
 * central sign-in and the linking step: src/components/auth/CodeEntryForm.tsx.
 */
import React, { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  setVerifyingOTP,
  setAuthenticating,
  setSession,
  setUser,
  setUserProfile,
  setOtpSent,
} from '@/store/slices/authSlice';
import { verifyOTP, signInWithPhone } from '@/config/supabaseConfig';
import { noteFacilitySmsSignIn } from '@/config/centralFacilities';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { parseErrorToFriendly } from '@/utils/errorHandler';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft } from '@/utils/signInDraft';

export default function OTPScreen() {
  const dispatch = useAppDispatch();
  const { phoneNumber, isVerifyingOTP, isAuthenticating } = useAppSelector(
    state => state.auth
  );

  // Rate limit countdown
  const {
    isRateLimited,
    countdownText,
    message: rateLimitMessage,
    handleRateLimitError,
  } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

  useEffect(() => {
    if (!phoneNumber) {
      router.replace('/login');
    }
  }, [phoneNumber]);

  // A ref, not the redux flag: a second press made before the screen has redrawn still sees it.
  const checking = useRef(false);
  const handleVerifyOTPWithCode = async (code: string) => {
    if (checking.current) return;
    checking.current = true;
    try {
      dispatch(setVerifyingOTP(true));

      const result = await verifyOTP(phoneNumber, code);

      if (result.success && result.data) {
        // Signed in (or waiting for approval): the number typed on the sign-in screen is no longer needed.
        clearSignInDraft();
        if (result.data.action === 'pending') {
          // With central login: the facility goes on the person's list as requested.
          void noteFacilitySmsSignIn('requested');
          dispatch(setOtpSent(false));
          router.replace('/pending-enrollment');
        } else if (result.data.customAuth && result.data.userProfile) {
          void noteFacilitySmsSignIn('approved');
          dispatch(setUserProfile(result.data.userProfile));

          router.replace('/');
        } else if (result.data.session && result.data.user) {
          dispatch(setSession(result.data.session));
          dispatch(setUser(result.data.user));
          dispatch(setUserProfile(result.data.userProfile));

          router.replace('/');
        }
      } else {
        const failure = result as { success: false; error: string; errorCode?: string };
        // A limit of the server already comes in the app's words.
        const friendlyMessage = failure.errorCode ? failure.error : parseErrorToFriendly(failure.error);
        showAlert(tr('auth.otp.couldNotVerifyTitle'), friendlyMessage);
      }
    } catch {
      showAlert(tr('auth.otp.couldNotVerifyTitle'), tr('common.checkConnection'));
    } finally {
      checking.current = false;
      dispatch(setVerifyingOTP(false));
    }
  };

  const handleResendOTP = async (): Promise<boolean> => {
    try {
      dispatch(setAuthenticating(true));

      const result = await signInWithPhone(phoneNumber);

      if (result.success) {
        showAlert(
          tr('auth.otp.codeSentTitle'),
          tr('auth.otp.codeSentMessage', { phone: formatMobile(phoneNumber) })
        );
        return true;
      } else {
        if (handleRateLimitError(result)) {
          return false;
        }
        // A limit of the server already comes in the app's words.
        const friendlyMessage = 'errorCode' in result && result.errorCode ? result.error : parseErrorToFriendly(result.error);
        showAlert(tr('auth.login.couldNotSendTitle'), friendlyMessage);
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return false;
      }
      showAlert(tr('auth.login.couldNotSendTitle'), tr('common.checkConnection'));
    } finally {
      dispatch(setAuthenticating(false));
    }
    return false;
  };

  const handleBack = () => {
    dispatch(setOtpSent(false));
    router.back();
  };

  return (
    <CodeEntryForm
      phoneNumber={phoneNumber}
      verifying={isVerifyingOTP}
      resending={isAuthenticating}
      rateLimit={{ isRateLimited, countdown, message: rateLimitMessage }}
      onVerify={handleVerifyOTPWithCode}
      onResend={handleResendOTP}
      onBack={handleBack}
    />
  );
}
