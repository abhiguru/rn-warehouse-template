/**
 * TanStack Query Client Configuration
 *
 * Provides a configured QueryClient instance for the application.
 * Uses best practices for React Native including:
 * - Appropriate stale times for mobile
 * - Read retries for network failures
 * - One attempt per explicit write; no reconnect write queue
 *
 * @module lib/queryClient
 */

import { QueryClient } from '@tanstack/react-query';

// Default stale time for queries (5 minutes)
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// Default cache time (30 minutes)
const DEFAULT_GC_TIME = 30 * 60 * 1000;

const MAX_QUERY_RETRIES = 3;
const REFUSED_CODES = new Set(['42501', 'PGRST301', 'PGRST302', '401', '403']);
const REFUSED_TEXT = /access denied|permission denied|not authori[sz]ed|unauthori[sz]ed|forbidden|session expired|authentication required|not authenticated|active account required|jwt expired|invalid (jwt|token)/i;

/**
 * Whether a failed query is worth asking again. A request the network let
 * down is; an answer that says this session may not have the data is not:
 * three more round trips (about seven seconds) do not change a revoked
 * session or a denied permission, they only delay the message.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  const detail = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(detail.status);
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  if (typeof detail.code === 'string' && REFUSED_CODES.has(detail.code)) return false;
  if (typeof detail.message === 'string' && REFUSED_TEXT.test(detail.message)) return false;
  return true;
}

/**
 * Configured QueryClient instance
 *
 * Configuration optimized for React Native mobile app:
 * - Queries are considered fresh for 5 minutes
 * - Cached data is garbage collected after 30 minutes
 * - Queries that failed in transit retry 3 times with exponential backoff;
 *   one the server refused (session, permission) is not asked again
 * - Window focus refetching disabled (not applicable to mobile)
 * - Reconnect refetching is asked for, but nothing reports connectivity to
 *   the query library (see networkMode below), so it never fires
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data freshness
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,

      // Retry configuration
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch behavior
      refetchOnWindowFocus: false, // Not needed for mobile
      refetchOnReconnect: true, // Refetch when network comes back
      refetchOnMount: true, // Refetch when component mounts if stale

      // 'online' would pause queries while offline, but the app does not feed
      // connectivity into the library's onlineManager (NetInfo is not wired to
      // it), so the library always believes it is online: queries run, and an
      // offline one fails through its retries. Wiring NetInfo in would change
      // that for every list at once; it has not been done.
      networkMode: 'online',
    },
    mutations: {
      // A failed response may follow a committed write. Surface the error so the
      // operator can reconcile before explicitly trying again.
      retry: false,
      // Execute once even when reported offline; let the transport return its
      // normal error instead of pausing a write to run after reconnection.
      networkMode: 'always',
    },
  },
});

// Query key factories for consistent key generation
export const queryKeys = {
  // GRN queries
  grn: {
    all: ['grn'] as const,
    lists: () => [...queryKeys.grn.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.grn.lists(), filters] as const,
    details: () => [...queryKeys.grn.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.grn.details(), id] as const,
  },

  // Dispatch queries
  dispatch: {
    all: ['dispatch'] as const,
    lists: () => [...queryKeys.dispatch.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.dispatch.lists(), filters] as const,
    details: () => [...queryKeys.dispatch.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.dispatch.details(), id] as const,
  },

  // Invoice queries
  invoice: {
    all: ['invoice'] as const,
    lists: () => [...queryKeys.invoice.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.invoice.lists(), filters] as const,
    details: () => [...queryKeys.invoice.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.invoice.details(), id] as const,
  },

  // Order queries
  order: {
    all: ['order'] as const,
    lists: () => [...queryKeys.order.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.order.lists(), filters] as const,
    details: () => [...queryKeys.order.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.order.details(), id] as const,
  },

  // Customer queries
  customer: {
    all: ['customer'] as const,
    lists: () => [...queryKeys.customer.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.customer.lists(), filters] as const,
    details: () => [...queryKeys.customer.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.customer.details(), id] as const,
  },

  // Item queries (products)
  item: {
    all: ['item'] as const,
    lists: () => [...queryKeys.item.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.item.lists(), filters] as const,
  },

  // User queries
  user: {
    all: ['user'] as const,
    profile: () => [...queryKeys.user.all, 'profile'] as const,
    lists: () => [...queryKeys.user.all, 'list'] as const,
    supervisors: () => [...queryKeys.user.lists(), 'supervisors'] as const,
  },
};

export default queryClient;
