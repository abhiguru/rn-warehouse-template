import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { RateCard, type RateCardProps } from '@/features/item-pricing/components/RateCard';
import { setLanguage } from '@/i18n';
import { row } from '@/tests/helpers/ratesFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const props = (over: Partial<RateCardProps>): RateCardProps => ({
  priceType: 'monthly',
  bands: [],
  upcoming: null,
  stopsAfter: null,
  overlap: false,
  day: '2026-10-14',
  ...over,
});
let tree: ReactTestRenderer;
const render = (p: RateCardProps) => { act(() => { tree = create(<RateCard {...p} />); }); };
const texts = () => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
afterEach(() => { act(() => tree.unmount()); setLanguage('en'); });

const one = row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 11, labour_rate: 3, effective_from: '2026-04-01' });

describe('RateCard', () => {
  it('a monthly rate: ₹11.00 per bag, per month, with labour and tax in words (P-20)', () => {
    render(props({ bands: [one] }));
    const s = texts();
    expect(s).toEqual(expect.arrayContaining(['₹11.00', 'per bag, per month', 'Weight each', '0–100 kg', 'Labour', '₹3.00 per bag, charged once at dispatch', 'Tax', '5% on rent and labour', 'In force', 'Lots received since 01/04/26']));
  });

  it('a one-time rate says per bag, once and has no Labour row (owner decision)', () => {
    render(props({ priceType: 'one_time', bands: [{ ...one, price_type: 'one_time', unit_price: 20 }] }));
    const s = texts();
    expect(s).toContain('per bag, once');
    expect(s).toContain('₹20.00');
    expect(s).not.toContain('Labour');
    expect(s.join(' ')).not.toMatch(/charged once at dispatch/);
  });

  it('shows the type as text: no segmented control, no editable field (P-32, P-41)', () => {
    render(props({ bands: [one] }));
    expect(tree.root.findAll(n => ['TextInput', 'SegmentedControl', 'RCTSinglelineTextInputView'].includes(String(n.type)))).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.editable !== undefined)).toHaveLength(0);
  });

  it('a rate with an end date reads as a range of received dates', () => {
    render(props({ bands: [{ ...one, effective_to: '2026-12-31' }] }));
    expect(texts()).toContain('Lots received 01/04/26 – 31/12/26');
  });

  it('has no action button: it only shows the rate, the later rate and the stop', () => {
    const stopped = { ...one, effective_to: '2026-12-31' };
    const next = { startsOn: '2027-01-01', rows: [{ ...one, unit_price: 12, effective_from: '2027-01-01', effective_to: null }] };
    render(props({ bands: [stopped], stopsAfter: '2026-12-31', upcoming: next }));
    expect(texts()).toEqual(expect.arrayContaining(['From 01/01/27: ₹12.00 per bag, per month', 'This rate stops after 31/12/26.']));
    expect(tree.root.findAll(n => ['rate-change', 'rate-correct', 'rate-stop', 'undo-stop', 'edit-upcoming', 'cancel-upcoming'].includes(n.props.testID))).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('Gujarati unit and digits (P-43): no મુદત', () => {
    setLanguage('gu');
    render(props({ bands: [one] }));
    const s = texts();
    expect(s).toContain('₹૧૧.૦૦');
    expect(s).toContain('નંગ દીઠ, માસિક');
    expect(s).toContain('૦૧/૦૪/૨૬ થી આવેલા જથ્થા માટે');
    expect(s.join(' ')).not.toContain('મુદત');
  });
});
