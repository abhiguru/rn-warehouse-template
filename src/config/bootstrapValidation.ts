// Shared by the native app and Node CLI (Node 22.18+ strips TypeScript).
// JWT decoding classifies a public key; it does not authenticate a user.
import type { PublicConfig, FullConfig } from '../services/configService';

/**
 * What was wrong, as a code. The message is English for the CLI and the logs;
 * the app shows `errors.server.<code>` in the person's language instead
 * (localizeBootstrapError in operatorServer.ts). This file stays free of
 * imports so Node can run it, which is why it does not translate anything.
 */
export type BootstrapErrorCode =
  | 'originRequired'
  | 'originBare'
  | 'config.invalidShape'
  | 'config.privateField'
  | 'config.anonKey'
  | 'config.endpointMismatch'
  | 'config.publicIncomplete'
  | 'config.publicUrlMismatch'
  | 'config.publicShape'
  | 'config.featureFlags'
  | 'config.minimumVersion'
  | 'config.storeUrl'
  | 'config.authenticatedResponse'
  | 'config.externalUnsupported'
  | 'config.originMismatch'
  | 'config.features'
  | 'config.metadata'
  | 'config.limits';

export class BootstrapValidationError extends Error {
  code: BootstrapErrorCode;

  constructor(code: BootstrapErrorCode, message: string) {
    super(message);
    this.name = 'BootstrapValidationError';
    this.code = code;
  }
}

export function httpOrigin(value: unknown): string {
  if (typeof value !== 'string')
    throw new BootstrapValidationError('originRequired', 'Configure an HTTP(S) origin.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BootstrapValidationError('originRequired', 'Configure an HTTP(S) origin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new BootstrapValidationError('originBare', 'Configure an HTTP(S) origin without credentials, a path, or query parameters.');
  }
  return url.origin;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BootstrapValidationError('config.invalidShape', 'Invalid configuration shape.');
  return value as Record<string, unknown>;
}

function rejectPrivate(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (
      /^(service(?:role)?key|servicerole|jwtsecret|.*password|privatekey|accesstoken|refreshtoken|clientsecret)$/i.test(
        key.replace(/[^a-z]/gi, '')
      )
    ) {
      throw new BootstrapValidationError('config.privateField', 'Response contains a private configuration field.');
    }
    rejectPrivate(nested);
  }
}

export function classifyAnonKey(value: unknown): void {
  try {
    if (
      typeof value !== 'string' ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    )
      throw new Error();
    const payload = JSON.parse(
      atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (
      payload.role !== 'anon' ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now() / 1000
    )
      throw new Error();
  } catch {
    throw new BootstrapValidationError('config.anonKey', 'Expected a non-expired anon key, never a service-role key.');
  }
}

function endpoint(value: unknown, origin: string, path: string): void {
  if (value !== `${origin}${path}`)
    throw new BootstrapValidationError('config.endpointMismatch', 'Configuration endpoints must match the backend origin.');
}

export function validatePublicConfig(
  json: unknown,
  expectedUrl: string
): PublicConfig {
  rejectPrivate(json);
  const envelope = object(json);
  if (envelope.success !== true)
    throw new BootstrapValidationError('config.publicIncomplete', 'Backend has not returned a complete public configuration.');
  const config = object(envelope.data);
  const origin = httpOrigin(expectedUrl);
  if (httpOrigin(config.supabaseUrl) !== origin)
    throw new BootstrapValidationError('config.publicUrlMismatch', 'Backend SUPABASE_PUBLIC_URL must match EXPO_PUBLIC_CONFIG_API_URL.');
  classifyAnonKey(config.anonKey);
  if (
    typeof config.environment !== 'string' ||
    typeof config.version !== 'string' ||
    typeof config.maintenanceMode !== 'boolean'
  )
    throw new BootstrapValidationError('config.publicShape', 'Invalid public configuration shape.');
  const urls = object(config.urls);
  endpoint(urls.publicConfig, origin, '/functions/v1/get-public-config');
  endpoint(urls.fullConfig, origin, '/functions/v1/get-config');
  if (
    config.featureFlags !== undefined &&
    Object.values(object(config.featureFlags)).some(v => typeof v !== 'boolean')
  )
    throw new BootstrapValidationError('config.featureFlags', 'Invalid feature flags.');
  if (
    config.minimumVersion !== undefined &&
    (typeof config.minimumVersion !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(config.minimumVersion))
  )
    throw new BootstrapValidationError('config.minimumVersion', 'Invalid minimum version.');
  if (config.storeUrls !== undefined) {
    for (const value of Object.values(object(config.storeUrls))) {
      if (typeof value !== 'string') throw new BootstrapValidationError('config.storeUrl', 'Invalid store URL.');
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new BootstrapValidationError('config.storeUrl', 'Invalid store URL.');
    }
  }
  return config as unknown as PublicConfig;
}

export function validateFullConfig(
  json: unknown,
  expectedUrl: string
): FullConfig {
  rejectPrivate(json);
  const envelope = object(json);
  if (envelope.success !== true)
    throw new BootstrapValidationError('config.authenticatedResponse', 'Invalid authenticated configuration response.');
  const config = object(envelope.data);
  const keys = object(config.apiKeys);
  if (keys.external !== undefined)
    throw new BootstrapValidationError('config.externalUnsupported', 'External private configuration is unsupported.');
  const supabase = object(keys.supabase);
  const origin = httpOrigin(expectedUrl);
  if (httpOrigin(supabase.url) !== origin)
    throw new BootstrapValidationError('config.originMismatch', 'Backend origin mismatch.');
  classifyAnonKey(supabase.anonKey);
  const features = object(config.features);
  if (
    ['testMode', 'maintenanceMode', 'otpEnabled'].some(
      k => typeof features[k] !== 'boolean'
    ) ||
    typeof features.smsProvider !== 'string' ||
    typeof features.maxFileUploadSize !== 'number' ||
    !Number.isFinite(features.maxFileUploadSize) ||
    features.maxFileUploadSize <= 0 ||
    ['allowedFileTypes', 'enabledFeatures'].some(
      k =>
        !Array.isArray(features[k]) ||
        (features[k] as unknown[]).some(v => typeof v !== 'string')
    )
  )
    throw new BootstrapValidationError('config.features', 'Invalid feature configuration.');
  for (const [group, names] of Object.entries({
    environment: ['name', 'version', 'buildDate', 'region'],
    support: ['email', 'phone', 'appName'],
  })) {
    const fields = object(config[group]);
    if (names.some(k => typeof fields[k] !== 'string'))
      throw new BootstrapValidationError('config.metadata', 'Invalid configuration metadata.');
  }
  const urls = object(config.urls);
  endpoint(urls.api, origin, '/rest/v1');
  endpoint(urls.storage, origin, '/storage/v1');
  endpoint(urls.auth, origin, '/rest/v1/rpc');
  endpoint(urls.realtime, origin.replace(/^http/, 'ws'), '/realtime/v1');
  const limits = object(config.limits);
  if (
    [
      'otpHourlyLimit',
      'otpDailyLimit',
      'sessionTimeout',
      'refreshTokenExpiry',
      'apiRateLimitPerMinute',
      'apiRateLimitPerHour',
    ].some(
      k =>
        typeof limits[k] !== 'number' ||
        !Number.isFinite(limits[k]) ||
        (limits[k] as number) <= 0
    )
  )
    throw new BootstrapValidationError('config.limits', 'Invalid configuration limits.');
  return config as unknown as FullConfig;
}
