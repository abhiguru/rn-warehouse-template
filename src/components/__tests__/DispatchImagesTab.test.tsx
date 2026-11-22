import React, { useLayoutEffect } from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { DispatchImagesTab } from '../dispatch-details/DispatchImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// The tab reads the connection (WH-55); the native NetInfo module is absent under Jest, so the connection is faked online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined },
}));
// The tab's connection is set by each case: it is the mocked hook, so a case can flip it between renders.
let mockOnline = true;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

beforeEach(() => {
  mockOnline = true;
});

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

const wh286Images = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
const findPhotoImage = (nodes: readonly unknown[]): unknown => {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    const inst = node as { type: unknown; children: readonly unknown[] };
    if (inst.type === 'Image') return inst;
    const found = findPhotoImage(inst.children);
    if (found) return found;
  }
  return undefined;
};
const photoImage = () => {
  const image = findPhotoImage(screen.getByRole('imagebutton').children);
  expect(image).toBeDefined();
  return image as never;
};

// WH-286: the phone goes offline and the photo's load error arrives before the passive effects have run.
// OfflineError sits after the tab and raises the photo's error from its own layout effect, which runs in the
// same commit that took the phone offline, after the tab's layout effects and before any passive effect.
const OfflineError: React.FC<{ online: boolean; onFire: () => void }> = ({ online, onFire }) => {
  useLayoutEffect(() => {
    if (!online) onFire();
  }, [online, onFire]);
  return null;
};
const Harness: React.FC<{ online: boolean; onFire: () => void }> = ({ online, onFire }) => {
  mockOnline = online;
  return (
    <>
      <DispatchImagesTab images={wh286Images} />
      <OfflineError online={online} onFire={onFire} />
    </>
  );
};

it('never says "Photo missing" when the load error comes in the same commit that took the phone offline', async () => {
  const onFire = jest.fn();
  await render(<Harness online onFire={onFire} />);
  const photo = photoImage() as { props: { onError: (e: unknown) => void } };
  onFire.mockImplementation(() => photo.props.onError({}));
  await screen.rerender(<Harness online={false} onFire={onFire} />);
  expect(onFire).toHaveBeenCalled();
  expect(screen.queryByText('Photo missing')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('photo-missing')).not.toBeOnTheScreen();
});

it('never says "Photo missing" for a load error right after the phone goes offline', async () => {
  await render(<DispatchImagesTab images={wh286Images} />);
  const image = photoImage();
  mockOnline = false;
  await screen.rerender(<DispatchImagesTab images={wh286Images} />);
  await fireEvent(image, 'error', {});
  expect(screen.queryByText('Photo missing')).not.toBeOnTheScreen();
});

it('says "Photo missing" for a load error while the phone is online', async () => {
  await render(<DispatchImagesTab images={wh286Images} />);
  await fireEvent(photoImage(), 'error', {});
  expect(await screen.findByText('Photo missing')).toBeOnTheScreen();
});
