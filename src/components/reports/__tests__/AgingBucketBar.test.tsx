import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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

type Host = NonNullable<typeof screen.root>;

async function draw(element: React.ReactElement, brand: Brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}

afterEach(() => setLanguage('en'));

function flat(node: Host) {
  return (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
}

/** Every host element drawn, hidden or not (a fill width or a colour has no text or role to query by). */
function hosts(): Host[] {
  const found: Host[] = [];
  const visit = (node: Host | string) => {
    if (typeof node === 'string') return;
    found.push(node);
    node.children.forEach(visit);
  };
  visit(screen.root!);
  return found;
}

/** Every text, including the parts that are hidden from screen readers under the summary. */
function texts(): string[] {
  return screen.queryAllByText(/[\s\S]*/, { hidden: true }).map(n => n.children.join(''));
}

/** The bar fills, in bucket order: the views whose width is a percentage. */
function fillWidths(): string[] {
  return hosts()
    .filter(n => n.type === 'View' && typeof flat(n).width === 'string' && String(flat(n).width).endsWith('%'))
    .map(n => String(flat(n).width));
}

describe.each(THEMES)('aging bucket bar in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws each bucket in its status colour on a token track', async () => {
    await draw(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />, brand, mode);
    const backgrounds = hosts().map(n => flat(n).backgroundColor);
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
    expect(texts()).toEqual(expect.arrayContaining(['0–120 days', '121–240 days', '241–364 days', 'Over 364 days']));
  });
});

describe('aging bucket bar', () => {
  it('scales each bar to its share of the total, not of the largest bucket', async () => {
    await draw(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />);
    expect(fillWidths()).toEqual(['10%', '20%', '30%', '40%']);
    expect(texts()).toEqual(expect.arrayContaining(['10.0%', '20.0%', '30.0%', '40.0%']));
  });

  it('gives a single bucket with stock the whole track', async () => {
    await draw(<AgingBucketBar buckets={buckets([0, 0, 0, 50])} />);
    expect(fillWidths()).toEqual(['0%', '0%', '0%', '100%']);
    expect(texts()).toEqual(expect.arrayContaining(['0.0%', '100.0%', '50 units', '0 units']));
  });

  it('shows the unit with every quantity, singular for one', async () => {
    await draw(<AgingBucketBar buckets={buckets([1, 1200, 0, 0])} />);
    expect(texts()).toEqual(expect.arrayContaining(['1 unit', '1,200 units']));
    await screen.unmount();
    await draw(<AgingBucketBar buckets={buckets([3, 0, 0, 0])} unit="bag" />);
    expect(texts()).toContain('3 bags');
  });

  it('says there is no stock when every bucket is empty, without NaN', async () => {
    await draw(<AgingBucketBar buckets={buckets([0, 0, 0, 0])} />);
    const all = texts().join(' ');
    expect(all).toContain('No stock yet');
    expect(all).not.toMatch(/NaN|Infinity/);
    expect(fillWidths()).toEqual([]);
    // The one element a screen reader reaches says it; the empty-state text under it is hidden.
    expect(screen.getByLabelText('No stock yet')).toBeOnTheScreen();
    expect(screen.queryByText('No stock yet')).not.toBeOnTheScreen();
  });

  it('treats missing, negative and non-numeric quantities as 0', async () => {
    await draw(<AgingBucketBar buckets={buckets([Number.NaN, -5, 25, 75])} />);
    expect(fillWidths()).toEqual(['0%', '0%', '25%', '75%']);
    expect(texts().join(' ')).not.toMatch(/NaN|-/);
  });

  it('reads the whole group as one summary with a sentence per bucket', async () => {
    await draw(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} />);
    // The tags inside the group are accessible too; the summary is the outermost label.
    const summary =
      '0–120 days: 10.0% of all stock, 10 units. ' +
      '121–240 days: 20.0% of all stock, 20 units. ' +
      '241–364 days: 30.0% of all stock, 30 units. ' +
      'Over 364 days: 40.0% of all stock, 40 units.';
    expect(screen.getByLabelText(summary)).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/./)).toHaveLength(1);
    // The parts under the summary are hidden from screen readers.
    expect(screen.queryByText('0–120 days')).not.toBeOnTheScreen();
    expect(screen.getByText('0–120 days', { hidden: true })).toBeOnTheScreen();
    expect(screen.queryByText('10.0%')).not.toBeOnTheScreen();
    const hidden = hosts().filter(n => n.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden[0].props.accessibilityElementsHidden).toBe(true);
  });

  it('has nothing pressable, and no figure is held to one line', async () => {
    await draw(<AgingBucketBar buckets={buckets([10, 20, 30, 40])} onPress={jest.fn()} title="Stock age" />);
    expect(screen.queryAllByRole('button', { hidden: true })).toHaveLength(0);
    expect(hosts().filter(n => typeof n.props.onPress === 'function')).toHaveLength(0);
    const figures = screen.getAllByText(/(%|units?)$/, { hidden: true });
    expect(figures).toHaveLength(8);
    figures.forEach(f => {
      expect(f.props.numberOfLines).toBeUndefined();
      expect(f).toHaveStyle({ fontVariant: ['tabular-nums'], textAlign: 'right' });
    });
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header', { name: 'Stock age' })).toBeOnTheScreen();
  });

  it('writes labels and digits in Gujarati', async () => {
    setLanguage('gu');
    await draw(<AgingBucketBar buckets={buckets([0, 1200, 0, 300])} />);
    expect(texts()).toEqual(
      expect.arrayContaining(['૦–૧૨૦ દિવસ', '૩૬૪ દિવસથી વધુ', '૮૦.૦%', '૨૦.૦%', '૧,૨૦૦ નંગ', '૩૦૦ નંગ'])
    );
    expect(texts().join(' ')).not.toMatch(/[0-9]/);
    expect(screen.getByLabelText(/૩૬૪ દિવસથી વધુ: કુલ સ્ટોકના ૨૦\.૦%, ૩૦૦ નંગ\./)).toBeOnTheScreen();
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
