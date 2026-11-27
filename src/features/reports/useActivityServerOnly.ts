/**
 * Customer activity needs the server whenever its answer is not kept on the phone (WH-381, Product Q1): only a customer
 * account keeps its answer offline (`activityMoneyOn()`, Design offline-capture.md 8.7 and 9.7 DQ4); administrator,
 * supervisor and staff see the screen's needs-a-connection state. This is the one place the screen asks.
 */
import { useSyncExternalStore } from 'react';
import { activityMoneyOn } from '@/features/phone-copy/money/moneyGate';
import { subscribeSync } from '@/features/phone-copy/syncStore';

export function useActivityServerOnly(): boolean {
  return !useSyncExternalStore(subscribeSync, activityMoneyOn, activityMoneyOn);
}
