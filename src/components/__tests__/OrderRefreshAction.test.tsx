import { OrderRefreshAction } from '../OrderRefreshAction';

jest.mock('react-native-paper', () => ({ IconButton: 'IconButton' }));

it('exposes an accessible, gesture-independent refresh action', () => {
  const refresh = jest.fn();
  const action = OrderRefreshAction({ onRefresh: refresh, refreshing: false, color: 'orange', label: 'Refresh orders' });
  expect(action.props.accessibilityLabel).toBe('Refresh orders');
  expect(action.props.disabled).toBe(false);
  action.props.onPress();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('announces progress and ignores repeat presses while refreshing', () => {
  const refresh = jest.fn();
  const action = OrderRefreshAction({ onRefresh: refresh, refreshing: true, color: 'orange', label: 'Refresh order queue' });
  expect(action.props.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(action.props.loading).toBe(true);
  action.props.onPress();
  expect(refresh).not.toHaveBeenCalled();
});
