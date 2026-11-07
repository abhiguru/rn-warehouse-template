/**
 * Pairing a phone with a local-only facility (WH-146): the QR payload and the checking and opening of the server's answer.
 * The wire contract is the backend's docs/API_CONTRACT.md, "Local-only facility: pairing and server alerts", and its
 * functions/pairing-redeem/handler.ts (`seal`):
 *
 *   proof      = HMAC-SHA256(secret, "WH-PAIR-PROOF-1\n" + code + "\n" + nonce)
 *   key        = HKDF-SHA256(ikm = secret, salt = the 32 nonce bytes, info = "WH-PAIR-KEY-1", 32 bytes)
 *   ciphertext = AES-256-GCM(key, iv, session JSON, additional data = "WH-PAIR-1\n" + code + "\n" + nonce), the tag at the end
 *
 * `openPairingAnswer` checks the proof FIRST, in constant time, and decrypts only after it: a device that answers at the
 * address without the secret is refused before anything of it is used. The secret is a parameter, never stored here, and
 * the byte copies made from it are wiped when the call ends.
 *
 * Crypto is what the app already ships: SHA-256 and AES-GCM from expo-crypto, HMAC from `lanSigner.ts`; HKDF (RFC 5869) is
 * built here from that HMAC. This file imports nothing from the app's state.
 */
import * as Crypto from 'expo-crypto';
import { constantTimeEqual, fromHex, HEX64, hmacSha256Hex, toHex } from './lanSigner';

export const PAIRING_PROOF_LABEL = 'WH-PAIR-PROOF-1';
export const PAIRING_KEY_INFO = 'WH-PAIR-KEY-1';
export const PAIRING_AAD_LABEL = 'WH-PAIR-1';

/** The characters of a pairing code (no 0, 1, I, L, O, U). */
export const PAIRING_CODE = /^[2-9A-HJKMNP-TV-Z]{8}$/;
const UUID_LIKE = /^[a-zA-Z0-9_-]{8,128}$/;
const HEX_EVEN = /^(?:[0-9a-f]{2})+$/;

export type PairingPayload = {
  /** The facility's address on the warehouse network, `http://<private IPv4>:<port>` (src/config/lanAddress.ts). */
  addr: string;
  instanceId: string;
  /** Needed by the redeem call; never shown to be typed. */
  code: string;
  /** 64 hex characters. */
  secret: string;
};

/** The QR text as the backend writes it (`scripts/pairing-code.sh`): `{"v":1,"addr":..,"instance_id":..,"code":..,"secret":..}`. */
export function buildPairingPayload(payload: PairingPayload): string {
  return JSON.stringify({ v: 1, addr: payload.addr, instance_id: payload.instanceId, code: payload.code, secret: payload.secret });
}

/**
 * The payload of a scanned text, or null when it is not one. Strict: version 1, the five fields and nothing about them left
 * to guess. `parseAddr` is `parseLanOrigin` (src/config/lanAddress.ts), passed in so this file stays free of the app.
 */
export function parsePairingPayload(text: unknown, parseAddr: (value: unknown) => string | null): PairingPayload | null {
  if (typeof text !== 'string' || text.length > 1024) return null;
  let raw: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    raw = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const addr = parseAddr(raw.addr);
  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  if (raw.v !== 1 || !addr) return null;
  if (typeof raw.instance_id !== 'string' || !UUID_LIKE.test(raw.instance_id)) return null;
  if (!PAIRING_CODE.test(code) || typeof raw.secret !== 'string' || !HEX64.test(raw.secret)) return null;
  return { addr, instanceId: raw.instance_id, code, secret: raw.secret };
}

