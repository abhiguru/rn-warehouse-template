/**
 * A fake warehouse-network listener that signs its answers (WH-133), for the tests of the LAN path.
 *
 * `signingLan(route, lan)` wraps a test's own fetch fake: an answer from the LAN address that carries `X-Warehouse-Path: lan`
 * (and is not the listener's own 403) is given the proof or the signature a real listener would add. The HMAC here is Node's
 * own, over the canonical strings of src/config/lanSigner.ts, so the app's HMAC is checked against an independent one.
 */
import { createHmac } from 'node:crypto';
import { canonicalAnswer, canonicalProof, EMPTY_BODY_HASH } from '@/config/lanSigner';
import { forgetLanKey, storeLanKey } from '@/config/lanKey';
import { createHash } from 'node:crypto';

export const LAN_KEY_ID = '0b9f1c52-6a1d-4f7e-9c0e-2d4f6a8b1c3d';
export const LAN_KEY = 'a1'.repeat(32);

/** Gives the phone the key of this facility's session. */
export async function installLanKey(canonical: string, instanceId: string): Promise<void> {
  await storeLanKey({ id: LAN_KEY_ID, key: LAN_KEY }, canonical, instanceId);
}

export const removeLanKey = (): void => forgetLanKey();

const hmac = (message: string, key: string = LAN_KEY): string => createHmac('sha256', Buffer.from(key, 'hex')).update(message).digest('hex');
const sha = (bytes: Uint8Array): string => (bytes.length === 0 ? EMPTY_BODY_HASH : createHash('sha256').update(bytes).digest('hex'));

function lowerHeaders(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) out[name.toLowerCase()] = String(value);
  return out;
}

type Options = {
  /** Sign with another key (the listener holds a key the phone does not). */
  key?: string;
  /** Leave these URLs unsigned. */
  skip?: (url: string) => boolean;
};

export type SignedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Wraps `route` so that answers of the listener at `lan` are signed. */
export function signingLan(route: SignedFetch, lan: string, options: Options = {}): SignedFetch {
  return async (input, init) => {
    const response = await route(input, init);
    const url = String(input);
    if (!url.startsWith(lan) || options.skip?.(url)) return response;
    const sent = lowerHeaders(init);
    const challenge = sent['x-lan-challenge'];
    const requestId = sent['x-lan-request-id'];
    if ((!challenge && !requestId) || response.status === 403 || response.headers.get('x-warehouse-path') !== 'lan') return response;
    const original = response.headers;
    const raw = await response.clone().json();
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    const serverTime = String(Math.floor(Date.now() / 1000));
    const added: Record<string, string> = { 'x-lan-server-time': serverTime };
    const bodyHash = sha(bytes);
    const keyId = sent['x-lan-key-id'] ?? LAN_KEY_ID;
    if (challenge) {
      added['x-lan-proof'] = hmac(canonicalProof({ keyId, challenge, serverTime, status: response.status, bodyHash }), options.key);
    } else {
      added['x-lan-request-id'] = requestId;
      added['x-lan-signature'] = hmac(
        canonicalAnswer({ keyId, requestId, serverTime, status: response.status, bodyHash, header: name => original.get(name) }),
        options.key
      );
    }
    const headers = { get: (name: string) => added[name.toLowerCase()] ?? original.get(name) };
    const signed = {
      ok: response.ok,
      status: response.status,
      headers,
      json: async () => raw,
      text: async () => JSON.stringify(raw),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      clone: () => signed,
      body: null,
    };
    return signed as unknown as Response;
  };
}
