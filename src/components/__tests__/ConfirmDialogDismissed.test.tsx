/**
 * A dialog that hands over to another one needs to know when it has finished closing: ConfirmDialog passes its
 * `onDismissed` to the Modal's `onDismiss` (iOS emits it once the Modal is gone), and PrintRangeDialog stays mounted
 * when it is hidden so that it can report the same.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ConfirmDialog } from '../ConfirmDialog';
import { PrintRangeDialog } from '../PrintRangeDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => true }));
// React Native's own Modal draws nothing while hidden, so its `onDismiss` cannot be reached; this stand-in keeps a host
// node with the Modal's `visible` and `onDismiss` props whether it is shown or not, and draws its children only when shown.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onDismiss, children }: { visible?: boolean; onDismiss?: () => void; children?: React.ReactNode }) =>
      ReactMock.createElement(View, { testID: 'modal', visible, onDismiss }, visible ? children : null),
  };
});

describe('ConfirmDialog', () => {
  it('hands its close event to the Modal', async () => {
    const onDismissed = jest.fn();
    await render(<ConfirmDialog visible={false} title="Q" message="M" onConfirm={jest.fn()} onCancel={jest.fn()} onDismissed={onDismissed} />);

    await fireEvent(screen.getByTestId('modal'), 'dismiss');

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});

describe('PrintRangeDialog', () => {
  it('keeps its Modal when hidden and hands its close event to it', async () => {
    const onDismissed = jest.fn();
    await render(
      <PrintRangeDialog visible={false} onDismiss={jest.fn()} onDismissed={onDismissed} onConfirm={jest.fn()} title="Print" defaultNumber="1" entity="invoice" />
    );

    const modal = screen.getByTestId('modal');
    expect(modal).toHaveProp('visible', false);
    await fireEvent(modal, 'dismiss');

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});
