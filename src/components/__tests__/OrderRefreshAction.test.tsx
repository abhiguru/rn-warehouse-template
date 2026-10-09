import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OrderRefreshAction } from '../OrderRefreshAction';
import { getTokens, type Brand, type Mode } from '@/theme/tokens';

jest.mock('react-native-paper', () => ({ IconButton: 'IconButton' }));

let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (state: unknown) => unknown) => sel({ theme: mockTheme }),
}));

function renderAction(props: React.ComponentProps<typeof OrderRefreshAction>) {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<OrderRefreshAction {...props} />); });
  return renderer.root.findByType('IconButton' as never);
}

it('exposes an accessible, gesture-independent refresh action', () => {
  const refresh = jest.fn();
  const action = renderAction({ onRefresh: refresh, refreshing: false, label: 'Refresh orders' });
  expect(action.props.accessibilityLabel).toBe('Refresh orders');
  expect(action.props.accessibilityRole).toBe('button');
  expect(action.props.disabled).toBe(false);
  action.props.onPress();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('announces progress and ignores repeat presses while refreshing', () => {
  const refresh = jest.fn();
  const action = renderAction({ onRefresh: refresh, refreshing: true, label: 'Refresh order queue' });
  expect(action.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(action.props.loading).toBe(true);
  action.props.onPress();
  expect(refresh).not.toHaveBeenCalled();
});

it.each([
  ['orange', 'light'],
  ['orange', 'dark'],
  ['gcsa', 'light'],
  ['gcsa', 'dark'],
] as const)('tints the icon with brand.tint in %s %s, ignoring a legacy colour prop', (brand, mode) => {
  mockTheme = { preference: mode, brand };
  const legacyColour = getTokens(brand, mode).brand.fill;
  const action = renderAction({ onRefresh: jest.fn(), refreshing: false, color: legacyColour, label: 'Refresh orders' });
  expect(action.props.iconColor).toBe(getTokens(brand, mode).brand.tint);
});
