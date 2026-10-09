import { AA, BRANDS, contrastRatio, getTokens, type Mode } from '..';

const MODES: Mode[] = ['light', 'dark'];
const STATUS = ['negative', 'critical', 'positive', 'informative', 'neutral'] as const;

// Every foreground/background pair a component may draw, with the WCAG AA
// threshold that applies. Text needs 4.5:1; icons, borders, indicators and
// large text need 3:1 (WCAG 1.4.3 / 1.4.11, which SAP Horizon meets).
function pairs(brand: (typeof BRANDS)[number], mode: Mode) {
  const t = getTokens(brand, mode);
  const list: Array<[string, string, string, number]> = [];
  const text = (name: string, fg: string, bg: string) => list.push([name, fg, bg, AA.text]);
  const ui = (name: string, fg: string, bg: string) => list.push([name, fg, bg, AA.large]);
  for (const [bgName, bg] of [['background', t.background.base], ['card', t.surface.card], ['sheet', t.surface.sheet], ['pressed', t.surface.cardPressed]] as const) {
    text(`text.primary on ${bgName}`, t.text.primary, bg);
    text(`text.secondary on ${bgName}`, t.text.secondary, bg);
    text(`brand.tint on ${bgName}`, t.brand.tint, bg);
    text(`brand.secondaryText on ${bgName}`, t.brand.secondaryText, bg);
    ui(`icon.secondary on ${bgName}`, t.icon.secondary, bg);
    for (const s of STATUS) {
      text(`status.${s}.text on ${bgName}`, t.status[s].text, bg);
      ui(`status.${s}.element on ${bgName}`, t.status[s].element, bg);
    }
  }
  text('brand.onFill on brand.fill', t.brand.onFill, t.brand.fill);
  text('brand.onFill on brand.fillPressed', t.brand.onFill, t.brand.fillPressed);
  const markBg = t.brandMark.panel === 'transparent' ? t.background.base : t.brandMark.panel;
  ui('brandMark.wordmark on its panel', t.brandMark.wordmark, markBg);
  text('brandMark.caption on its panel', t.brandMark.caption, markBg);
  text('text.inverse on surface.inverse', t.text.inverse, t.surface.inverse);
  ui('control.trackOff on surface.card', t.control.trackOff, t.surface.card);
  text('destructive.onFill on destructive.fill', t.destructive.onFill, t.destructive.fill);
  text('destructive.onFill on destructive.fillPressed', t.destructive.onFill, t.destructive.fillPressed);
  text('brand.tint on brand.subtle', t.brand.tint, t.brand.subtle);
  text('text.primary on brand.subtle', t.text.primary, t.brand.subtle);
  text('text.primary on selected', t.text.primary, t.surface.selected);
  text('text.primary on field', t.text.primary, t.surface.field);
  text('text.placeholder on field', t.text.placeholder, t.surface.field);
  text('text.primary on fieldReadOnly', t.text.primary, t.surface.fieldReadOnly);
  text('text.inverse on text.primary', t.text.inverse, t.text.primary);
  ui('border.field on field', t.border.field, t.surface.field);
  ui('border.fieldFocus on field', t.border.fieldFocus, t.surface.field);
  ui('interaction.focus on background', t.interaction.focus, t.background.base);
  for (const s of STATUS) text(`status.${s}.text on its background`, t.status[s].text, t.status[s].background);
  return list;
}

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
  it.each(pairs(brand, mode))('%s', (_name, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

it('keeps status meaning identical across brands', () => {
  for (const mode of MODES) {
    expect(getTokens('orange', mode).status).toEqual(getTokens('gcsa', mode).status);
  }
});
