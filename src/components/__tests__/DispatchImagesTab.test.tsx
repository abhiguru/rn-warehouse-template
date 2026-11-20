import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { DispatchImagesTab } from '../dispatch-details/DispatchImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// The tab reads the connection (WH-55); the native NetInfo module is absent under Jest, so the connection is faked online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

const user = userEvent.setup({ delay: 0 });
const addButton = () => screen.queryByRole('button', { name: 'Add dispatch photo' });
const deleteButtons = () => screen.queryAllByRole('button', { name: /^Delete dispatch photo/ });

// testvm2 known issue 4: a submitted dispatch had no way to receive a photo.
it('offers Add Photo on an empty or filled dispatch only when the screen allows uploads', async () => {
  const onUpload = jest.fn();
  await render(<DispatchImagesTab images={[]} />);
  expect(addButton()).not.toBeOnTheScreen();

  await screen.rerender(<DispatchImagesTab images={[]} onUpload={onUpload} />);
  await user.press(screen.getByRole('button', { name: 'Add dispatch photo' }));
  expect(onUpload).toHaveBeenCalledTimes(1);

  const images = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  await screen.rerender(<DispatchImagesTab images={images} onUpload={onUpload} isUploading />);
  expect(screen.getByRole('button', { name: 'Add dispatch photo' })).toBeDisabled();
});

it('says "Photo missing" on a tile whose file fails to load', async () => {
  const images = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  await render(<DispatchImagesTab images={images} />);
  expect(screen.queryByText('Photo missing')).not.toBeOnTheScreen();
  // The photo itself has no role or text: it is the Image drawn inside the tile's button.
  const findImage = (nodes: readonly unknown[]): unknown => {
    for (const node of nodes) {
      if (typeof node === 'string') continue;
      const inst = node as { type: unknown; children: readonly unknown[] };
      if (inst.type === 'Image') return inst;
      const found = findImage(inst.children);
      if (found) return found;
    }
    return undefined;
  };
  const image = findImage(screen.getByRole('imagebutton').children);
  expect(image).toBeDefined();
  await fireEvent(image as never, 'error', {});
  expect(await screen.findByText('Photo missing')).toBeOnTheScreen();
});

it('offers a delete per photo, the only one included, only when the screen allows it; it waits while a delete or an upload runs', async () => {
  const onDelete = jest.fn();
  const one = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  const two = [...one, { id: 'photo-2', image_url: 'https://example.invalid/photo-2.jpg' }];
  await render(<DispatchImagesTab images={two} />);
  expect(deleteButtons()).toHaveLength(0);

  await screen.rerender(<DispatchImagesTab images={two} onDelete={onDelete} />);
  expect(deleteButtons()).toHaveLength(2);
  expect(deleteButtons()[0]).toHaveAccessibleName('Delete dispatch photo 1 of 2');
  expect(deleteButtons()[1]).toHaveAccessibleName('Delete dispatch photo 2 of 2');
  await user.press(deleteButtons()[1]);
  expect(onDelete).toHaveBeenCalledWith(two[1]);

  // The last photo can be deleted too.
  await screen.rerender(<DispatchImagesTab images={one} onDelete={onDelete} />);
  expect(deleteButtons()).toHaveLength(1);
  expect(deleteButtons()[0]).toBeEnabled();

  await screen.rerender(<DispatchImagesTab images={one} onDelete={onDelete} isDeleting />);
  expect(deleteButtons()[0]).toBeDisabled();
  await screen.rerender(<DispatchImagesTab images={one} onDelete={onDelete} isUploading />);
  expect(deleteButtons()[0]).toBeDisabled();
});
