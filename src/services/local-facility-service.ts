/**
 * The two administrator calls of a facility on its local network only (WH-146; backend docs/API_CONTRACT.md, "Local-only
 * facility: pairing and server alerts"): `make_pairing_code(p_profile_id)` for the QR code that signs a person in on one
 * phone, and `get_server_alerts()` for the alerts the Home banner shows. Both go through the signed warehouse network path
 * like every other call. A secret from `make_pairing_code` is returned to the caller only inside the QR text and is not logged.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { getActiveOperatorServer, lanAddressOf } from '@/config/operatorServer';
import { buildPairingPayload, PAIRING_CODE } from '@/config/pairingCrypto';
import { rpcRefusal } from '@/utils/rpcRefusal';
import { HEX64 } from '@/config/lanSigner';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';

const log = createLogger('LocalFacility');

export type MadeCode =
  | { success: true; qrText: string; expiresAt: number; person: { name: string } }
  | { success: false; notAllowed?: boolean; message: string };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** Makes a one-time pairing code for the person (`user_profiles.id`) and returns the text of its QR code. */
export async function makePairingCode(profileId: string): Promise<MadeCode> {
  const generation = getSessionGeneration();
  try {
    const server = getActiveOperatorServer();
    const addr = server?.kind === 'local' ? lanAddressOf(server) : null;
    if (!server || !addr) return { success: false, message: t('users.signInCode.failed') };
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('make_pairing_code', { p_profile_id: profileId });
    if (generation !== getSessionGeneration()) return { success: false, message: t('errors.auth.sessionChanged') };
    if (error) {
      const denied = error.code === '42501' || error.code === 'PERMISSION_DENIED';
      return { success: false, notAllowed: denied, message: t(denied ? 'users.signInCode.notAllowed' : 'users.signInCode.failed') };
    }
    const refusal = rpcRefusal(data);
    if (refusal) {
      const denied = refusal.code === '42501' || refusal.code === 'PERMISSION_DENIED';
      return { success: false, notAllowed: denied, message: t(denied ? 'users.signInCode.notAllowed' : 'users.signInCode.failed') };
    }
    const answer = data?.data as Record<string, unknown> | undefined;
    const code = text(answer?.code);
    const secret = text(answer?.secret);
    const expiresAt = Date.parse(String(answer?.expires_at));
    if (!code || !PAIRING_CODE.test(code) || !secret || !HEX64.test(secret) || !Number.isFinite(expiresAt))
      return { success: false, message: t('users.signInCode.failed') };
    const person = answer?.user as { name?: unknown } | undefined;
    return {
      success: true,
      qrText: buildPairingPayload({ addr, instanceId: server.instanceId, code, secret }),
      expiresAt,
      person: { name: text(person?.name) ?? '' },
    };
  } catch {
    log.error('Making a pairing code failed');
    return { success: false, message: t('users.signInCode.failed') };
  }
}

export type ServerAlert = { id: string; summary: string; detail: string; since: string | null };

/** The alerts firing now, oldest first; null when they could not be read (the banner then keeps what it had). */
export async function getServerAlerts(): Promise<ServerAlert[] | null> {
  const generation = getSessionGeneration();
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc('get_server_alerts');
    if (generation !== getSessionGeneration() || error || rpcRefusal(data)) return null;
    const list = data?.data;
    if (!Array.isArray(list)) return null;
    const alerts: ServerAlert[] = [];
    for (const raw of list as Record<string, unknown>[]) {
      const summary = text(raw?.summary);
      if (!summary) continue;
      alerts.push({
        id: String(raw.id ?? summary),
        summary,
        detail: text(raw.detail) ?? '',
        since: text(raw.since),
      });
    }
    return alerts;
  } catch {
    return null;
  }
}
