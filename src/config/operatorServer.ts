import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { httpOrigin, validatePublicConfig } from './bootstrapValidation';
import { withLocalizedBootstrapErrors } from './bootstrapErrors';
import type { PublicConfig } from '@/services/configService';
import { t } from '@/i18n';
import { parseLanOrigin } from './lanAddress';
import { setLanContext, toCanonicalUrl, transportFetch } from './lanTransport';

const STORAGE_KEY = 'operator_server_v1';
const STAGED_KEY = 'operator_server_staged_v1';
export const CLIENT_API_VERSION = '1';

export type OperatorServer = {
  origin: string;
  instanceId: string;
  displayName: string;
  companyName: string;
  /**
   * The server's address on the warehouse network, `urls.lan` of its last authenticated `get-config`
   * answered over the public path (WS-L; src/config/lanAddress.ts). Absent while the server offers none.
   */
  lan?: string;
  /**
   * An address typed in Settings because the saved one was stale, with the server's value at that moment.
   * It is used instead of `lan` and kept until the server sends a different value.
   */
  lanTyped?: { address: string; serverValue: string | null };
};

let activeServer: OperatorServer | null = null;
const listeners = new Set<() => void>();
export function onOperatorServerChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The LAN address the transport falls back to: the one typed in Settings, else the server's; null when there is none. */
export function lanAddressOf(server: OperatorServer | null | undefined): string | null {
  return server?.lanTyped?.address ?? server?.lan ?? null;
}

/** The server with only valid LAN fields: what an old or damaged saved copy may carry is dropped. */
function withValidLanFields(server: OperatorServer): OperatorServer {
  const { lan, lanTyped, ...rest } = server;
  const savedLan = parseLanOrigin(lan);
  const typed = lanTyped ? parseLanOrigin(lanTyped.address) : null;
  const typedFrom = lanTyped ? parseLanOrigin(lanTyped.serverValue) : null;
  return {
    ...rest,
    ...(savedLan ? { lan: savedLan } : {}),
    ...(typed ? { lanTyped: { address: typed, serverValue: typedFrom } } : {}),
  };
}

/** Tells the transport which server is selected and where its LAN address is. */
function syncLanContext(server: OperatorServer | null): void {
  setLanContext(
    server ? { canonical: server.origin, lan: lanAddressOf(server), instanceId: server.instanceId } : null
  );
}

export function parseOperatorOrigin(input: string): string {
  const origin = withLocalizedBootstrapErrors(() => httpOrigin(input.trim()));
  if (!origin.startsWith('https://')) throw new Error(t('errors.server.httpsRequired'));
  return origin;
}

export function compareVersions(current: string, minimum: string): number {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(n => !Number.isInteger(n) || n < 0))
    throw new Error(t('errors.server.invalidVersionRequirement'));
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function validateOperatorDiscovery(json: unknown, origin: string): PublicConfig {
  const config = withLocalizedBootstrapErrors(() => validatePublicConfig(json, origin));
  if (
    typeof config.instanceId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(config.instanceId) ||
    typeof config.displayName !== 'string' || !config.displayName.trim() ||
    typeof config.companyName !== 'string' || !config.companyName.trim() ||
    config.canonicalOrigin !== origin ||
    !Array.isArray(config.supportedApiVersions) ||
    !config.supportedApiVersions.includes(CLIENT_API_VERSION) ||
    typeof config.minimumClientVersion !== 'string' ||
    !config.capabilities || typeof config.capabilities !== 'object' || Array.isArray(config.capabilities)
  ) throw new Error(t('errors.server.discoveryIncompatible'));
  const currentVersion = Constants.expoConfig?.version || '0.1.0';
  if (compareVersions(currentVersion, config.minimumClientVersion) < 0)
    throw new Error(t('errors.server.requiresAppVersion', { version: config.minimumClientVersion }));
  return config;
}

export async function discoverOperator(input: string): Promise<{ server: OperatorServer; config: PublicConfig }> {
  const origin = parseOperatorOrigin(input);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const config = await Promise.race([
    (async () => {
      // The public address first; the warehouse network address when it fails (src/config/lanTransport.ts).
      const response = await transportFetch(
        `${origin}/functions/v1/get-public-config`,
        { signal: controller.signal, redirect: 'error' },
        { read: true }
      );
      // React Native follows redirects whatever `redirect` says. Where the
      // final address is known, an answer from another origin is named as such.
      // (An answer over the warehouse network is read as the address it stands for.)
      if (response.url && !toCanonicalUrl(response.url).startsWith(`${origin}/`))
        throw new Error(t('errors.server.discoveryRedirected'));
      if (!response.ok) throw new Error(t('errors.server.discoveryFailedHttp', { status: String(response.status) }));
      return validateOperatorDiscovery(await response.json(), origin);
    })(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(t('errors.server.discoveryTimedOut')));
      }, 15000);
    }),
  ]).finally(() => clearTimeout(timeout));
  return {
    server: { origin, instanceId: config.instanceId, displayName: config.displayName, companyName: config.companyName },
    config,
  };
}

