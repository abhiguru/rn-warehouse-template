/**
 * "Recent dispatches" on the customer order page is a normal page section
 * (style guide §13.6): SectionHeader with a plain count badge and a Show/Hide
 * action, then dispatch cells. No brand-filled banner.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import RecentDispatchesSection from '../RecentDispatchesSection';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../list-items/MemoizedDispatchItem', () => ({ MemoizedDispatchItem: 'MemoizedDispatchItem' }));
jest.mock('@/services/dispatch-service', () => ({
  getCustomerDispatchList: jest.fn(),
  getDispatchListWithItems: jest.fn(() =>
    Promise.resolve({
      success: true,
      data: { dispatches: [{ dispatch_id: 'd1' }, { dispatch_id: 'd2' }] },
    })
  ),
}));

const MODES: Mode[] = ['light', 'dark'];

type Json = ReturnType<typeof screen.toJSON>;
type JsonNode = Exclude<NonNullable<Json>, unknown[]>;

/** Every element of the rendered tree (the dispatch cells are a string-typed stand-in, so only the tree shows them). */
function elements(json: Json): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as JsonNode);
    ((node as JsonNode).children ?? []).forEach(walk);
  };
  walk(json);
  return out;
}

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
  it('renders a section header with a plain count and expands to the dispatch cells', async () => {
    const t = getTokens(brand, mode);
    mockState = { theme: { preference: mode, brand }, auth: { userProfile: { role: 'admin' } } };
    const user = userEvent.setup({ delay: 0 });
    await render(<RecentDispatchesSection customerId="c1" />);

    expect(screen.getByText('RECENT DISPATCHES')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('Show')).toBeOnTheScreen();
    const backgrounds = elements(screen.toJSON())
      .filter(n => n.type === 'View')
      .map(v => StyleSheet.flatten(v.props.style)?.backgroundColor);
    // No brand-filled banner: the only brand fill is the plain count badge (guide §13.5).
    expect(backgrounds.filter(b => b === t.brand.fill)).toHaveLength(1);
    expect(elements(screen.toJSON()).filter(n => n.type === 'MemoizedDispatchItem')).toHaveLength(0);

    await user.press(screen.getByRole('button', { name: 'Show recent dispatches, 2 dispatches' }));
    expect(elements(screen.toJSON()).filter(n => n.type === 'MemoizedDispatchItem')).toHaveLength(2);
    expect(screen.getByText('Hide')).toBeOnTheScreen();
  });
});
