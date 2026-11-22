import React, { useLayoutEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GRNImagesTab } from '../GRNImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// The tab reads the connection; the native NetInfo module is absent under Jest, so the connection is faked online.
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

it('says "Photo missing" on a tile whose file fails to load', async () => {
  const images = [{ id: 'p1', image_url: 'https://example.invalid/p1.jpg', category: 'header' as const }];
  await render(<GRNImagesTab images={images} />);
  expect(screen.queryByText('Photo missing')).not.toBeOnTheScreen();
  // The photo is a native Image stand-in with no role or text: the load failure is raised on it directly.
  const photo = screen.getByRole('imagebutton', { name: 'GRN photo' }).children.find(child => typeof child !== 'string' && child.type === 'Image');
  expect(photo).toBeDefined();
  await fireEvent(photo as NonNullable<typeof photo> & object, 'error', {});
  expect(screen.getByTestId('photo-missing')).toHaveTextContent('Photo missing');
  expect(screen.getByText('Photo missing')).toBeOnTheScreen();
});

const wh286Images = [{ id: 'p1', image_url: 'https://example.invalid/p1.jpg', category: 'header' as const }];
const photoImage = () => {
  const photo = screen.getByRole('imagebutton', { name: 'GRN photo' }).children.find(child => typeof child !== 'string' && child.type === 'Image');
  expect(photo).toBeDefined();
  return photo as NonNullable<typeof photo> & object;
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
      <GRNImagesTab images={wh286Images} />
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
  await render(<GRNImagesTab images={wh286Images} />);
  const photo = photoImage();
  mockOnline = false;
  await screen.rerender(<GRNImagesTab images={wh286Images} />);
  await fireEvent(photo, 'error', {});
  expect(screen.queryByText('Photo missing')).not.toBeOnTheScreen();
});

it('says "Photo missing" for a load error while the phone is online', async () => {
  await render(<GRNImagesTab images={wh286Images} />);
  await fireEvent(photoImage(), 'error', {});
  expect(screen.getByText('Photo missing')).toBeOnTheScreen();
});
