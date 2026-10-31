/**
 * Login Screen - SAP Fiori for iOS Design
 *
 * A facility's own SMS sign-in (style guide §14.8). The layout is shared with
 * the central sign-in: src/components/auth/PhoneSignInForm.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  setAuthenticating,
  setPhoneNumber as setStorePhoneNumber,
  setOtpSent,
} from '@/store/slices/authSlice';
import { getPendingEnrollmentToken, signInWithPhone } from '@/config/supabaseConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { isCentralLoginConfigured } from '@/config/envConfig';
import { setCentralState } from '@/config/centralState';
import { PhoneSignInForm, isValidMobile, toInternationalMobile } from '@/components/auth/PhoneSignInForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';

import { showAlert } from '@/utils/alert';
import { getLanguage, localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft, readSignInDraft, saveSignInDraft } from '@/utils/signInDraft';
import { serverText } from '@/utils/serverText';
import { SignOutReasonStrip } from '@/components/central/SignOutReasonStrip';

export default function LoginScreen() {
  const dispatch = useAppDispatch();
  const { isAuthenticating } = useAppSelector((state) => state.auth);
  // The warehouse this sign-in is for. With central login this screen is used only for a
  // facility that does not accept association sign-in.
  const facility = getActiveOperatorServer();
  const facilityHost = facility ? facility.origin.replace(/^https:\/\//, '') : '';
  const facilityOrigin = facility?.origin ?? '';

  // The language switch below rebuilds every screen (app/_layout.tsx), this one
  // included: the number typed so far is kept outside the component and read back.
  const [phoneNumber, setPhoneNumberState] = useState(() => readSignInDraft(facilityOrigin));
  const setPhoneNumber = useCallback((value: string) => {
    setPhoneNumberState(value);
    saveSignInDraft(value, facilityOrigin);
  }, [facilityOrigin]);
  const typedNumber = useRef(phoneNumber);
  typedNumber.current = phoneNumber;
  useEffect(() => {
    const languageAtMount = getLanguage();
    saveSignInDraft(typedNumber.current, facilityOrigin);
    // Leaving for another screen forgets the number; a rebuild for a new language keeps it.
    return () => {
      if (getLanguage() === languageAtMount) clearSignInDraft();
    };
  }, [facilityOrigin]);

  useEffect(() => {
    let active = true;
    getPendingEnrollmentToken()
      .then(token => {
        if (active && token) router.replace('/pending-enrollment');
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Rate limit countdown
  const {
    isRateLimited,
    countdownText,
    message: rateLimitMessage,
    handleRateLimitError,
  } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);

  const handleSendOTP = async () => {
    if (isRateLimited) {
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

    try {
      dispatch(setAuthenticating(true));

      const result = await signInWithPhone(formattedPhone);

      if (result.success) {
        dispatch(setStorePhoneNumber(formattedPhone));
        dispatch(setOtpSent(true));
        router.push('/otp');
      } else {
        if (handleRateLimitError(result)) {
          return;
        }
        showAlert(
          tr('auth.login.couldNotSendTitle'),
          serverText(result.error, tr('common.checkConnection'))
        );
      }
    } catch (error) {
      if (handleRateLimitError(error)) {
        return;
      }
      showAlert(tr('auth.login.couldNotSendTitle'), tr('common.checkConnection'));
    } finally {
      dispatch(setAuthenticating(false));
    }
  };

  // "Change": the server address screen; with central login, back to My facilities
  // (the route guard takes the person there once this facility's SMS sign-in is given up).
  const changeFacility = () => {
    if (isCentralLoginConfigured()) setCentralState({ facilitySmsOrigin: null });
    else router.push('/operator-server');
  };

  return (
    <PhoneSignInForm
      banner={isCentralLoginConfigured() ? undefined : <SignOutReasonStrip />}
      facility={{
        name: facility?.companyName ?? '',
        host: facilityHost,
        onChange: changeFacility,
        changeLabel: isCentralLoginConfigured() ? tr('central.switch.action') : tr('auth.server.change'),
      }}
      phoneNumber={phoneNumber}
      onChangePhone={setPhoneNumber}
      busy={isAuthenticating}
      rateLimit={{ isRateLimited, countdown, message: rateLimitMessage }}
      onSubmit={handleSendOTP}
      onOpenTerms={() => router.push('/terms-of-service')}
      onOpenPrivacy={() => router.push('/privacy-policy')}
    />
  );
}
