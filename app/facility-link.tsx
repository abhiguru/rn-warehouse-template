/**
 * Linking an existing profile, the code step (docs/CENTRAL_LOGIN.md): the
 * facility already knows this mobile number from its own SMS sign-in, so it
 * asks once for a code that IT sent, and then links the profile to the
 * central account. The existing code screen with a heading that says why.
 */
import React, { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { cancelFacilityLink, completeFacilityLink, resendFacilityLinkCode } from '@/config/openFacility';
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

  useEffect(() => {
    // Nothing to confirm (the screen was opened by a link): back to the list.
    if (!hasLink && !finished.current) router.replace('/facilities');
  }, [hasLink]);

  const verify = async (code: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      finished.current = true;
      const outcome = await completeFacilityLink(code);
      finished.current = outcome.kind === 'login' || outcome.kind === 'pending';
      // `login`: the profile is in the store and the route guard enters the facility.
      if (outcome.kind === 'pending') router.replace('/pending-enrollment');
      else if (outcome.kind === 'failed') showAlert(tr('auth.otp.couldNotVerifyTitle'), outcome.message);
    } finally {
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
    router.replace('/facilities');
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
