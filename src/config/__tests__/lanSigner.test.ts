/**
 * The warehouse network signer (WH-133): HMAC-SHA256 is built here from a plain SHA-256, so it is checked against the
 * published RFC 4231 vectors and against Node's own HMAC. The canonical strings are the backend contract's, byte for byte.
 */
import { createHmac } from 'node:crypto';
import {
  ANSWER_LABEL,
  EMPTY_BODY_HASH,
  PROOF_LABEL,
  REQUEST_LABEL,
  canonicalAnswer,
  canonicalProof,
  canonicalRequest,
  constantTimeEqual,
  fromHex,
  hmacSha256Hex,
  randomHex,
  sha256Hex,
  signRequest,
  toHex,
  verifyAnswerSignature,
  verifyProof,
} from '../lanSigner';
import { parseLanKey } from '../lanKey';

const text = (value: string) => new TextEncoder().encode(value);

describe('HMAC-SHA256 against RFC 4231', () => {
  it('test case 1', async () => {
    expect(await hmacSha256Hex(fromHex('0b'.repeat(20)), text('Hi There'))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });

  it('test case 2 (a key shorter than the block)', async () => {
    expect(await hmacSha256Hex(text('Jefe'), text('what do ya want for nothing?'))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('test case 6 (a key longer than the block is hashed first)', async () => {
    const key = fromHex('aa'.repeat(131));
    expect(await hmacSha256Hex(key, text('Test Using Larger Than Block-Size Key - Hash Key First'))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'
    );
  });

  it('agrees with Node for a 32-byte key and a message of any length', async () => {
    const key = 'a1'.repeat(32);
    for (const message of ['', 'x', 'WH-LAN-REQ-1\nGET\n/rest/v1/items', 'ગુજરાતી', 'y'.repeat(500)]) {
      expect(await hmacSha256Hex(fromHex(key), message)).toBe(createHmac('sha256', Buffer.from(key, 'hex')).update(message).digest('hex'));
    }
  });
});

describe('hashes and hex', () => {
  it('hashes an empty body to the constant the contract names, and "abc" to its known digest', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_BODY_HASH);
    expect(await sha256Hex(text('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('round-trips hex and gives fresh random values of the length asked', async () => {
    expect(toHex(fromHex('00ff10ab'))).toBe('00ff10ab');
    const a = await randomHex(32);
    const b = await randomHex(32);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('compares signatures in full, of the same length only', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('the canonical strings', () => {
  const header = (name: string) => ({ accept: '*/*', apikey: '  k  ', 'content-type': 'application/json' })[name as 'accept'];

  it('lists the request, then its ten signed headers in the contract\'s order, trimmed, absent as empty', () => {
    const lines = canonicalRequest({ method: 'POST', target: '/rest/v1/items?x=1', keyId: 'kid', time: '1793008800', requestId: 'rid', bodyHash: EMPTY_BODY_HASH, header }).split('\n');
    expect(lines.slice(0, 7)).toEqual([REQUEST_LABEL, 'POST', '/rest/v1/items?x=1', 'kid', '1793008800', 'rid', EMPTY_BODY_HASH]);
    expect(lines.slice(7)).toEqual([
      'accept:*/*', 'accept-profile:', 'apikey:k', 'authorization:', 'cache-control:', 'content-profile:', 'content-type:application/json', 'prefer:', 'range:', 'x-upsert:',
    ]);
  });

  it('lists the answer with its status and the eight signed answer headers', () => {
    const lines = canonicalAnswer({ keyId: 'kid', requestId: 'rid', serverTime: '1793008801', status: 200, bodyHash: 'h', header: name => (name === 'content-type' ? 'application/json' : null) }).split('\n');
    expect(lines.slice(0, 6)).toEqual([ANSWER_LABEL, 'kid', 'rid', '1793008801', '200', 'h']);
    expect(lines.slice(6)).toEqual([
      'content-disposition:', 'content-range:', 'content-type:application/json', 'location:', 'preference-applied:', 'retry-after:', 'www-authenticate:', 'x-request-id:',
    ]);
  });

  it('lists the identity proof', () => {
    expect(canonicalProof({ keyId: 'kid', challenge: 'c', serverTime: '1', status: 200, bodyHash: 'h' })).toBe([PROOF_LABEL, 'kid', 'c', '1', '200', 'h'].join('\n'));
  });
});

describe('signing and verifying', () => {
  const key = 'a1'.repeat(32);
  const answer = { keyId: 'kid', requestId: 'rid', serverTime: '1793008801', status: 200, bodyHash: EMPTY_BODY_HASH, header: () => null };
  const proof = { keyId: 'kid', challenge: 'c'.repeat(64), serverTime: '1793008801', status: 200, bodyHash: EMPTY_BODY_HASH };

  it('signs a request as Node\'s HMAC of the canonical string', async () => {
    const parts = { method: 'GET', target: '/rest/v1/items', keyId: 'kid', time: '1793008800', requestId: 'rid', bodyHash: EMPTY_BODY_HASH, header: () => null };
    expect(await signRequest(key, parts)).toBe(createHmac('sha256', Buffer.from(key, 'hex')).update(canonicalRequest(parts)).digest('hex'));
  });

  it('accepts the answer signature of the same key and nothing else', async () => {
    const good = createHmac('sha256', Buffer.from(key, 'hex')).update(canonicalAnswer(answer)).digest('hex');
    expect(await verifyAnswerSignature(key, answer, good)).toBe(true);
    expect(await verifyAnswerSignature('b2'.repeat(32), answer, good)).toBe(false);
    expect(await verifyAnswerSignature(key, { ...answer, status: 201 }, good)).toBe(false);
    expect(await verifyAnswerSignature(key, { ...answer, requestId: 'other' }, good)).toBe(false);
    expect(await verifyAnswerSignature(key, { ...answer, bodyHash: 'f'.repeat(64) }, good)).toBe(false);
    expect(await verifyAnswerSignature(key, { ...answer, header: name => (name === 'location' ? 'http://evil' : null) }, good)).toBe(false);
    expect(await verifyAnswerSignature(key, answer, good.toUpperCase())).toBe(false);
    expect(await verifyAnswerSignature(key, answer, 'short')).toBe(false);
  });

  it('accepts the identity proof of the same key and challenge and nothing else', async () => {
    const good = createHmac('sha256', Buffer.from(key, 'hex')).update(canonicalProof(proof)).digest('hex');
    expect(await verifyProof(key, proof, good)).toBe(true);
    expect(await verifyProof(key, { ...proof, challenge: 'd'.repeat(64) }, good)).toBe(false);
    expect(await verifyProof('b2'.repeat(32), proof, good)).toBe(false);
    // An answer signature is not a proof: the labels keep the two apart.
    const asAnswer = createHmac('sha256', Buffer.from(key, 'hex')).update(canonicalAnswer(answer)).digest('hex');
    expect(await verifyProof(key, proof, asAnswer)).toBe(false);
  });
});

describe('a key from an answer', () => {
  const id = '0b9f1c52-6a1d-4f7e-9c0e-2d4f6a8b1c3d';

  it('is a key only when it is a lower-case UUID and 64 hex characters', () => {
    expect(parseLanKey(id, 'a1'.repeat(32))).toEqual({ id, key: 'a1'.repeat(32) });
    expect(parseLanKey(id, 'A1'.repeat(32))).toBeNull();
    expect(parseLanKey(id, 'a1'.repeat(31))).toBeNull();
    expect(parseLanKey('not-a-uuid', 'a1'.repeat(32))).toBeNull();
    expect(parseLanKey(undefined, undefined)).toBeNull();
    expect(parseLanKey(5, 'a1'.repeat(32))).toBeNull();
  });
});
