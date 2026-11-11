/**
 * A QR code encoder for the pairing code of a local-only facility (WH-146): byte mode, error correction level M, versions 1 to 14
 * (up to 331 bytes), nothing else. The app already ships a QR scanner (expo-camera) but no encoder, and a library for one picture
 * is a dependency the app does not need; this follows ISO/IEC 18004 and is checked against an independent encoder in the WH-146 vector check.
 *
 * Pure: no imports. `qrModules` returns the square of dark (1) and light (0) modules, row by row, without the quiet zone.
 */

/** Level M, index = version. Total codewords, error-correction codewords in all, and blocks. */
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581];
const EC_ALL = [0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130, 150, 176, 198, 216];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9];
/** Centres of the alignment patterns, per version. */
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66]];
export const QR_MAX_BYTES = TOTAL[14] - EC_ALL[14] - 3;

// GF(256) with the QR polynomial 0x11d.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The error-correction codewords of one block. */
function reedSolomon(data: Uint8Array, count: number): Uint8Array {
  let generator = [1];
  for (let i = 0; i < count; i += 1) {
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= mul(generator[j], EXP[i]);
    }
    generator = next;
  }
  const rest = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rest[0];
    rest.copyWithin(0, 1);
    rest[count - 1] = 0;
    if (factor) for (let i = 0; i < count; i += 1) rest[i] ^= mul(generator[i + 1], factor);
  }
  return rest;
}

/** The data codewords of `bytes` (mode, count, data, terminator, padding) for `version`. */
function dataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = TOTAL[version] - EC_ALL[version];
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version > 9 ? 16 : 8);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = new Uint8Array(capacity);
  for (let i = 0; i < bits.length; i += 1) out[i >> 3] |= bits[i] << (7 - (i & 7));
  for (let i = bits.length >> 3, pad = 0; i < capacity; i += 1, pad += 1) out[i] = pad % 2 ? 17 : 236;
  return out;
}

/** Data and error-correction codewords split into blocks and interleaved. */
function interleave(data: Uint8Array, version: number): Uint8Array {
  const blocks = BLOCKS[version];
  const ecEach = EC_ALL[version] / blocks;
  const shortBlocks = blocks - (TOTAL[version] % blocks);
  const shortLength = Math.floor(TOTAL[version] / blocks) - ecEach;
  const parts: { data: Uint8Array; ec: Uint8Array }[] = [];
  for (let b = 0, at = 0; b < blocks; b += 1) {
    const length = b < shortBlocks ? shortLength : shortLength + 1;
    const slice = data.subarray(at, at + length);
    parts.push({ data: slice, ec: reedSolomon(slice, ecEach) });
    at += length;
  }
  const out: number[] = [];
  for (let i = 0; i <= shortLength; i += 1) for (const part of parts) if (i < part.data.length) out.push(part.data[i]);
  for (let i = 0; i < ecEach; i += 1) for (const part of parts) out.push(part.ec[i]);
  return Uint8Array.from(out);
}

const bch = (value: number, generator: number): number => {
  const degree = (n: number) => 31 - Math.clz32(n);
  let result = value << degree(generator);
  while (degree(result) >= degree(generator)) result ^= generator << (degree(result) - degree(generator));
  return result;
};

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m: Uint8Array, size: number): number {
  let score = 0;
  const at = (row: number, col: number) => m[row * size + col];
  for (let a = 0; a < size; a += 1) {
    for (const rows of [true, false]) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        const same = (rows ? at(a, b) : at(b, a)) === (rows ? at(a, b - 1) : at(b - 1, a));
        if (same) run += 1;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }
  for (let r = 0; r < size - 1; r += 1)
    for (let c = 0; c < size - 1; c += 1) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  const finder = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const finderBack = [...finder].reverse();
  for (let a = 0; a < size; a += 1)
    for (let b = 0; b + 11 <= size; b += 1)
      for (const rows of [true, false])
        for (const pattern of [finder, finderBack]) {
          let hit = true;
          for (let k = 0; k < 11 && hit; k += 1) hit = (rows ? at(a, b + k) : at(b + k, a)) === pattern[k];
          if (hit) score += 40;
        }
  let dark = 0;
  for (let i = 0; i < m.length; i += 1) dark += m[i];
  score += Math.floor(Math.abs((dark * 100) / m.length - 50) / 5) * 10;
  return score;
}

