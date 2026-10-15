import { setLanguage } from '@/i18n';
import type { ItemStoragePrice, StandardTier } from '@/types/item-pricing.types';
import { appendEmptyBand, fromOf, setBandField, setUpTo } from '../editModel';
import {
  fieldForRefusal,
  standardContext,
  standardDraft,
  tierSummary,
  tierTags,
  tiersOf,
  validateStandard,
} from '../standardRate';

const TODAY = '2026-10-15';
const tier = (min: number, max: number, rent: number, labour = 1, tax = 5): StandardTier => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: labour, tax_percent: tax });
const row = (min: number, max: number, rent: number, labour = 1, tax = 5): ItemStoragePrice => ({
  id: `r-${min}`, item_id: 'i', item_name: 'Item', customer_id: null, customer_name: null, price_type: 'monthly',
  unit_price: rent, weight_min: min, weight_max: max, labour_rate: labour, tax_percent: tax,
  effective_from: '2026-01-01', effective_to: null, created_at: '', created_by: '',
});
const ctx = standardContext(TODAY);

afterEach(() => setLanguage('en'));

describe('the draft', () => {
  it('starts with the four tiers 0-10, 11-20, 21-30, 31-50 and blank figures when nothing was saved', () => {
    const d = standardDraft([], TODAY);
    expect(d.bands.map((b, i) => [fromOf(d, i), b.upTo, b.rent, b.labour, b.tax])).toEqual([
      [0, '10', '', '', ''],
      [11, '20', '', '', ''],
      [21, '30', '', '', ''],
      [31, '50', '', '', ''],
    ]);
    expect(d.priceType).toBe('monthly');
  });

  it('shows the tiers saved, with two decimals', () => {
    const d = standardDraft([tier(0, 10, 3), tier(11, 25, 4.5, 1.25, 12.5)], TODAY);
    expect(d.bands.map(b => [b.upTo, b.rent, b.labour, b.tax])).toEqual([['10', '3.00', '1.00', '5'], ['25', '4.50', '1.25', '12.5']]);
  });

  it('sends the tiers as the numbers typed', () => {
    let d = standardDraft([], TODAY);
    d = { ...d, bands: d.bands.map((b, i) => ({ ...b, rent: String(i + 3), labour: '1', tax: '5' })) };
    expect(tiersOf(d, ctx)).toEqual([tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)]);
  });

  it('adds a tier after the last, with the labour and tax of the first, and takes one away', () => {
    let d = standardDraft([tier(0, 10, 3, 1, 5), tier(11, 20, 4, 2, 12)], TODAY);
    d = appendEmptyBand(d);
    expect(d.bands[2]).toEqual({ upTo: '', rent: '', labour: '1.00', tax: '5' });
    expect(fromOf(d, 2)).toBe(21);
  });
});

describe('the checks', () => {
  const filled = () => {
    const d = standardDraft([], TODAY);
    return { ...d, bands: d.bands.map(b => ({ ...b, rent: '3', labour: '1', tax: '5' })) };
  };

  it('accepts zero rent, labour and tax', () => {
    const d = { ...filled(), bands: filled().bands.map(b => ({ ...b, rent: '0', labour: '0', tax: '0' })) };
    expect(validateStandard(d, ctx)).toEqual({ ok: true, errors: {} });
  });

  it('asks for the figures of every tier, and never complains about a start day', () => {
    const { ok, errors } = validateStandard(standardDraft([], TODAY), ctx);
    expect(ok).toBe(false);
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['band.0.rent', 'band.0.labour', 'band.0.tax', 'band.3.rent']));
    expect(errors.startsOn).toBeUndefined();
  });

  it('refuses an Up to below its From, a fraction, a third decimal and a tax over 100', () => {
    let d = filled();
    d = setUpTo(d, 1, '10');
    expect(validateStandard(d, ctx).errors['band.1.upTo']).toBeDefined();
    d = setUpTo(filled(), 0, '10.5');
    expect(validateStandard(d, ctx).errors['band.0.upTo']).toBe('Enter whole kilograms, for example 40.');
    d = setBandField(filled(), 0, 'rent', '3.005');
    expect(validateStandard(d, ctx).errors['band.0.rent']).toBeDefined();
    d = setBandField(filled(), 2, 'tax', '100.5');
    expect(validateStandard(d, ctx).errors['band.2.tax']).toBe('Enter a tax rate from 0 to 100.');
    d = setBandField(filled(), 2, 'tax', '100');
    expect(validateStandard(d, ctx).errors['band.2.tax']).toBeUndefined();
  });
});

