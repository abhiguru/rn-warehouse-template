import * as Crypto from 'expo-crypto';
import { t } from '@/i18n';

// Document numbers identify a create operation within one warehouse database.
// Reuse the same key for the same complete RPC body after a lost response, even
// across screen remounts. A changed body gets a new key instead of a stale result.
// Each instance has its own database/cache; no session or credentials enter this.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export async function submissionIdempotencyKey(operation: 'grn' | 'dispatch', body: Record<string, unknown>): Promise<string> {
  const document = operation === 'grn' ? body.p_gr_no : (body.p_dispatch_data as { disp_no?: string } | undefined)?.disp_no;
  if (typeof document !== 'string' || !document.trim()) throw new Error(t('errors.document.numberRequired'));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(canonical(body)));
  return `warehouse-${operation}-${digest}`;
}

// An edit has no document number of its own to key on: the same GRN is edited
// many times, and the same body can be right twice (a note set, changed by a
// colleague or by the next save, set again). So each edit session of a GRN has
// a random part, and a key is reused only by a Save that repeats the body sent
// last. The session is renewed when the edit form loads the GRN, after every
// save the server answered with success, and when the body differs from the
// one sent last.
let grnEditSession: { grnId: string; session: string; lastBody?: string } | null = null;

export function beginGrnEditSession(grnId: string): void {
  grnEditSession = { grnId, session: Crypto.randomUUID() };
}

/** Key for `update_grn`: the edit session, the GRN and the complete RPC body. */
export async function grnUpdateIdempotencyKey(grnId: string, body: Record<string, unknown>): Promise<string> {
  const sha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
  const bodyDigest = await sha256(JSON.stringify(canonical(body)));
  if (grnEditSession?.grnId !== grnId || (grnEditSession.lastBody && grnEditSession.lastBody !== bodyDigest)) {
    beginGrnEditSession(grnId);
  }
  const current = grnEditSession!;
  current.lastBody = bodyDigest;
  return `warehouse-grn-update-${await sha256(`${current.session}:${grnId}:${bodyDigest}`)}`;
}
