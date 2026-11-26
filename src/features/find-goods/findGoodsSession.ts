/**
 * The GRN tab's chosen view and the typed search of Find goods (WH-300, Design 3.1): kept until the app is closed, and
 * emptied on sign-out and on a facility switch.
 */
import { useSyncExternalStore } from 'react';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

export type GrnView = 'grn' | 'find-goods';
export interface FindGoodsSession {
  view: GrnView;
  text: string;
}

const INITIAL: FindGoodsSession = { view: 'grn', text: '' };
let session = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<FindGoodsSession>): void {
  session = { ...session, ...patch };
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): FindGoodsSession => session;

export const setGrnView = (view: GrnView): void => set({ view });
export const setFindGoodsText = (text: string): void => set({ text });
export const useFindGoodsSession = (): FindGoodsSession => useSyncExternalStore(subscribe, read, read);

registerSessionScoped('find-goods-session', () => {
  session = INITIAL;
  for (const listener of [...listeners]) listener();
});
