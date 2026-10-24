/**
 * A dialog that hands over to another one needs to know when it has finished closing: ConfirmDialog passes its
 * `onDismissed` to the Modal's `onDismiss` (iOS emits it once the Modal is gone), and PrintRangeDialog stays mounted
 * when it is hidden so that it can report the same.
 */
import React from 'react';
import { Modal } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ConfirmDialog } from '../ConfirmDialog';
import { PrintRangeDialog } from '../PrintRangeDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => true }));

let tree: ReactTestRenderer;
afterEach(async () => { await act(async () => { tree.unmount(); }); });

describe('ConfirmDialog', () => {
  it('hands its close event to the Modal', async () => {
    const onDismissed = jest.fn();
    await act(async () => {
      tree = create(<ConfirmDialog visible={false} title="Q" message="M" onConfirm={jest.fn()} onCancel={jest.fn()} onDismissed={onDismissed} />);
    });

    const modal = tree.root.findByType(Modal);
    modal.props.onDismiss();

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});

describe('PrintRangeDialog', () => {
  it('keeps its Modal when hidden and hands its close event to it', async () => {
    const onDismissed = jest.fn();
    await act(async () => {
      tree = create(
        <PrintRangeDialog visible={false} onDismiss={jest.fn()} onDismissed={onDismissed} onConfirm={jest.fn()} title="Print" defaultNumber="1" entity="invoice" />
      );
    });

    const modal = tree.root.findByType(Modal);
    expect(modal.props.visible).toBe(false);
    modal.props.onDismiss();

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});