export async function loadOperatorServer(): Promise<OperatorServer | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) { activeServer = null; syncLanContext(null); return null; }
  try {
    const saved = JSON.parse(raw) as OperatorServer;
    if (parseOperatorOrigin(saved.origin) !== saved.origin || !saved.instanceId || !saved.displayName)
      throw new Error('Invalid saved server');
    activeServer = withValidLanFields(saved);
    syncLanContext(activeServer);
    return activeServer;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    activeServer = null;
    syncLanContext(null);
    return null;
  }
}

export function getActiveOperatorServer(): OperatorServer | null { return activeServer; }
export function getActiveOperatorOrigin(): string {
  if (!activeServer) throw new Error(t('errors.server.selectFirst'));
  return activeServer.origin;
}

export async function saveOperatorServer(server: OperatorServer, notify = true): Promise<void> {
  // A discovery answer carries no LAN address (it is public); the same server keeps the one it had.
  const previous = activeServer;
  const sameServer = previous?.origin === server.origin && previous.instanceId === server.instanceId;
  const next = sameServer && server.lan === undefined && server.lanTyped === undefined
    ? withValidLanFields({ ...server, ...(previous.lan ? { lan: previous.lan } : {}), ...(previous.lanTyped ? { lanTyped: previous.lanTyped } : {}) })
    : withValidLanFields(server);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  activeServer = next;
  syncLanContext(next);
  if (notify) for (const listener of listeners) listener();
}

/**
 * Keeps the address the server offers on the warehouse network up to date (WS-L). Called with `urls.lan`
 * of every successful authenticated `get-config` answered over the PUBLIC path, for the server that asked.
 *
 *  - A valid address is saved. A typed address stays unless the server's value is now a different one
 *    than when it was typed; then the server's value wins.
 *  - An absent (or invalid) value removes the saved server value, but a typed address is kept: the person
 *    typed it because the saved one was stale, and a facility that stopped sending its address is not
 *    proof that the typed one is wrong.
 *
 * Nothing is announced to `onOperatorServerChange`: a new address is not a new server.
 */
export async function recordServerLanAddress(origin: string, value: unknown): Promise<void> {
  const current = activeServer;
  if (!current || current.origin !== origin) return;
  const offered = parseLanOrigin(value);
  const { lan: _lan, lanTyped, ...rest } = current;
  const typedStays = lanTyped && (!offered || lanTyped.serverValue === offered);
  const next: OperatorServer = {
    ...rest,
    ...(offered ? { lan: offered } : {}),
    ...(typedStays && lanTyped ? { lanTyped } : {}),
  };
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (activeServer !== current) return; // the selected server changed while saving
  activeServer = next;
  syncLanContext(next);
}

/**
 * The address typed in Settings (WS-L). Empty clears it, back to the server's own. An address that is not
 * `http://<private IPv4>:<port>` is refused. Returns whether it was saved.
 */
export async function setTypedLanAddress(text: string): Promise<boolean> {
  const current = activeServer;
  if (!current) return false;
  const { lanTyped: _typed, ...rest } = current;
  const typed = text.trim() === '' ? null : parseLanOrigin(text);
  if (text.trim() !== '' && !typed) return false;
  const next: OperatorServer = { ...rest, ...(typed ? { lanTyped: { address: typed, serverValue: current.lan ?? null } } : {}) };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (activeServer !== current) return false;
  activeServer = next;
  syncLanContext(next);
  return true;
}

export async function stageOperatorServer(server: OperatorServer): Promise<void> {
  await AsyncStorage.setItem(STAGED_KEY, JSON.stringify(server));
}

export async function commitStagedOperatorServer(server: OperatorServer): Promise<void> {
  await saveOperatorServer(server);
  await AsyncStorage.removeItem(STAGED_KEY).catch(() => {});
}

/**
 * Forget the selected server (central login: leaving a facility for "My
 * facilities"). The caller has ended that facility's session first.
 */
export async function clearOperatorServer(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY, STAGED_KEY]);
  activeServer = null;
  syncLanContext(null);
  for (const listener of listeners) listener();
}