/** The modules of the QR code for `text` (UTF-8, byte mode, level M; the mask is the best by the standard's penalty rules unless `forceMask`, used by the check). Throws when it does not fit 14 versions. */
export function qrModules(text: string, forceMask?: number): { size: number; modules: Uint8Array } {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= 14 && TOTAL[version] - EC_ALL[version] - (version > 9 ? 3 : 2) < bytes.length) version += 1;
  if (version > 14) throw new RangeError('Text is too long for a QR code');
  const codewords = interleave(dataCodewords(bytes, version), version);
  const size = 17 + 4 * version;
  const base = new Uint8Array(size * size);
  const fixed = new Uint8Array(size * size);
  const put = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    base[row * size + col] = dark ? 1 : 0;
    fixed[row * size + col] = 1;
  };
  // Finder patterns with their separators.
  for (const [row0, col0] of [[0, 0], [0, size - 7], [size - 7, 0]])
    for (let r = -1; r <= 7; r += 1)
      for (let c = -1; c <= 7; c += 1) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        put(row0 + r, col0 + c, inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
      }
  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    put(6, i, i % 2 === 0);
    put(i, 6, i % 2 === 0);
  }
  // Alignment patterns.
  const centres = ALIGN[version];
  for (const row of centres)
    for (const col of centres) {
      // The three that would sit on a finder pattern are left out; the others replace the timing pattern where they cross it.
      const last = centres[centres.length - 1];
      if ((row === 6 && col === 6) || (row === 6 && col === last) || (row === last && col === 6)) continue;
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) put(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  // Version information (7 and up).
  if (version >= 7) {
    const bits = (version << 12) | bch(version, 0x1f25);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >> i) & 1) === 1;
      put(Math.floor(i / 3), (i % 3) + size - 11, dark);
      put((i % 3) + size - 11, Math.floor(i / 3), dark);
    }
  }
  // Format information (rewritten for each mask below) and the dark module.
  const formatCells: [number, number][][] = [];
  for (let i = 0; i < 15; i += 1) {
    formatCells.push([
      [i < 6 ? i : i < 8 ? i + 1 : size - 15 + i, 8],
      [8, i < 8 ? size - i - 1 : i < 9 ? 15 - i : 14 - i],
    ]);
    for (const [row, col] of formatCells[i]) put(row, col, false);
  }
  put(size - 8, 8, true);
  // Data, zigzag from the bottom right.
  const dataCells: number[] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) if (!fixed[row * size + c]) dataCells.push(row * size + c);
    }
    upward = !upward;
  }
  let best: Uint8Array | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const modules = base.slice();
    dataCells.forEach((cell, i) => {
      const bit = i < codewords.length * 8 ? (codewords[i >> 3] >> (7 - (i & 7))) & 1 : 0;
      const row = Math.floor(cell / size);
      modules[cell] = MASKS[mask](row, cell % size) ? bit ^ 1 : bit;
    });
    const format = ((0b00 << 3) | mask) << 10;
    const bits = (format | bch((0b00 << 3) | mask, 0x537)) ^ 0x5412;
    for (let i = 0; i < 15; i += 1)
      for (const [row, col] of formatCells[i]) modules[row * size + col] = (bits >> i) & 1;
    const score = penalty(modules, size);
    if (score < bestScore) {
      best = modules;
      bestScore = score;
    }
  }
  return { size, modules: best as Uint8Array };
}

/** An SVG path (`M x y h w v1 h-w z` per run of dark modules) for the modules, with a quiet zone of `quiet` modules around. */
export function qrPath(size: number, modules: Uint8Array, quiet = 4): string {
  let d = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; ) {
      if (!modules[row * size + col]) {
        col += 1;
        continue;
      }
      let end = col;
      while (end < size && modules[row * size + end]) end += 1;
      d += `M${col + quiet} ${row + quiet}h${end - col}v1h-${end - col}z`;
      col = end;
    }
  }
  return d;
}
