/**
 * Signing on the warehouse network (WH-133). The wire contract is the backend's docs/API_CONTRACT.md, "Signing on the LAN
 * path", and its docker/lan-signer/signer.ts; the canonical strings below are those of `canonicalRequest`,
 * `canonicalAnswer` and `canonicalProof`, byte for byte.
 *
 * Crypto: SHA-256 is expo-crypto's native `digest` (already a dependency). expo-crypto has no HMAC, so HMAC-SHA256 is
 * built here from it as RFC 2104 defines it (block size 64, ipad 0x36, opad 0x5c). Nothing here logs, stores or sends a
 * key; the key lives in src/config/lanKey.ts.
 *
 * This file imports nothing from the app, so the transport and the tests can use it.
 */
import * as Crypto from 'expo-crypto';

export const REQUEST_LABEL = 'WH-LAN-REQ-1';
export const ANSWER_LABEL = 'WH-LAN-ANS-1';
export const PROOF_LABEL = 'WH-LAN-PROOF-1';
/** Signed request headers, in this order. The gateway passes on only these ten. */
export const SIGNED_REQUEST_HEADERS = [
  'accept',
  'accept-profile',
  'apikey',
  'authorization',
  'cache-control',
  'content-profile',
  'content-type',
  'prefer',
  'range',
  'x-upsert',
] as const;
/** Signed answer headers, in this order. */
export const SIGNED_ANSWER_HEADERS = [
  'content-disposition',
  'content-range',
  'content-type',
  'location',
  'preference-applied',
  'retry-after',
  'www-authenticate',
  'x-request-id',
] as const;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX32 = /^[0-9a-f]{32}$/;
export const HEX64 = /^[0-9a-f]{64}$/;
export const SECONDS = /^[1-9][0-9]{0,11}$/;
/** SHA-256 of an empty body. */
export const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const BLOCK = 64;

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 1) out += view[i].toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A standalone ArrayBuffer-backed copy, which is what the native digest takes. */
function plain(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, plain(bytes)));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await sha256(bytes));
}

/** HMAC-SHA256 (RFC 2104) of `message` under `key`; lower-case hex. */
export async function hmacSha256Hex(key: Uint8Array, message: string | Uint8Array): Promise<string> {
  const k = key.length > BLOCK ? await sha256(key) : key;
  const inner = new Uint8Array(BLOCK);
  const outer = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i += 1) {
    const byte = i < k.length ? k[i] : 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  const body = typeof message === 'string' ? utf8(message) : message;
  const first = new Uint8Array(BLOCK + body.length);
  first.set(inner, 0);
  first.set(body, BLOCK);
  const innerHash = await sha256(first);
  const second = new Uint8Array(BLOCK + innerHash.length);
  second.set(outer, 0);
  second.set(innerHash, BLOCK);
  return toHex(await sha256(second));
}

/** Compares two strings without stopping at the first difference. Different lengths are not equal (signatures have a fixed length). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A header value as it is signed: leading and trailing spaces and tabs removed; absent is empty. */
const signedValue = (value: string | null | undefined): string => (value ?? '').replace(/^[ \t]+|[ \t]+$/g, '');

export type RequestParts = {
  method: string;
  target: string;
  keyId: string;
  time: string;
  requestId: string;
  bodyHash: string;
  header: (name: string) => string | null | undefined;
};

/** The string a request signature covers (lines joined with \n, no newline at the end). */
export function canonicalRequest(parts: RequestParts): string {
  return [
    REQUEST_LABEL,
    parts.method,
    parts.target,
    parts.keyId,
    parts.time,
    parts.requestId,
    parts.bodyHash,
    ...SIGNED_REQUEST_HEADERS.map(name => `${name}:${signedValue(parts.header(name))}`),
  ].join('\n');
}

export type AnswerParts = {
  keyId: string;
  requestId: string;
  serverTime: string;
  status: number;
  bodyHash: string;
  header: (name: string) => string | null | undefined;
};

/** The string an answer signature covers. */
export function canonicalAnswer(parts: AnswerParts): string {
  return [
    ANSWER_LABEL,
    parts.keyId,
    parts.requestId,
    parts.serverTime,
    String(parts.status),
    parts.bodyHash,
    ...SIGNED_ANSWER_HEADERS.map(name => `${name}:${signedValue(parts.header(name))}`),
  ].join('\n');
}

/** The string the identity proof covers. */
export function canonicalProof(parts: { keyId: string; challenge: string; serverTime: string; status: number; bodyHash: string }): string {
  return [PROOF_LABEL, parts.keyId, parts.challenge, parts.serverTime, String(parts.status), parts.bodyHash].join('\n');
}

export async function signRequest(keyHex: string, parts: RequestParts): Promise<string> {
  return hmacSha256Hex(fromHex(keyHex), canonicalRequest(parts));
}

/**
 * True when `signature` is the HMAC of the answer to the request `parts.requestId`. The request id is the one the phone
 * sent, not the echo. The comparison is constant time.
 */
export async function verifyAnswerSignature(keyHex: string, parts: AnswerParts, signature: string): Promise<boolean> {
  if (!HEX64.test(signature)) return false;
  const expected = await hmacSha256Hex(fromHex(keyHex), canonicalAnswer(parts));
  return constantTimeEqual(expected, signature);
}

/** True when `proof` is the HMAC of the identity challenge answer. Constant time. */
export async function verifyProof(
  keyHex: string,
  parts: { keyId: string; challenge: string; serverTime: string; status: number; bodyHash: string },
  proof: string
): Promise<boolean> {
  if (!HEX64.test(proof)) return false;
  const expected = await hmacSha256Hex(fromHex(keyHex), canonicalProof(parts));
  return constantTimeEqual(expected, proof);
}

/** `count` fresh random bytes as lower-case hex. */
export async function randomHex(count: number): Promise<string> {
  return toHex(await Crypto.getRandomBytesAsync(count));
}
