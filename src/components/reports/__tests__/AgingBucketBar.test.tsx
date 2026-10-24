import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import {
  AgingBucketBar,
  agingBucketIdFromKey,
  agingBucketsFrom,
  type AgingBucket,
} from '../AgingBucketBar';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

const buckets = (q: [number, number, number, number]): AgingBucket[] => [
  { id: '0-120', quantity: q[0] },
  { id: '121-240', quantity: q[1] },
  { id: '241-364', quantity: q[2] },
  { id: 'over-364', quantity: q[3] },
];

let tree: ReactTestRenderer | null = null;

function render(element: React.ReactElement, brand: Brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  act(() => {
    tree = create(element);
  });
  return tree!;
}

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  setLanguage('en');
});

function flat(node: ReactTestInstance) {
  return (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
}

function texts(r: ReactTestRenderer): string[] {
  return r.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
}

/** The bar fills, in bucket order: the views whose width is a percentage. */
function fillWidths(r: ReactTestRenderer): string[] {
  return r.root
    .findAll(n => (n.type as unknown) === 'View' && typeof flat(n).width === 'string' && String(flat(n).width).endsWith('%'))
    .map(n => String(flat(n).width));
}

function summary(r: ReactTestRenderer): string {
  const groups = r.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessible === true && !!n.props.accessibilityLabel);
  // The StatusTags are accessible too; the group is the outermost one.
  return groups[0].props.accessibilityLabel;
}

describe.each(THEMES)('aging bucket bar in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws each bucket in its status colour on a token track', () => {
    const r = render(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />, brand, mode);
    const backgrounds = r.root.findAll(n => typeof n.type === 'string').map(n => flat(n).backgroundColor);
    expect(backgrounds).toEqual(
      expect.arrayContaining([
        t.brand.subtleStrong,
        t.status.positive.element,
        t.status.informative.element,
        t.status.critical.element,
        t.status.negative.element,
        t.status.positive.background,
        t.status.negative.background,
      ])
    );
    expect(texts(r)).toEqual(expect.arrayContaining(['0–120 days', '121–240 days', '241–364 days', 'Over 364 days']));
  });
});

describe('aging bucket bar', () => {
  it('scales each bar to its share of the total, not of the largest bucket', () => {
    const r = render(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />);
    expect(fillWidths(r)).toEqual(['10%', '20%', '30%', '40%']);
    expect(texts(r)).toEqual(expect.arrayContaining(['10.0%', '20.0%', '30.0%', '40.0%']));
  });

  it('gives a single bucket with stock the whole track', () => {
    const r = render(<AgingBucketBar buckets={buckets([0, 0, 0, 50])} />);
    expect(fillWidths(r)).toEqual(['0%', '0%', '0%', '100%']);
    expect(texts(r)).toEqual(expect.arrayContaining(['0.0%', '100.0%', '50 units', '0 units']));
  });

  it('shows the unit with every quantity, singular for one', () => {
    const r = render(<AgingBucketBar buckets={buckets([1, 1200, 0, 0])} />);
    expect(texts(r)).toEqual(expect.arrayContaining(['1 unit', '1,200 units']));
    act(() => r.unmount());
    tree = render(<AgingBucketBar buckets={buckets([3, 0, 0, 0])} unit="bag" />);
    expect(texts(tree)).toContain('3 bags');
  });

  it('says there is no stock when every bucket is empty, without NaN', () => {
    const r = render(<AgingBucketBar buckets={buckets([0, 0, 0, 0])} />);
    const all = texts(r).join(' ');
    expect(all).toContain('No stock yet');
    expect(all).not.toMatch(/NaN|Infinity/);
    expect(fillWidths(r)).toEqual([]);
    expect(summary(r)).toBe('No stock yet');
  });

  it('treats missing, negative and non-numeric quantities as 0', () => {
    const r = render(<AgingBucketBar buckets={buckets([Number.NaN, -5, 25, 75])} />);
    expect(fillWidths(r)).toEqual(['0%', '0%', '25%', '75%']);
    expect(texts(r).join(' ')).not.toMatch(/NaN|-/);
  });

  it('reads the whole group as one summary with a sentence per bucket', () => {
    const r = render(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />);
    expect(summary(r)).toBe(
      '0–120 days: 10.0% of all stock, 10 units. ' +
        '121–240 days: 20.0% of all stock, 20 units. ' +
        '241–364 days: 30.0% of all stock, 30 units. ' +
        'Over 364 days: 40.0% of all stock, 40 units.'
    );
    // The parts under the summary are hidden from screen readers.
    const hidden = r.root.findAll(n => n.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden[0].props.accessibilityElementsHidden).toBe(true);
  });

  it('has nothing pressable, and no figure is held to one line', () => {
    const r = render(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} onPress={jest.fn()} title="Stock age" />);
    expect(r.root.findAll(n => typeof n.props.onPress === 'function' && typeof n.type === 'string')).toHaveLength(0);
    const figures = r.root.findAll(
      n => (n.type as unknown) === 'Text' && /(%|units?)$/.test([].concat(n.props.children).join(''))
    );
    expect(figures.length).toBe(8);
    figures.forEach(f => {
      expect(f.props.numberOfLines).toBeUndefined();
      expect(flat(f).fontVariant).toEqual(['tabular-nums']);
      expect(flat(f).textAlign).toBe('right');
    });
    const header = r.root.findAll(n => (n.type as unknown) === 'Text' && n.props.accessibilityRole === 'header');
    expect(header.map(h => h.props.children)).toEqual(['Stock age']);
  });

  it('writes labels and digits in Gujarati', () => {
    setLanguage('gu');
    const r = render(<AgingBucketBar buckets={buckets([0, 1200, 0, 300])} />);
    expect(texts(r)).toEqual(
      expect.arrayContaining(['૦–૧૨૦ દિવસ', '૩૬૪ દિવસથી વધુ', '૮૦.૦%', '૨૦.૦%', '૧,૨૦૦ નંગ', '૩૦૦ નંગ'])
    );
    expect(texts(r).join(' ')).not.toMatch(/[0-9]/);
    expect(summary(r)).toContain('૩૬૪ દિવસથી વધુ: કુલ સ્ટોકના ૨૦.૦%, ૩૦૦ નંગ.');
  });
});

describe('agingBucketsFrom', () => {
  it('maps the backend keys to the four buckets in order and fills gaps with 0', () => {
    expect(
      agingBucketsFrom({
        '364+': { total_quantity: 7 },
        '0-120': { total_quantity: 3 },
        '90+': { total_quantity: 99 },
      })
    ).toEqual(buckets([3, 0, 0, 7]));
    expect(agingBucketsFrom(undefined)).toEqual(buckets([0, 0, 0, 0]));
    expect(agingBucketIdFromKey('364+')).toBe('over-364');
    expect(agingBucketIdFromKey('365+')).toBeUndefined();
  });
});
