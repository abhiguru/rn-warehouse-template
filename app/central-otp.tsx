/**
 * Central sign-in, the code step (style guide §14.8 step 2): the code the
 * association's identity service sent. On success the central session is
 * stored and the person goes to My facilities. The layout is the facility
 * sign-in's: src/components/auth/CodeEntryForm.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { CodeEntryForm } from '@/components/auth/CodeEntryForm';
import { useMarkLeavingOnBack } from '@/hooks/useMarkLeavingOnBack';
import { useRateLimitCountdown } from '@/hooks/useRateLimitCountdown';
import { useCentralState } from '@/hooks/useCentralState';
import { getCentralState, setCentralState } from '@/config/centralState';
import { requestCentralCode, verifyCentralCode } from '@/config/centralSession';
import { TERMS_VERSION } from '@/config/envConfig';
import { recordTermsAccepted } from '@/config/centralTerms';
import { startAtMyFacilities } from '@/navigation/myFacilities';
import { currentRootState, liveRootRoute } from '@/navigation/RouteGuard';
import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { localizeDigits, t as tr } from '@/i18n';
import { clearSignInDraft } from '@/utils/signInDraft';

/**
 * The checks running on code steps now, each with its screen's `removed` flag (one check per
 * code step at most). A code step that is gone (Back) and whose check then succeeds takes the
 * code step shown since off the stack, unless the SHOWN one is checking a code itself: its own
 * answer then decides where the person goes (backlog A1).
 */
const runningChecks = new Set<{ removed: { current: boolean } }>();

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
  useEffect(() => {
    // SDK 58 (React Navigation 8) has no 'beforeRemove'. 'removed' fires once the screen has been
    // taken off the stack and unmounted, after effect cleanup, so unsubscribing waits a microtask.
    const unsubscribe = navigation.addListener('removed', () => {
      removed.current = true;
    });
    return () => queueMicrotask(unsubscribe);
  }, [navigation]);

  const markLeaving = useCallback(() => { removed.current = true; }, []);
  // 'removed' arrives one commit after the Back action, so a check answered in between would still
  // treat this screen as shown: mark it as leaving when Back is pressed, and let the system go on.
  useMarkLeavingOnBack(markLeaving);

  useEffect(() => {
    if (!phoneNumber) router.replace('/central-login');
  }, [phoneNumber]);

  // A ref, not the state: a submit made from an older render still sees it.
  const checking = useRef(false);
  const verify = async (code: string) => {
    if (checking.current) return;
    checking.current = true;
    const check = { removed };
    runningChecks.add(check);
    setVerifying(true);
    try {
      const result = await verifyCentralCode(phoneNumber, code, TERMS_VERSION);
      if (result.ok) {
        clearSignInDraft();
        // A new sign-in is a start: one approved facility is opened without showing the list.
        // Set before the wait below: a code step that navigates during it (see the failure
        // branch) must not have My facilities' one chance set free again after it was spent.
        setCentralState({ autoOpenSpent: false });
        // The terms were accepted for this number; the tick is not asked of it again on this phone.
        await recordTermsAccepted(phoneNumber);
        // The person left while the code was being checked. The session is stored, so the
        // route guard shows My facilities in place of the sign-in screen that is shown now;
        // starting again from this screen would put a second My facilities on top of it.
        // The one exception is another code step: the guard allows that screen to a person
        // who is signed in, so nothing else would take them off it. Unless it is checking a
        // code itself: it is not taken away under its own check, which navigates when it ends.
        if (removed.current) {
          const shownIsChecking = [...runningChecks].some(other => other !== check && !other.removed.current);
          if (liveRootRoute(currentRootState()) === 'central-otp' && !shownIsChecking) startAtMyFacilities();
          return;
        }
        // Alone in the stack: central sign-in must not stay under it.
        startAtMyFacilities();
      } else if (!removed.current) {
        // A check made on a code step that is gone (Back) stored a session while this one was
        // checking (backlog A1): the person is signed in, and this step is what is shown. They
        // go on as after a correct code; the refusal of this code no longer matters.
        if (getCentralState().status === 'signedIn') {
          setCentralState({ autoOpenSpent: false });
          startAtMyFacilities();
          return;
        }
        // Not over the screen the person has gone back to.
        showAlert(tr('auth.otp.couldNotVerifyTitle'), result.message);
      }
    } finally {
      runningChecks.delete(check);
      checking.current = false;
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
      onBack={() => { removed.current = true; router.back(); }}
    />
  );
}
