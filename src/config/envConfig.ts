/**
 * Environment Configuration for React Native
 *
 * Configuration is loaded dynamically from Supabase Edge Functions:
 * - Public config from: /functions/v1/get-public-config (no auth required)
 * - Full config from: /functions/v1/get-config (auth required)
 *
 * Set EXPO_PUBLIC_CONFIG_API_URL in your .env file to point to your
 * local Supabase Docker instance (default: http://localhost:18000).
 *
 * Android USB/emulator: use adb reverse tcp:18000 tcp:18000.
 * Keep the supported demo origin http://localhost:18000.
 */

/**
 * Base URL for configuration API
 * Reads from EXPO_PUBLIC_CONFIG_API_URL env var (set in .env)
 * Defaults to local Docker Supabase on port 18000
 */
export const CONFIG_API_BASE_URL =
  process.env.EXPO_PUBLIC_CONFIG_API_URL || 'http://localhost:18000';

/**
 * App configuration metadata
 */
export const APP_CONFIG = {
  name: process.env.EXPO_PUBLIC_APP_NAME || 'Warehouse Manager',
  company: process.env.EXPO_PUBLIC_COMPANY_NAME || 'Your Company',
  useSupabaseAuth: true,
  useDevAuth: __DEV__,
} as const;
