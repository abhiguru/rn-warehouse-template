/**
 * The charging rule (WH-137, backend migration 164): reading it from the server, the least duration it charges, and the
 * sentence that names it. The server alone works out amounts; the app must read the rule exactly and never invent one.
 */
import { setLanguage } from '@/i18n';
import {
  DEFAULT_CHARGING_RULE,
  describeChargingRule,
  minimumAllowed,
  minimumInWords,
  minimumMonths,
  parseChargingRule,
  sameChargingRule,
  type ChargingRule,
} from '../chargingRule';
import { invoiceLabelOf, invoiceLabelsOf, invoiceFileName, invoicePrefixOf } from '@/utils/invoiceLabel';

afterEach(() => setLanguage('en'));

describe('parseChargingRule', () => {
  const rule = { step_days: 15, minimum_days: 30, days_counted: 'legacy', rounding: 'up' };

  it('reads the four fields, with numbers sent as text too', () => {
    expect(parseChargingRule(rule)).toEqual(DEFAULT_CHARGING_RULE);
    expect(parseChargingRule({ ...rule, step_days: '1', minimum_days: '0', days_counted: 'standard', rounding: 'none' })).toEqual({
      step_days: 1, minimum_days: 0, days_counted: 'standard', rounding: 'none',
    });
  });

  it.each([
    ['a step that is not offered', { step_days: 7 }],
    ['a minimum that is not offered', { minimum_days: 45 }],
    ['a days rule that is not offered', { days_counted: 'inclusive' }],
    ['a rounding that is not offered', { rounding: 'down' }],
    ['a missing field', { rounding: undefined }],
  ])('is no rule with %s', (_what, change) => {
    expect(parseChargingRule({ ...rule, ...change })).toBeNull();
  });

  it.each([null, undefined, 'x', 5, [], [rule]])('is no rule from %j', value => {
    expect(parseChargingRule(value)).toBeNull();
  });

  it('is today\'s rule by default: half-month steps, a month at least, from the day after receipt, up to the next rupee', () => {
    expect(DEFAULT_CHARGING_RULE).toEqual({ step_days: 15, minimum_days: 30, days_counted: 'legacy', rounding: 'up' });
  });
});

describe('comparing and limiting rules', () => {
  it('tells rules apart by every field', () => {
    expect(sameChargingRule(DEFAULT_CHARGING_RULE, { ...DEFAULT_CHARGING_RULE })).toBe(true);
    for (const change of [{ step_days: 30 }, { minimum_days: 60 }, { days_counted: 'standard' }, { rounding: 'nearest' }] as Array<Partial<ChargingRule>>) {
      expect(sameChargingRule(DEFAULT_CHARGING_RULE, { ...DEFAULT_CHARGING_RULE, ...change })).toBe(false);
    }
  });

  it('allows a minimum of one step or at least one step, never a minimum shorter than a step', () => {
    expect(minimumAllowed(0, 30)).toBe(true);
    expect(minimumAllowed(15, 15)).toBe(true);
    expect(minimumAllowed(30, 30)).toBe(true);
    expect(minimumAllowed(15, 30)).toBe(false);
    expect(minimumAllowed(30, 1)).toBe(true);
    expect(minimumAllowed(0, 1)).toBe(true);
  });
});

describe('minimumMonths', () => {
  it.each([
    [{ step_days: 15, minimum_days: 30 }, 1],
    [{ step_days: 15, minimum_days: 15 }, 0.5],
    [{ step_days: 15, minimum_days: 90 }, 3],
    [{ step_days: 15, minimum_days: 0 }, 0.5],
    [{ step_days: 30, minimum_days: 0 }, 1],
    [{ step_days: 1, minimum_days: 0 }, 1 / 30],
    [{ step_days: 1, minimum_days: 60 }, 2],
  ] as const)('%j is %s months', (rule, months) => {
    expect(minimumMonths(rule)).toBeCloseTo(months, 10);
  });
});

describe('the rule in words', () => {
  it('names the minimum in the facility\'s words', () => {
    expect(minimumInWords({ minimum_days: 0 })).toBe('one step');
    expect(minimumInWords({ minimum_days: 15 })).toBe('half a month');
    expect(minimumInWords({ minimum_days: 30 })).toBe('1 month');
    expect(minimumInWords({ minimum_days: 90 })).toBe('3 months');
  });

  it('says the default rule as one sentence', () => {
    expect(describeChargingRule(DEFAULT_CHARGING_RULE)).toBe(
      'Storage charged in half-month steps, minimum 1 month, from the day after receipt. Total rounded up to the next rupee.'
    );
  });

  it('says each choice of step, day count and rounding', () => {
    const text = describeChargingRule({ step_days: 1, minimum_days: 0, days_counted: 'standard', rounding: 'none' });
    expect(text).toMatch(/day/i);
    expect(text).toMatch(/one step/i);
    expect(text).toMatch(/including/i);
    expect(text).not.toBe(describeChargingRule(DEFAULT_CHARGING_RULE));
    expect(describeChargingRule({ ...DEFAULT_CHARGING_RULE, rounding: 'nearest' })).not.toBe(describeChargingRule(DEFAULT_CHARGING_RULE));
  });

  it('follows the language', () => {
    const english = describeChargingRule(DEFAULT_CHARGING_RULE);
    setLanguage('gu');
    const gujarati = describeChargingRule(DEFAULT_CHARGING_RULE);
    expect(gujarati).not.toBe(english);
    expect(gujarati).toMatch(/[઀-૿]/);
  });
});

// WH-139: the full invoice number is the prefix and the digits; the digits alone on a server before migration 175.
describe('the full invoice number (invoiceLabel)', () => {
  it('uses the label the server sent, else the digits', () => {
    expect(invoiceLabelOf('SRT/12', 12)).toBe('SRT/12');
    expect(invoiceLabelOf('  ', 12)).toBe('12');
    expect(invoiceLabelOf(undefined, '0055')).toBe('0055');
    expect(invoiceLabelOf(null, null)).toBe('');
    expect(invoiceLabelOf(7, 8)).toBe('8');
  });

  it('lists labels, else the digits of the matching numbers', () => {
    expect(invoiceLabelsOf(['A/1', 'A/2'], [1, 2])).toEqual(['A/1', 'A/2']);
    expect(invoiceLabelsOf(['A/1', ''], [1, 2])).toEqual(['A/1']);
    expect(invoiceLabelsOf(undefined, [1, '2'])).toEqual(['1', '2']);
    expect(invoiceLabelsOf([], null)).toEqual([]);
  });

  it('finds the prefix a label carries', () => {
    expect(invoicePrefixOf('SRT/12', 12)).toBe('SRT/');
    expect(invoicePrefixOf('12', 12)).toBe('');
    expect(invoicePrefixOf(undefined, 12)).toBe('');
    expect(invoicePrefixOf('SRT/12', null)).toBe('');
    expect(invoicePrefixOf('SRT/12', 99)).toBe('');
  });

  it('makes a file name of a label: a slash is no file name character', () => {
    expect(invoiceFileName('SRT/12')).toBe('SRT-12');
    expect(invoiceFileName('A B/C:1')).toBe('A-B-C-1');
    expect(invoiceFileName('I0000554')).toBe('I0000554');
  });
});
