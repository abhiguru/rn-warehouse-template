/**
 * True while the phone has no connection to the server, as the sync engine knows it (the flag `PhoneCopyLifecycle` feeds
 * from NetInfo and the warehouse network). WH-299: the report screens read it to say that sharing needs a connection.
 */
import { useSyncExternalStore } from 'react';
import { isCopyOffline, subscribeCopyOffline } from './syncEngine';

export function useCopyOffline(): boolean {
  return useSyncExternalStore(subscribeCopyOffline, isCopyOffline, isCopyOffline);
}
