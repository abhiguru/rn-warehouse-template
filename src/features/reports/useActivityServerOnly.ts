/**
 * Customer activity needs the server for every role but a customer account (WH-381, Product Q1): a customer account keeps
 * its kept answer offline (Design offline-capture.md 8.7 and 9.7 DQ4); administrator, supervisor and staff see the screen's
 * needs-a-connection state. This is the one place the screen asks; the join with the copy slice may point it at
 * `activityMoneyOn()` once that is customer-only.
 */
import { useAppSelector } from '@/store/hooks';

export function useActivityServerOnly(): boolean {
  return useAppSelector(state => state.auth.userProfile?.role) !== 'customer';
}
