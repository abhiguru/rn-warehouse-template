// Reads and checks a brand pack folder (docs/STYLE_GUIDE.md, "Adding your own brand").
// Used by app.config.js at build time; plain CommonJS so the config can require it.
const fs = require('fs');
const path = require('path');

const TOKENS = ['fill', 'onFill', 'fillPressed', 'tint', 'subtle', 'subtleStrong', 'secondary', 'secondaryText'];
const MARK = ['panel', 'wordmark', 'rule', 'caption'];
// The surfaces the brand tokens sit on (src/theme/tokens/reference.ts, Horizon).
const SURFACES = {
  light: { base: '#F5F6F7', card: '#FFFFFF' },
  dark: { base: '#12171C', card: '#1D232A' },
};
const AA_TEXT = 4.5;
const AA_LARGE = 3;

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function rgb(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return null;
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
}
function luminance(color) {
  const [r, g, b] = rgb(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

function fail(message) {
  throw new Error(`WAREHOUSE_BRAND_PACK: ${message}`);
}

function checkMode(pack, mode) {
  const set = pack[mode];
  if (!set || typeof set !== 'object') fail(`the ${mode} token set is missing`);
  for (const name of TOKENS) {
    if (typeof set[name] !== 'string' || !rgb(set[name])) fail(`${mode}.${name} is missing or not a #RRGGBB colour`);
  }
  const mark = set.mark;
  if (mark !== undefined) {
    for (const name of MARK) {
      const ok = mark[name] === 'transparent' && name === 'panel';
      if (!ok && (typeof mark[name] !== 'string' || !rgb(mark[name]))) fail(`${mode}.mark.${name} is not a #RRGGBB colour`);
    }
  }
  const min = (name, fg, bg, need) => {
    const ratio = contrast(fg, bg);
    if (ratio < need) fail(`${mode}.${name} is ${ratio.toFixed(2)}:1, needs ${need}:1`);
  };
  const { base, card } = SURFACES[mode];
  for (const [surface, colour] of [['the page', base], ['a card', card]]) {
    min(`tint on ${surface}`, set.tint, colour, AA_TEXT);
    min(`secondaryText on ${surface}`, set.secondaryText, colour, AA_TEXT);
  }
  min('tint on subtle', set.tint, set.subtle, AA_TEXT);
  min('onFill on fill', set.onFill, set.fill, AA_TEXT);
  min('onFill on fillPressed', set.onFill, set.fillPressed, AA_TEXT);
  if (mark) {
    const panel = mark.panel === 'transparent' ? base : mark.panel;
    min('mark.wordmark on its panel', mark.wordmark, panel, AA_LARGE);
    min('mark.caption on its panel', mark.caption, panel, AA_TEXT);
  }
}

/** Loads <dir>/brand.json, checks it and returns the pack (the shape of BrandPack in src/theme/brandPack.ts). */
function loadBrandPack(dir) {
  const file = path.join(dir, 'brand.json');
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
  if (typeof pack.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(pack.id) || pack.id === 'orange') {
    fail('id must be lowercase letters, digits and dashes, and not "orange"');
  }
  if (!pack.name || typeof pack.name.en !== 'string' || !pack.name.en.trim()) fail('name.en is missing');
  if (!Array.isArray(pack.wordmark) || pack.wordmark.length === 0 || pack.wordmark.some(l => typeof l !== 'string' || !l)) {
    fail('wordmark must be a list of one or more lines');
  }
  if (pack.caption !== undefined && typeof pack.caption.en !== 'string') fail('caption.en is missing');
  if (pack.association !== undefined && typeof pack.association.name !== 'string') fail('association.name is missing');
  checkMode(pack, 'light');
  checkMode(pack, 'dark');
  return pack;
}

/** Stops the build when the association's legal text is asked for without a pack that names the association. */
function checkLegalText(legalText, pack) {
  if (legalText === 'association' && !(pack && pack.association && pack.association.name.trim())) {
    fail('EXPO_PUBLIC_LEGAL_TEXT=association needs a brand pack whose brand.json names the association (association.name); set WAREHOUSE_BRAND_PACK to it.');
  }
}

module.exports = { loadBrandPack, checkLegalText };
