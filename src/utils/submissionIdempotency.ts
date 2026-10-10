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
