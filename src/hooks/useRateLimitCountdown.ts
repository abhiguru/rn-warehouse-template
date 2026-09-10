/**
 * I18 Fix: Rate Limit UI Feedback
 *
 * Hook for managing rate limit countdown state.
 * Shows countdown timer when rate limited (client-side or 429 response).
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface RateLimitState {
  /** Whether currently rate limited */
  isRateLimited: boolean;
  /** Seconds remaining until rate limit expires */
  secondsRemaining: number;
  /** Formatted countdown string (e.g., "0:45" or "1:30") */
  countdownText: string;
  /** Human-readable message for display */
  message: string;
}

interface UseRateLimitCountdownReturn extends RateLimitState {
  /** Trigger rate limit with duration in milliseconds */
  triggerRateLimit: (durationMs: number, customMessage?: string) => void;
  /** Clear rate limit manually */
  clearRateLimit: () => void;
  /** Parse error message for rate limit info and trigger if found */
  handleRateLimitError: (error: string | Error | unknown) => boolean;
}

/**
 * Parse common rate limit error patterns from API responses
 * Returns duration in milliseconds if rate limit detected, null otherwise
 */
const parseRateLimitDuration = (error: string): { durationMs: number; message?: string } | null => {
  if (!error) return null;

  const errorLower = error.toLowerCase();

  // Pattern: "Too many OTP requests. Please wait X seconds before trying again."
  const secondsMatch = error.match(/wait\s+(\d+)\s*seconds?/i);
  if (secondsMatch) {
    return {
      durationMs: parseInt(secondsMatch[1], 10) * 1000,
      message: error
    };
  }

  // Pattern: "Please wait X minutes"
  const minutesMatch = error.match(/wait\s+(\d+)\s*minutes?/i);
  if (minutesMatch) {
    return {
      durationMs: parseInt(minutesMatch[1], 10) * 60 * 1000,
      message: error
    };
  }

  // Pattern: "Rate limit exceeded" or "Too many requests" without specific time
  // Default to 60 seconds
  if (
    errorLower.includes('rate limit') ||
    errorLower.includes('too many requests') ||
    errorLower.includes('too many otp') ||
    errorLower.includes('try again later')
  ) {
    return {
      durationMs: 60000,
      message: 'Too many requests. Please wait before trying again.'
    };
  }

  // HTTP 429 status code indicator
  if (errorLower.includes('429') || errorLower.includes('throttl')) {
    return {
      durationMs: 60000,
      message: 'Too many requests. Please wait before trying again.'
    };
  }

  return null;
};

/**
 * Format seconds into countdown string (M:SS format)
 */
const formatCountdown = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Hook for managing rate limit countdown UI state
 *
 * @example
 * ```tsx
 * const { isRateLimited, countdownText, message, handleRateLimitError } = useRateLimitCountdown();
 *
 * const handleSubmit = async () => {
 *   const result = await sendOTP(phone);
 *   if (!result.success) {
 *     if (handleRateLimitError(result.error)) {
 *       // Rate limit detected and countdown started
 *       return;
 *     }
 *     // Handle other errors
 *   }
 * };
 *
 * return (
 *   <>
 *     {isRateLimited && (
 *       <View style={styles.rateLimitBanner}>
 *         <Text>{message}</Text>
 *         <Text>Try again in {countdownText}</Text>
 *       </View>
 *     )}
 *   </>
 * );
 * ```
 */
export const useRateLimitCountdown = (): UseRateLimitCountdownReturn => {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [message, setMessage] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const clearRateLimit = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setSecondsRemaining(0);
    setMessage('');
    endTimeRef.current = 0;
  }, []);

  const triggerRateLimit = useCallback((durationMs: number, customMessage?: string) => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const endTime = Date.now() + durationMs;
    endTimeRef.current = endTime;

    // Set initial state
    const initialSeconds = Math.ceil(durationMs / 1000);
    setSecondsRemaining(initialSeconds);
    setMessage(customMessage || `Too many requests. Please wait ${formatCountdown(initialSeconds)} before trying again.`);

    // Start countdown timer
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearRateLimit();
      }
    }, 1000);
  }, [clearRateLimit]);

  const handleRateLimitError = useCallback((error: string | Error | unknown): boolean => {
    let errorString = '';

    if (typeof error === 'string') {
      errorString = error;
    } else if (error instanceof Error) {
      errorString = error.message;
    } else if (error && typeof error === 'object') {
      // Handle objects with message or error properties
      const errObj = error as { message?: string; error?: string };
      errorString = errObj.message || errObj.error || '';
    }

    const parsed = parseRateLimitDuration(errorString);

    if (parsed) {
      triggerRateLimit(parsed.durationMs, parsed.message);
      return true;
    }

    return false;
  }, [triggerRateLimit]);

  const isRateLimited = secondsRemaining > 0;
  const countdownText = formatCountdown(secondsRemaining);

  return {
    isRateLimited,
    secondsRemaining,
    countdownText,
    message,
    triggerRateLimit,
    clearRateLimit,
    handleRateLimitError,
  };
};

/**
 * Parse HTTP 429 response headers for retry-after value
 * @param headers - Response headers object or Headers instance
 * @returns Duration in milliseconds, or null if not found
 */
export const parseRetryAfterHeader = (headers: Headers | Record<string, string> | null): number | null => {
  if (!headers) return null;

  let retryAfter: string | null = null;

  if (headers instanceof Headers) {
    retryAfter = headers.get('retry-after') || headers.get('Retry-After');
  } else if (typeof headers === 'object') {
    retryAfter = headers['retry-after'] || headers['Retry-After'] || null;
  }

  if (!retryAfter) return null;

  // Retry-After can be seconds (integer) or HTTP-date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
};

export default useRateLimitCountdown;