describe('where a refusal shows', () => {
  it('maps the server\'s tier and field to the keys of the tier cards', () => {
    expect(fieldForRefusal({ success: false, errorCode: 'INVALID_AMOUNT', tierIndex: 1, field: 'labour_rate' })).toBe('band.1.labour');
    expect(fieldForRefusal({ success: false, errorCode: 'INVALID_AMOUNT', tierIndex: 0, field: 'tax_percent' })).toBe('band.0.tax');
    expect(fieldForRefusal({ success: false, errorCode: 'INVALID_AMOUNT', tierIndex: 3 })).toBe('band.3.rent');
    expect(fieldForRefusal({ success: false, errorCode: 'INVALID_BAND', tierIndex: 2, field: undefined })).toBe('band.2.upTo');
    expect(fieldForRefusal({ success: false, errorCode: 'BANDS_OVERLAP', tierIndex: 1 })).toBe('band.1.upTo');
    expect(fieldForRefusal({ success: false, errorCode: 'BANDS_GAP', tierIndex: 1 })).toBe('band.1.upTo');
  });
  it('names no field when the server named no tier', () => {
    expect(fieldForRefusal({ success: false, errorCode: 'INVALID_BANDS' })).toBeNull();
    expect(fieldForRefusal({ success: false, errorCode: 'STANDARD_RATE_MANAGER_ONLY' })).toBeNull();
  });
});

describe('tier tags', () => {
  const standard = [tier(0, 10, 3), tier(11, 20, 4)];

  it('tags a band Standard when weights, rent, labour and tax all equal a tier', () => {
    expect(tierTags([row(0, 10, 3), row(11, 20, 4)], standard)).toEqual(['standard', 'standard']);
  });
  it('tags a band This item when a figure differs (rent, labour or tax)', () => {
    expect(tierTags([row(0, 10, 3.5), row(11, 20, 4)], standard)).toEqual(['item', 'standard']);
    expect(tierTags([row(0, 10, 3, 2), row(11, 20, 4, 1, 12)], standard)).toEqual(['item', 'item']);
  });
  it('tags a band This item when the weights differ although the figures match a tier', () => {
    expect(tierTags([row(0, 10, 3), row(11, 25, 4)], standard)).toEqual(['standard', 'item']);
    expect(tierTags([row(0, 12, 3)], standard)).toEqual(['item']);
  });
  it('tags a band added beyond the standard tiers This item', () => {
    expect(tierTags([row(0, 10, 3), row(11, 20, 4), row(21, 80, 6)], standard)).toEqual(['standard', 'standard', 'item']);
  });
  it('gives no tags when the standard rate is empty, not loaded or failed', () => {
    expect(tierTags([row(0, 10, 3)], [])).toBeNull();
    expect(tierTags([row(0, 10, 3)], null)).toBeNull();
    expect(tierTags([row(0, 10, 3)], undefined)).toBeNull();
  });
  it('compares numbers, not text (the server may send 3 or "3.00")', () => {
    expect(tierTags([row(0, 10, Number('3.00'))], [tier(0, 10, 3)])).toEqual(['standard']);
  });
});

describe('the summary on Add item', () => {
  it('lists the rents by weight', () => {
    expect(tierSummary([tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)])).toBe('0–10 kg ₹3.00 · 11–20 kg ₹4.00 · 21–30 kg ₹5.00 · 31–50 kg ₹6.00');
  });
  it('is in Gujarati digits and words in Gujarati', () => {
    setLanguage('gu');
    expect(tierSummary([tier(0, 10, 3), tier(11, 20, 4)])).toBe('૦–૧૦ કિલો ₹૩.૦૦ · ૧૧–૨૦ કિલો ₹૪.૦૦');
  });
});
