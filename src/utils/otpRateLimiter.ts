/**
 * OTP Rate Limiter
 *
 * Client-side rate limiting for OTP requests:
 * - Max 1 request per minute per phone number
 * - Max 20 requests per day per phone number
 *
 * Uses AsyncStorage for persistence across app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'otp_rate_limit_data';

interface RateLimitRecord {
  lastRequestAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

interface RateLimitData {
  [phoneNumber: string]: RateLimitRecord;
}

interface RateLimitResult {
  allowed: boolean;
  reason?: 'minute' | 'daily';
  retryAfterSeconds?: number;
  dailyRemaining?: number;
}

// Constants
const MINUTE_LIMIT_MS = 60 * 1000; // 1 minute
const DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get the start of the current day (midnight)
 */
function getStartOfDay(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Load rate limit data from AsyncStorage
 */
async function loadData(): Promise<RateLimitData> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[OTPRateLimiter] Failed to load data:', error);
  }
  return {};
}

/**
 * Save rate limit data to AsyncStorage
 */
async function saveData(data: RateLimitData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[OTPRateLimiter] Failed to save data:', error);
  }
}

/**
 * Clean up expired records (older than 24 hours)
 */
function cleanupExpiredRecords(data: RateLimitData): RateLimitData {
  const now = Date.now();
  const cleaned: RateLimitData = {};

  for (const [phone, record] of Object.entries(data)) {
    // Keep records that have activity in the last 24 hours
    if (now - record.lastRequestAt < DAY_MS) {
      cleaned[phone] = record;
    }
  }

  return cleaned;
}

/**
 * Check if an OTP request is allowed for the given phone number
 */
export async function checkOTPRateLimit(phoneNumber: string): Promise<RateLimitResult> {
  const now = Date.now();
  const startOfDay = getStartOfDay();

  // Load and clean data
  let data = await loadData();
  data = cleanupExpiredRecords(data);

  const record = data[phoneNumber];

  // No previous record - allowed
  if (!record) {
    return {
      allowed: true,
      dailyRemaining: DAILY_LIMIT - 1,
    };
  }

  // Check if daily counter needs reset (new day)
  const dailyCount = record.dailyResetAt < startOfDay ? 0 : record.dailyCount;

  // Check minute limit
  const timeSinceLastRequest = now - record.lastRequestAt;
  if (timeSinceLastRequest < MINUTE_LIMIT_MS) {
    const retryAfterSeconds = Math.ceil((MINUTE_LIMIT_MS - timeSinceLastRequest) / 1000);
    return {
      allowed: false,
      reason: 'minute',
      retryAfterSeconds,
      dailyRemaining: DAILY_LIMIT - dailyCount,
    };
  }

  // Check daily limit
  if (dailyCount >= DAILY_LIMIT) {
    const nextReset = startOfDay + DAY_MS;
    const retryAfterSeconds = Math.ceil((nextReset - now) / 1000);
    return {
      allowed: false,
      reason: 'daily',
      retryAfterSeconds,
      dailyRemaining: 0,
    };
  }

  return {
    allowed: true,
    dailyRemaining: DAILY_LIMIT - dailyCount - 1,
  };
}

/**
 * Record an OTP request for the given phone number
 * Call this after successfully sending an OTP
 */
export async function recordOTPRequest(phoneNumber: string): Promise<void> {
  const now = Date.now();
  const startOfDay = getStartOfDay();

  let data = await loadData();
  data = cleanupExpiredRecords(data);

  const existing = data[phoneNumber];

  // Reset daily count if it's a new day
  const dailyCount = existing && existing.dailyResetAt >= startOfDay
    ? existing.dailyCount + 1
    : 1;

  data[phoneNumber] = {
    lastRequestAt: now,
    dailyCount,
    dailyResetAt: startOfDay,
  };

  await saveData(data);

  if (__DEV__) {
    console.log('[OTPRateLimiter] Recorded request:', {
      phone: phoneNumber.slice(-4),
      dailyCount,
      dailyRemaining: DAILY_LIMIT - dailyCount,
    });
  }
}

/**
 * Get remaining daily requests for a phone number
 */
export async function getDailyRemaining(phoneNumber: string): Promise<number> {
  const startOfDay = getStartOfDay();
  const data = await loadData();
  const record = data[phoneNumber];

  if (!record || record.dailyResetAt < startOfDay) {
    return DAILY_LIMIT;
  }

  return Math.max(0, DAILY_LIMIT - record.dailyCount);
}

/**
 * Clear rate limit data for a phone number (for testing)
 */
export async function clearRateLimitForPhone(phoneNumber: string): Promise<void> {
  const data = await loadData();
  delete data[phoneNumber];
  await saveData(data);
}

/**
 * Clear all rate limit data (for testing)
 */
export async function clearAllRateLimits(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
