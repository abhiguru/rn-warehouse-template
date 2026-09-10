/**
 * useDispatchList - TanStack Query hook for dispatch list data
 *
 * Provides cached, auto-refreshing dispatch list data with:
 * - Automatic caching (5 min stale time)
 * - Background refresh
 * - Optimistic updates
 * - Infinite scroll support
 *
 * @module hooks/queries/useDispatchList
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/lib/queryClient';
import {
  getDispatchListWithItems,
  deleteDispatch,
  GetDispatchListWithItemsParams,
  DispatchListResponseNew,
  Dispatch,
} from '@/services/dispatch-service';

// ============================================================================
// TYPES
// ============================================================================

export interface UseDispatchListOptions {
  customerId?: string;
  filters?: Record<string, unknown>;
  sortBy?: 'dispatch_date' | 'disp_no' | 'customer_name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  includeItems?: boolean;
  enabled?: boolean;
}

export interface UseDispatchListResult {
  dispatches: Dispatch[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// SIMPLE LIST HOOK (for non-paginated use cases)
// ============================================================================

/**
 * Hook for fetching dispatch list with caching
 *
 * @example
 * ```tsx
 * const { dispatches, isLoading, error, refetch } = useDispatchList({
 *   customerId: 'abc123',
 *   sortBy: 'dispatch_date',
 *   sortOrder: 'desc',
 * });
 * ```
 */
export function useDispatchList(options: UseDispatchListOptions = {}): UseDispatchListResult {
  const {
    customerId,
    filters = {},
    sortBy = 'dispatch_date',
    sortOrder = 'desc',
    limit = 20,
    includeItems = true,
    enabled = true,
  } = options;

  const queryKey = queryKeys.dispatch.list({
    customerId,
    filters,
    sortBy,
    sortOrder,
    limit,
    includeItems,
  });

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<DispatchListResponseNew> => {
      const response = await getDispatchListWithItems({
        p_customer_id: customerId,
        p_filters: filters,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: limit,
        p_include_items: includeItems,
        offset: 0,
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch dispatches');
      }

      return response;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    dispatches: data?.data?.dispatches ?? [],
    total: data?.data?.pagination?.total_count ?? 0,
    hasMore: data?.data?.pagination?.has_more ?? false,
    isLoading,
    isRefetching,
    error: error as Error | null,
    refetch,
  };
}

// ============================================================================
// INFINITE SCROLL HOOK (for paginated lists)
// ============================================================================

export interface UseInfiniteDispatchListOptions extends Omit<UseDispatchListOptions, 'limit'> {
  pageSize?: number;
}

/**
 * Hook for infinite scroll dispatch list
 *
 * @example
 * ```tsx
 * const {
 *   dispatches,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useInfiniteDispatchList({ pageSize: 20 });
 *
 * // In FlashList onEndReached:
 * if (hasNextPage && !isFetchingNextPage) {
 *   fetchNextPage();
 * }
 * ```
 */
export function useInfiniteDispatchList(options: UseInfiniteDispatchListOptions = {}) {
  const {
    customerId,
    filters = {},
    sortBy = 'dispatch_date',
    sortOrder = 'desc',
    pageSize = 20,
    includeItems = true,
    enabled = true,
  } = options;

  const queryKey = queryKeys.dispatch.list({
    customerId,
    filters,
    sortBy,
    sortOrder,
    pageSize,
    includeItems,
    infinite: true,
  });

  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 0 }): Promise<DispatchListResponseNew> => {
      const response = await getDispatchListWithItems({
        p_customer_id: customerId,
        p_filters: filters,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: pageSize,
        p_include_items: includeItems,
        offset: pageParam,
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch dispatches');
      }

      return response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: DispatchListResponseNew, _allPages: DispatchListResponseNew[]) => {
      const { pagination } = lastPage.data;
      if (!pagination.has_more) return undefined;
      return pagination.offset + pagination.limit;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // #23 Fix: Memoize flattened pages to avoid O(n*m) on every render
  // Only recomputes when data.pages changes
  const dispatches = useMemo(
    () => data?.pages.flatMap(page => page.data.dispatches) ?? [],
    [data?.pages]
  );
  const total = data?.pages[0]?.data.pagination.total_count ?? 0;

  return {
    dispatches,
    total,
    isLoading,
    isRefetching,
    error: error as Error | null,
    refetch,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Hook for deleting a dispatch
 *
 * @example
 * ```tsx
 * const { mutate: deleteDispatchMutation, isPending } = useDeleteDispatch();
 *
 * const handleDelete = (id: string, userId: string) => {
 *   deleteDispatchMutation({ dispatchId: id, userId }, {
 *     onSuccess: () => toast.success('Dispatch deleted'),
 *     onError: (error) => toast.error(error.message),
 *   });
 * };
 * ```
 */
export function useDeleteDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dispatchId, userId }: { dispatchId: string; userId: string }) => {
      const result = await deleteDispatch(dispatchId, userId);
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete dispatch');
      }
      return result;
    },
    onSuccess: () => {
      // Invalidate all dispatch queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
    },
  });
}

// ============================================================================
// PREFETCH UTILITIES
// ============================================================================

/**
 * Prefetch dispatch list data (useful for navigation)
 */
export function usePrefetchDispatchList() {
  const queryClient = useQueryClient();

  return (options: UseDispatchListOptions = {}) => {
    const {
      customerId,
      filters = {},
      sortBy = 'dispatch_date',
      sortOrder = 'desc',
      limit = 20,
      includeItems = true,
    } = options;

    const queryKey = queryKeys.dispatch.list({
      customerId,
      filters,
      sortBy,
      sortOrder,
      limit,
      includeItems,
    });

    return queryClient.prefetchQuery({
      queryKey,
      queryFn: async () => {
        const response = await getDispatchListWithItems({
          p_customer_id: customerId,
          p_filters: filters,
          p_sort_by: sortBy,
          p_sort_order: sortOrder,
          p_limit: limit,
          p_include_items: includeItems,
          offset: 0,
        });

        if (!response.success) {
          throw new Error(response.message || 'Failed to fetch dispatches');
        }

        return response;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
}
