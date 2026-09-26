import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { httpOrigin, validatePublicConfig } from './bootstrapValidation';
import type { PublicConfig } from '@/services/configService';

const STORAGE_KEY = 'operator_server_v1';
const STAGED_KEY = 'operator_server_staged_v1';
export const CLIENT_API_VERSION = '1';

export type OperatorServer = {
  origin: string;
  instanceId: string;
  displayName: string;
  companyName: string;
};

let activeServer: OperatorServer | null = null;
const listeners = new Set<() => void>();
export function onOperatorServerChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function parseOperatorOrigin(input: string): string {
  const origin = httpOrigin(input.trim());
  if (!origin.startsWith('https://')) throw new Error('Enter an HTTPS server origin.');
  return origin;
}

export function compareVersions(current: string, minimum: string): number {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(n => !Number.isInteger(n) || n < 0))
    throw new Error('Invalid client version requirement.');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function validateOperatorDiscovery(json: unknown, origin: string): PublicConfig {
  const config = validatePublicConfig(json, origin);
  if (
    typeof config.instanceId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(config.instanceId) ||
    typeof config.displayName !== 'string' || !config.displayName.trim() ||
    typeof config.companyName !== 'string' || !config.companyName.trim() ||
    config.canonicalOrigin !== origin ||
    !Array.isArray(config.supportedApiVersions) ||
    !config.supportedApiVersions.includes(CLIENT_API_VERSION) ||
    typeof config.minimumClientVersion !== 'string' ||
    !config.capabilities || typeof config.capabilities !== 'object' || Array.isArray(config.capabilities)
  ) throw new Error('Server discovery is incomplete or incompatible.');
  const currentVersion = Constants.expoConfig?.version || '0.1.0';
  if (compareVersions(currentVersion, config.minimumClientVersion) < 0)
    throw new Error(`This server requires app version ${config.minimumClientVersion} or newer.`);
  return config;
}

export async function discoverOperator(input: string): Promise<{ server: OperatorServer; config: PublicConfig }> {
  const origin = parseOperatorOrigin(input);
  const response = await fetch(`${origin}/functions/v1/get-public-config`, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Server discovery failed (HTTP ${response.status}).`);
  const config = validateOperatorDiscovery(await response.json(), origin);
  return {
    server: { origin, instanceId: config.instanceId, displayName: config.displayName, companyName: config.companyName },
    config,
  };
}

export async function loadOperatorServer(): Promise<OperatorServer | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as OperatorServer;
    if (parseOperatorOrigin(saved.origin) !== saved.origin || !saved.instanceId || !saved.displayName)
      throw new Error('Invalid saved server');
    activeServer = saved;
    return saved;
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getActiveOperatorServer(): OperatorServer | null { return activeServer; }
export function getActiveOperatorOrigin(): string {
  if (!activeServer) throw new Error('Select an operator server first.');
  return activeServer.origin;
}

export async function saveOperatorServer(server: OperatorServer, notify = true): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(server));
  activeServer = server;
  if (notify) for (const listener of listeners) listener();
}

export async function stageOperatorServer(server: OperatorServer): Promise<void> {
  await AsyncStorage.setItem(STAGED_KEY, JSON.stringify(server));
}

export async function commitStagedOperatorServer(server: OperatorServer): Promise<void> {
  await saveOperatorServer(server);
  await AsyncStorage.removeItem(STAGED_KEY).catch(() => {});
}
