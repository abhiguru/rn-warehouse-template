/**
 * Checking the warehouse network address before it is needed (WS-L, backend review L2 and decision 4).
 *
 * A fallback used only in an outage fails silently exactly when nothing can be sent to tell anyone: a
 * wrong range, client isolation on the Wi-Fi or a stale address (a DHCP change) show only when the
 * internet is already gone. So the phone asks the LAN address now and then, with no credential, while the
 * internet works, and Settings shows the last answer.
 *
 *  - `checkLanNow`: the "Check now" button. `probeLan` (lanTransport.ts): `hello` for liveness and
 *    `get-public-config` for who answers; the result and its time are kept per facility.
 *  - `startDailyLanCheck`: once a day, only while the phone is on Wi-Fi with the facility's server
 *    answering over the internet (never during an outage: the LAN path is then in use anyway).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { getConnectionPath, getLanContext, probeLan, subscribeLanStatus } from './lanTransport';

export type LanCheckOutcome = 'reachable' | 'unreachable' | 'refused' | 'wrong-server';

export type LanCheckRecord = {
  /** When the check ended (epoch ms). */
  at: number;
  /** The address that was asked: a record about another address is not shown. */
  address: string;
  outcome: LanCheckOutcome;
  /** How long `hello` took, for a reachable address. */
  ms?: number;
  trigger: 'daily' | 'manual';
};

export type LanCheckAnswer = LanCheckRecord | { outcome: 'not-set' };

export const DAILY_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How often a running app looks whether the daily check is due. */
export const DAILY_CHECK_POLL_MS = 60 * 60 * 1000;
/** After the app starts, the first look waits this long so it does not compete with the start. */
export const DAILY_CHECK_START_DELAY_MS = 20 * 1000;

const OUTCOMES: LanCheckOutcome[] = ['reachable', 'unreachable', 'refused', 'wrong-server'];
const storageKey = (canonical: string) => `lan_check_v1:${canonical}`;

const listeners = new Set<() => void>();
export function subscribeLanCheck(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last check of the address in use, or null when there is none (never, or of another address). */
export async function readLastLanCheck(): Promise<LanCheckRecord | null> {
  const context = getLanContext();
  if (!context?.lan) return null;
  try {
    const record = JSON.parse((await AsyncStorage.getItem(storageKey(context.canonical))) ?? 'null') as LanCheckRecord | null;
    if (
      !record ||
      record.address !== context.lan ||
      !OUTCOMES.includes(record.outcome) ||
      !Number.isFinite(record.at) ||
      (record.trigger !== 'daily' && record.trigger !== 'manual')
    )
      return null;
    return record;
  } catch {
    return null;
  }
}

let checking: Promise<LanCheckAnswer> | null = null;

/** Asks the LAN address now and keeps the answer. Several callers at once share one question. */
export function checkLanNow(trigger: LanCheckRecord['trigger'] = 'manual'): Promise<LanCheckAnswer> {
  if (checking) return checking;
  checking = (async (): Promise<LanCheckAnswer> => {
    const context = getLanContext();
    if (!context?.lan) return { outcome: 'not-set' };
    const probe = await probeLan();
    if (!probe.ok && probe.reason === 'not-set') return { outcome: 'not-set' };
    const record: LanCheckRecord = {
      at: Date.now(),
      address: context.lan,
      outcome: probe.ok ? 'reachable' : probe.reason === 'not-set' ? 'unreachable' : probe.reason,
      ...(probe.ok ? { ms: probe.ms } : {}),
      trigger,
    };
    // The facility selected may have changed while the question was out: that answer is about another server.
    if (getLanContext()?.canonical === context.canonical && getLanContext()?.lan === context.lan) {
      try {
        await AsyncStorage.setItem(storageKey(context.canonical), JSON.stringify(record));
      } catch {
        // Showing the result matters more than keeping it.
      }
      for (const listener of [...listeners]) listener();
    }
    return record;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

/** Runs the check if a day has passed since the last one, the phone is on Wi-Fi and the internet reaches the server. */
export async function runDailyLanCheckIfDue(now = Date.now()): Promise<LanCheckAnswer | null> {
  const context = getLanContext();
  if (!context?.lan || getConnectionPath() !== 'public') return null;
  const last = await readLastLanCheck();
  if (last && now - last.at < DAILY_CHECK_INTERVAL_MS && last.at <= now) return null;
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected || state.type !== 'wifi' || state.isInternetReachable !== true) return null;
  } catch {
    return null;
  }
  return checkLanNow('daily');
}

/** Starts the daily check for as long as the app runs; returns the function that stops it. Safe to call again. */
let running: (() => void) | undefined;
export function startDailyLanCheck(): () => void {
  if (running) return running;
  const look = () => {
    void runDailyLanCheckIfDue().catch(() => undefined);
  };
  const first = setTimeout(look, DAILY_CHECK_START_DELAY_MS);
  const poll = setInterval(look, DAILY_CHECK_POLL_MS);
  for (const timer of [first, poll]) (timer as { unref?: () => void }).unref?.();
  const appState = AppState.addEventListener('change', state => {
    if (state === 'active') look();
  });
  // An address that arrives after the start (the first sign-in on this phone) is looked at too.
  let known = getLanContext()?.lan ?? null;
  const status = subscribeLanStatus(() => {
    const lan = getLanContext()?.lan ?? null;
    if (lan && lan !== known) look();
    known = lan;
  });
  const stop = () => {
    clearTimeout(first);
    clearInterval(poll);
    appState.remove();
    status();
    running = undefined;
  };
  running = stop;
  return stop;
}
