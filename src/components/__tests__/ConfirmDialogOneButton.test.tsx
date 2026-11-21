/**
 * A dialog that only informs is a ConfirmDialog with cancelText="". It must show
 * one button. It used to draw the cancel button anyway, as an empty outline
 * beside "Close" (seen on a phone in the "Enter a reason" dialogs of the invoice form).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ConfirmDialog } from '../ConfirmDialog';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

async function renderDialog(cancelText: string | undefined) {
  await render(
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
  return screen.getAllByRole('button');
}

describe('ConfirmDialog buttons', () => {
  it('shows only the confirm button when the cancel text is empty', async () => {
    const buttons = await renderDialog('');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Close');
  });

  it('shows both buttons when a cancel text is given', async () => {
    const buttons = await renderDialog('Keep editing');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('Keep editing');
    expect(buttons[1]).toHaveAccessibleName('Close');
  });

  it('shows the default cancel button when no cancel text is given', async () => {
    const buttons = await renderDialog(undefined);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('Cancel');
    expect(buttons[1]).toHaveAccessibleName('Close');
  });
});