/** 32 fresh random bytes as 64 hex characters: the challenge of one redeem call. */
export async function newPairingNonce(): Promise<string> {
  return toHex(await Crypto.getRandomBytesAsync(32));
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** HKDF-SHA256 (RFC 5869) to one block of 32 bytes: extract with the salt, expand with `info` and the counter 1. */
export async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const prk = fromHex(await hmacSha256Hex(salt, ikm));
  const infoBytes = utf8(info);
  const block = new Uint8Array(infoBytes.length + 1);
  block.set(infoBytes, 0);
  block[infoBytes.length] = 1;
  const okm = fromHex(await hmacSha256Hex(prk, block));
  prk.fill(0);
  return okm;
}

/** Why an answer was not opened: `wrong-server` (the proof or the box did not check, nothing was read) or `malformed`. */
export class PairingAnswerError extends Error {
  readonly reason: 'wrong-server' | 'malformed';
  constructor(reason: 'wrong-server' | 'malformed') {
    super(`Pairing answer refused: ${reason}`);
    this.name = 'PairingAnswerError';
    this.reason = reason;
  }
}

/** The AES-GCM step, replaceable so the vector check can run it outside a phone. */
export type AesGcmOpen = (key: Uint8Array, iv: Uint8Array, sealed: Uint8Array, aad: Uint8Array) => Promise<Uint8Array>;

export const aesGcmOpenNative: AesGcmOpen = async (key, iv, sealed, aad) => {
  const aesKey = await Crypto.AESEncryptionKey.import(key);
  const box = Crypto.AESSealedData.fromParts(iv, sealed, 16);
  return Crypto.aesDecryptAsync(box, aesKey, { output: 'bytes', additionalData: aad });
};

/**
 * Checks the server's proof, then opens the sealed session. Throws `PairingAnswerError`; never returns a half-checked value.
 * `answer` is the `data` of the 200 answer: `{ proof, iv, ciphertext }`, all hex.
 */
export async function openPairingAnswer(
  input: { secret: string; code: string; nonce: string },
  answer: unknown,
  open: AesGcmOpen = aesGcmOpenNative
): Promise<Record<string, unknown>> {
  const { secret, code, nonce } = input;
  const body = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>;
  const proof = typeof body.proof === 'string' ? body.proof : '';
  if (!HEX64.test(secret) || !HEX64.test(nonce) || !PAIRING_CODE.test(code) || !HEX64.test(proof)) throw new PairingAnswerError('malformed');
  const secretBytes = fromHex(secret);
  const nonceBytes = fromHex(nonce);
  let key: Uint8Array | null = null;
  try {
    // 1. The proof, before anything else is read.
    const expected = await hmacSha256Hex(secretBytes, `${PAIRING_PROOF_LABEL}\n${code}\n${nonce}`);
    if (!constantTimeEqual(expected, proof)) throw new PairingAnswerError('wrong-server');
    // 2. Only now the box.
    const ivHex = typeof body.iv === 'string' ? body.iv : '';
    const boxHex = typeof body.ciphertext === 'string' ? body.ciphertext : '';
    if (!/^[0-9a-f]{24}$/.test(ivHex) || !HEX_EVEN.test(boxHex) || boxHex.length < 34 || boxHex.length > 8192) throw new PairingAnswerError('malformed');
    key = await hkdfSha256(secretBytes, nonceBytes, PAIRING_KEY_INFO);
    let plain: Uint8Array;
    try {
      plain = await open(key, fromHex(ivHex), fromHex(boxHex), utf8(`${PAIRING_AAD_LABEL}\n${code}\n${nonce}`));
    } catch {
      // The tag did not check: not the box the secret's owner made.
      throw new PairingAnswerError('wrong-server');
    }
    try {
      const session: unknown = JSON.parse(new TextDecoder().decode(plain));
      if (!session || typeof session !== 'object' || Array.isArray(session)) throw new PairingAnswerError('malformed');
      return session as Record<string, unknown>;
    } catch (error) {
      if (error instanceof PairingAnswerError) throw error;
      throw new PairingAnswerError('malformed');
    } finally {
      plain.fill(0);
    }
  } finally {
    secretBytes.fill(0);
    nonceBytes.fill(0);
    key?.fill(0);
  }
}
