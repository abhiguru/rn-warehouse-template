/**
 * Linking an existing profile, the code step (docs/CENTRAL_LOGIN.md): the
 * facility already knows this mobile number from its own SMS sign-in, so it
 * asks once for a code that IT sent, and then links the profile to the
 * central account. The existing code screen with a heading that says why.
 */
import React, { useEffect, useRef, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { cancelFacilityLink, completeFacilityLink, resendFacilityLinkCode } from '@/config/openFacility';
import { returnToMyFacilities } from '@/navigation/myFacilities';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, t as tr } from '@/i18n';

export default function FacilityLinkScreen() {
  const link = useCentralState().pendingLink;
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { isRateLimited, countdownText, message: rateLimitMessage, handleRateLimitError } = useRateLimitCountdown();
  // A countdown is a number: ૦-૯ in Gujarati.
  const countdown = localizeDigits(countdownText);
  const hasLink = link !== null;

  // Set once the facility has answered with a session or a waiting request: this screen is done.
  const finished = useRef(false);
  // Set when this screen is taken off the stack: by the hardware Back button, by the
  // "My facilities" control, or by the screen that follows it.
  const removed = useRef(false);
  const navigation = useNavigation();

  useEffect(
    () =>
      // Leaving gives the linking step up, by Back exactly as by the "My facilities" control
      // below. After a session or a waiting request nothing is left to give up: settle() in
      // openFacility.ts has cleared the link already.
      navigation.addListener('beforeRemove', () => {
        removed.current = true;
        cancelFacilityLink();
      }),
    [navigation]
  );

  useEffect(() => {
    // Nothing to confirm (the screen was opened by a link): back to the list.
    if (!hasLink && !finished.current) returnToMyFacilities();
  }, [hasLink]);

  // A ref, not the state: a second press made before the screen has redrawn still sees it.
  const checking = useRef(false);
  const verify = async (code: string) => {
    if (checking.current) return;
    checking.current = true;
    setVerifying(true);
    try {
      finished.current = true;
      const outcome = await completeFacilityLink(code);
      finished.current = outcome.kind === 'login' || outcome.kind === 'pending';
      // The person left while the code was being checked. My facilities shows what came of
      // it (the tag, or the facility itself once the guard enters it); this screen is gone
      // and must not put the waiting screen in My facilities' place or speak over it.
      if (removed.current) return;
      // `login`: the profile is in the store and the route guard enters the facility.
      if (outcome.kind === 'pending') router.replace('/pending-enrollment');
      else if (outcome.kind === 'failed') showAlert(tr('auth.otp.couldNotVerifyTitle'), outcome.message);
    } finally {
      checking.current = false;
      setVerifying(false);
    }
  };

  const resend = async (): Promise<boolean> => {
    setResending(true);
    try {
      const result = await resendFacilityLinkCode();
      if (result.success) {
        showAlert(tr('auth.otp.codeSentTitle'), tr('auth.otp.codeSentMessage', { phone: formatMobile(link?.phoneNumber) }));
        return true;
      }
      if (!handleRateLimitError(result)) showAlert(tr('auth.login.couldNotSendTitle'), result.error ?? tr('common.checkConnection'));
      return false;
    } finally {
      setResending(false);
    }
  };

  const leave = () => {
    finished.current = true;
    cancelFacilityLink();
    // To the My facilities this step was opened from, not a second one on top of it.
    returnToMyFacilities();
  };

  return (
    <CodeEntryForm
      phoneNumber={link?.phoneNumber ?? ''}
      title={tr('central.link.heading', { facility: link?.name ?? '' })}
      lead={tr('central.link.lead', { facility: link?.name ?? '' })}
      verifying={verifying}
      resending={resending}
      rateLimit={{ isRateLimited, countdown, message: rateLimitMessage }}
      onVerify={verify}
      onResend={resend}
      onBack={leave}
      leave={{
        label: tr('central.facilities.title'),
        accessibilityLabel: tr('central.link.backLabel'),
        accessibilityHint: tr('central.link.backHint'),
      }}
    />
  );
}
