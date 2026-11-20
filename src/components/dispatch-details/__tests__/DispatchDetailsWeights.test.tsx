/**
 * Weights on the page of a saved dispatch (phone review 2026-10-14, UX-06).
 *
 * The Items and GRNs tables show the weight a lot stores, the weight of one bag,
 * under the item name. "50 kg" beside "4 bags" read like the weight of the line;
 * it reads "50 kg each". A lot without a weight shows no weight (it used to read
 * "0 kg"). On the Items table the mark sits under "GRN/received" instead.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { DispatchItemsTab } from '@/components/dispatch-details/DispatchItemsTab';
import { DispatchGRNsTab } from '@/components/dispatch-details/DispatchGRNsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: 1 }),
}));

type Weight = number | null | undefined;
const item = (weight: Weight, over: { original_quantity?: number; package_mark?: string } = { original_quantity: 10, package_mark: 'PM' }) => ({
  id: 'line-1',
  item_name: 'Potatoes',
  dispatch_quantity: 4,
  grn_no: '311',
  grn_date: '2026-10-09',
  grn_id: 'g1',
  // The backend sends null for a lot without a weight.
  weight,
  ...over,
});

/** Every text on the screen (non-breaking spaces read as spaces, as a person sees them). */
const texts = (): string[] =>
  screen
    .queryAllByText(/[\s\S]*/, { includeHiddenElements: true })
    .map((node) => [node.props.children].flat().join('').replace(/\u00A0/g, ' '));
type JsonNode = { type: string; children: Array<JsonNode | string> | null };
/** Children of host Views that are bare text or numbers: what React Native throws on. */
const looseText = (): string[] => {
  const found: string[] = [];
  const walk = (node: JsonNode | string | null) => {
    if (node === null || typeof node === 'string') return;
    for (const child of node.children ?? []) {
      if (typeof child === 'string' && node.type === 'View') found.push(child);
      walk(child);
    }
  };
  const json = screen.toJSON() as JsonNode | JsonNode[] | null;
  for (const root of Array.isArray(json) ? json : [json]) walk(root);
  return found;
};

afterEach(() => {
  setLanguage('en');
});

describe.each([
  ['Items table', (weight: Weight, over?: Parameters<typeof item>[1]) => render(<DispatchItemsTab items={[item(weight, over)]} />)],
  // One source GRN starts expanded.
  ['GRNs table', (weight: Weight, over?: Parameters<typeof item>[1]) => render(<DispatchGRNsTab items={[item(weight, over)]} />)],
])('%s', (_name, show) => {
  it('writes the weight of one bag as "50 kg each" under the item', async () => {
    await show(50);

    expect(texts()).toContain('50 kg each');
    expect(texts()).not.toContain('50 kg');
  });

  it('writes it as દરેક ૫૦ કિલો in Gujarati', async () => {
    setLanguage('gu');
    await show(50);

    expect(texts().some((text) => text.includes('દરેક ૫૦ કિલો'))).toBe(true);
  });

  it.each([[0], [null], [undefined]])('shows no weight for a lot without a weight (%s); the mark stays', async (weight) => {
    await show(weight);

    expect(texts().some((text) => /kg/i.test(text))).toBe(false);
    expect(texts()).toContain('PM');
    expect(looseText()).toEqual([]);
  });

  it.each([[0], [null]])('draws no empty line under the item when a weight of %s was the only detail', async (weight) => {
    await show(weight, { package_mark: '' });

    expect(texts().some((text) => /kg/i.test(text))).toBe(false);
    expect(texts()).not.toContain('');
    expect(looseText()).toEqual([]);
  });
});

it('shows the bags received on the lot beside the GRN number, and the mark under them, on the Items table', async () => {
  await render(<DispatchItemsTab items={[item(50)]} />);
  expect(texts()).toEqual(expect.arrayContaining(['311/10', 'PM']));
});
