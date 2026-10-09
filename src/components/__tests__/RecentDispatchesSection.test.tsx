/**
 * "Recent dispatches" on the customer order page is a normal page section
 * (style guide §13.6): SectionHeader with a plain count badge and a Show/Hide
 * action, then dispatch cells. No brand-filled banner.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import RecentDispatchesSection from '../RecentDispatchesSection';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

function texts(tree: ReactTestRenderer) {
  return tree.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => ([] as unknown[]).concat(n.props.children).join(''));
}

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
  it('renders a section header with a plain count and expands to the dispatch cells', async () => {
    const t = getTokens(brand, mode);
    mockState = { theme: { preference: mode, brand }, auth: { userProfile: { role: 'admin' } } };
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<RecentDispatchesSection customerId="c1" />);
    });

    expect(texts(tree)).toEqual(expect.arrayContaining(['RECENT DISPATCHES', '2', 'Show']));
    const backgrounds = tree.root
      .findAll(n => (n.type as unknown) === 'View')
      .map(v => StyleSheet.flatten(v.props.style)?.backgroundColor);
    expect(backgrounds).not.toContain(t.brand.fill);
    expect(backgrounds).toContain(t.status.neutral.background);
    expect(tree.root.findAll(n => (n.type as unknown) === 'MemoizedDispatchItem')).toHaveLength(0);

    const toggle = tree.root.find(
      n => n.props.accessibilityLabel === 'Show recent dispatches, 2 dispatches' && typeof n.props.onPress === 'function'
    );
    act(() => toggle.props.onPress());
    expect(tree.root.findAll(n => (n.type as unknown) === 'MemoizedDispatchItem')).toHaveLength(2);
    expect(texts(tree)).toContain('Hide');
    act(() => tree.unmount());
  });
});
