import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { httpOrigin, validatePublicConfig } from './bootstrapValidation';
import { withLocalizedBootstrapErrors } from './bootstrapErrors';
import type { PublicConfig } from '@/services/configService';
import { t } from '@/i18n';
import { isHostPartChange, parseLanOrigin } from './lanAddress';
import { setLanContext, toCanonicalUrl, transportFetch } from './lanTransport';
import { AppTooOldError } from './appTooOld';
import { clearUpgradeNotice } from './upgradeNotice';
import { DISCOVERY_BUSY_CODE, UPGRADING_CODE } from '@/utils/serverText';

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
   * An address typed in Help because the saved one was stale (the server's address moved), with the server's value at
   * that moment. It is used instead of `lan`, only changes the host part of it (`isHostPartChange`) and exists only
   * while the server sends an address: it is dropped when the server sends a different value or none.
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

/**
 * The server with only valid LAN fields: what an old or damaged saved copy may carry is dropped. A typed address
 * stays only next to the server's own address, and only as a change of its host part.
 */
function withValidLanFields(server: OperatorServer): OperatorServer {
  const { lan, lanTyped, ...rest } = server;
  const savedLan = parseLanOrigin(lan);
  const typed = lanTyped ? parseLanOrigin(lanTyped.address) : null;
  const typedFrom = lanTyped ? parseLanOrigin(lanTyped.serverValue) : null;
  const keepTyped = Boolean(savedLan && typed && typedFrom === savedLan && isHostPartChange(savedLan, typed));
  return {
    ...rest,
    ...(savedLan ? { lan: savedLan } : {}),
    ...(keepTyped && typed ? { lanTyped: { address: typed, serverValue: typedFrom } } : {}),
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

/**
 * The public Google Play listing of this build (owner decision: updates reach the phones through Play), built from the
 * real application id: the id the build was made with (app.config.js, `Constants.expoConfig.android.package`) when it is a
 * real one, else `EXPO_PUBLIC_ANDROID_PACKAGE`. No link when neither is real (missing, or the template's `com.example...`
 * placeholder) or the phone is not an Android one: a link to a listing that does not exist is worse than none, and the screen
 * then says to ask the facility. The build's own id comes first so that a stale environment value can never send the person
 * to another app's listing.
 */
export function updateUrlOf(): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  const isReal = (id: string) => /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(id) && !id.startsWith('com.example');
  const built = (Constants.expoConfig?.android?.package || '').trim();
  const configured = (process.env.EXPO_PUBLIC_ANDROID_PACKAGE || '').trim();
  const id = isReal(built) ? built : isReal(configured) ? configured : '';
  return id ? `https://play.google.com/store/apps/details?id=${id}` : undefined;
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
    throw new AppTooOldError(
      t('errors.server.requiresAppVersion', { version: config.minimumClientVersion }),
      config.minimumClientVersion,
      currentVersion,
      updateUrlOf()
    );
  return config;
}

/**
 * What a non-OK answer of the discovery request is called. The facility ANSWERED in two cases, and says so in words the
 * person can use; the identity the phone holds is untouched by either (nothing is saved on a failed discovery):
 *  - 503 with the body code `upgrading`: the gateway is closed for an upgrade (docs/API_CONTRACT.md in the backend);
 *  - 429: the facility is rate limiting this phone.
 * Anything else keeps the "HTTP <status>" text.
 */
async function discoveryHttpError(response: Response): Promise<Error> {
  if (response.status === 429) return Object.assign(new Error(t('errors.server.discoveryBusy')), { code: DISCOVERY_BUSY_CODE });
  if (response.status === 503) {
    const body = await response.json().catch(() => null) as { code?: unknown } | null;
    if (body?.code === UPGRADING_CODE) return Object.assign(new Error(t('components.upgrading.message')), { code: UPGRADING_CODE });
  }
  return new Error(t('errors.server.discoveryFailedHttp', { status: String(response.status) }));
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
      if (!response.ok) throw await discoveryHttpError(response);
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
 *  - A valid address is saved. A typed address stays only while the server still sends the value it was
 *    typed against (and the typed one is a host-part change of it); a different value from the server wins.
 *  - An absent (or invalid) value removes the saved address AND any typed one (backend contract, hand-off item
 *    3): the operator turned the fallback off, and that withdraws it from every phone.
 *
 * Nothing is announced to `onOperatorServerChange`: a new address is not a new server.
 */
export async function recordServerLanAddress(origin: string, value: unknown): Promise<void> {
  const current = activeServer;
  if (!current || current.origin !== origin) return;
  const offered = parseLanOrigin(value);
  const { lan: _lan, lanTyped, ...rest } = current;
  const typedStays = Boolean(offered && lanTyped && lanTyped.serverValue === offered && isHostPartChange(offered, lanTyped.address));
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
 * The address typed in Help (WS-L). Empty clears it, back to the server's own. A typed address is possible only
 * while the server sends one, and only as a change of its host part: `http://<same first three numbers>.<other
 * last number>:<port>` (a DHCP change moves the server inside its network). Anything else is refused. Returns
 * whether it was saved.
 */
export async function setTypedLanAddress(text: string): Promise<boolean> {
  const current = activeServer;
  if (!current) return false;
  const { lanTyped: _typed, ...rest } = current;
  const blank = text.trim() === '';
  const typed = blank ? null : parseLanOrigin(text);
  if (!blank && (!typed || !current.lan || !isHostPartChange(current.lan, typed))) return false;
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

// A change of server ends the notice about the facility the phone has left (a session change does too: upgradeNotice.ts).
onOperatorServerChange(clearUpgradeNotice);
