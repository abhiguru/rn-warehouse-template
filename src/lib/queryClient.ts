/**
 * TanStack Query Client Configuration
 *
 * Provides a configured QueryClient instance for the application.
 * Uses best practices for React Native including:
 * - Appropriate stale times for mobile
 * - Offline support configuration
 * - Retry logic for network failures
 *
 * @module lib/queryClient
 */

import { QueryClient } from '@tanstack/react-query';

// Default stale time for queries (5 minutes)
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// Default cache time (30 minutes)
const DEFAULT_GC_TIME = 30 * 60 * 1000;

/**
 * Configured QueryClient instance
 *
 * Configuration optimized for React Native mobile app:
 * - Queries are considered fresh for 5 minutes
 * - Cached data is garbage collected after 30 minutes
 * - Failed queries retry 3 times with exponential backoff
 * - Window focus refetching disabled (not applicable to mobile)
 * - Reconnect refetching enabled for offline/online transitions
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data freshness
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,

      // Retry configuration
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch behavior
      refetchOnWindowFocus: false, // Not needed for mobile
      refetchOnReconnect: true, // Refetch when network comes back
      refetchOnMount: true, // Refetch when component mounts if stale

      // Network mode - 'online' ensures queries only run when network is available
      networkMode: 'online',
    },
    mutations: {
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'online',
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
