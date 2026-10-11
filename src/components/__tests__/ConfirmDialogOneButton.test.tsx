/**
 * A dialog that only informs is a ConfirmDialog with cancelText="". It must show
 * one button. It used to draw the cancel button anyway, as an empty outline
 * beside "Close" (seen on a phone in the "Enter a reason" dialogs of the invoice form).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ConfirmDialog } from '../ConfirmDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

async function buttons(cancelText: string | undefined) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ConfirmDialog
        visible
        title="Enter a discount reason"
        message="Enter the reason for this discount before submitting the invoice."
        confirmText="Close"
        cancelText={cancelText}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
  });
  // One entry per button: the same label sits on the component and on its host view.
  const labels = [
    ...new Set(
      tree.root
        .findAll((node) => node.props.accessibilityRole === 'button')
        .map((button) => String(button.props.accessibilityLabel))
    ),
  ];
  await act(async () => { tree.unmount(); });
  return labels;
}

describe('ConfirmDialog buttons', () => {
  it('shows only the confirm button when the cancel text is empty', async () => {
    expect(await buttons('')).toEqual(['Close']);
  });

  it('shows both buttons when a cancel text is given', async () => {
    expect(await buttons('Keep editing')).toEqual(['Keep editing', 'Close']);
  });

  it('shows the default cancel button when no cancel text is given', async () => {
    expect(await buttons(undefined)).toEqual(['Cancel', 'Close']);
  });
});
