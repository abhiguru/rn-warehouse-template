import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GRNImagesTab } from '../GRNImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// The tab reads the connection; the native NetInfo module is absent under Jest, so the connection is faked online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

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
