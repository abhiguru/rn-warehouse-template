/**
 * TanStack Query Hooks
 *
 * React Query hooks for data fetching with automatic caching,
 * background refresh, and optimistic updates.
 *
 * @module hooks/queries
 */

// Dispatch queries
export {
  useDispatchList,
  useInfiniteDispatchList,
  useDeleteDispatch,
  usePrefetchDispatchList,
  type UseDispatchListOptions,
  type UseDispatchListResult,
  type UseInfiniteDispatchListOptions,
} from './useDispatchList';

// Re-export query keys and client for advanced use cases
export { queryKeys, queryClient } from '@/lib/queryClient';
