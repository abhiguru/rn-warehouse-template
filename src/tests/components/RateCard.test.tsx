import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
const draw = (p: RateCardProps) => render(<RateCard {...p} />);
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
const has = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const lacks = (text: string | RegExp) => expect(screen.queryByText(text, hidden)).not.toBeOnTheScreen();
afterEach(() => { setLanguage('en'); });

const one = row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 11, labour_rate: 3, effective_from: '2026-04-01' });

describe('RateCard', () => {
  it('a monthly rate: ₹11.00 per bag, per month, with labour and tax in words (P-20)', async () => {
    await draw(props({ bands: [one] }));
    for (const text of ['₹11.00', 'per bag, per month', 'Weight each', '0–100 kg', 'Labour', '₹3.00 per bag, charged once at dispatch', 'Tax', '5% on rent and labour', 'In force', 'Lots received since 01/04/26']) has(text);
  });

  it('a one-time rate says per bag, once and has no Labour row (owner decision)', async () => {
    await draw(props({ priceType: 'one_time', bands: [{ ...one, price_type: 'one_time', unit_price: 20 }] }));
    has('per bag, once');
    has('₹20.00');
    lacks('Labour');
    lacks(/charged once at dispatch/);
  });

  it('shows the type as text: no segmented control, no editable field (P-32, P-41)', async () => {
    await draw(props({ bands: [one] }));
    // Fields and a segmented control have no role or text to ask for here: they are looked for by their host type and props.
    const hosts = screen.container.queryAll(() => true);
    expect(hosts.filter(n => ['TextInput', 'SegmentedControl', 'RCTSinglelineTextInputView'].includes(String(n.type)))).toHaveLength(0);
    expect(hosts.filter(n => n.props.editable !== undefined)).toHaveLength(0);
  });

  it('a rate with an end date reads as a range of received dates', async () => {
    await draw(props({ bands: [{ ...one, effective_to: '2026-12-31' }] }));
    has('Lots received 01/04/26 – 31/12/26');
  });

  it('has no action button: it only shows the rate, the later rate and the stop', async () => {
    const stopped = { ...one, effective_to: '2026-12-31' };
    const next = { startsOn: '2027-01-01', rows: [{ ...one, unit_price: 12, effective_from: '2027-01-01', effective_to: null }] };
    await draw(props({ bands: [stopped], stopsAfter: '2026-12-31', upcoming: next }));
    has('From 01/01/27: ₹12.00 per bag, per month');
    has('This rate stops after 31/12/26.');
    for (const id of ['rate-change', 'rate-correct', 'rate-stop', 'undo-stop', 'edit-upcoming', 'cancel-upcoming']) {
      expect(screen.queryByTestId(id, hidden)).not.toBeOnTheScreen();
    }
    expect(screen.queryAllByRole('button', hidden)).toHaveLength(0);
  });

  it('Gujarati unit and digits (P-43): no મુદત', async () => {
    setLanguage('gu');
    await draw(props({ bands: [one] }));
    has('₹૧૧.૦૦');
    has('નંગ દીઠ, માસિક');
    has('૦૧/૦૪/૨૬ થી આવેલા જથ્થા માટે');
    lacks(/મુદત/);
  });
});
