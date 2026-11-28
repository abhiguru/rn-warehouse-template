import React, { useLayoutEffect } from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { en } from '@/i18n/locales/en';
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

// WH-385 (contract product/tech/app-missing-photo-note.md S1 to S6; Design offline-capture.md Part 14): the lasting line.
describe('photos taken with the GRN that could not be sent (WH-385)', () => {
  const one = '1 photo taken with this GRN could not be sent.';
  const line = () => screen.getByTestId('grn-photos-missing');
  // The sentence and the photo tiles, in the order they are drawn (and read).
  const orderOf = (sentence: string) => {
    const tree = JSON.stringify(screen.toJSON());
    return { line: tree.indexOf(sentence), filters: tree.indexOf('"All'), photo: tree.indexOf('GRN photo') };
  };
  afterEach(async () => {
    await setLanguage('en');
  });

  it('one missing: the sentence is above the filter chips and the photos, and the counts stay the photos present', async () => {
    await render(<GRNImagesTab images={wh286Images} missingCount={1} />);
    expect(line()).toHaveTextContent(one);
    const at = orderOf(one);
    expect(at.line).toBeGreaterThan(-1);
    expect(at.line).toBeLessThan(at.filters);
    expect(at.line).toBeLessThan(at.photo);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent(/1/);
    expect(screen.getByRole('imagebutton', { name: 'GRN photo' })).toBeOnTheScreen();
  });

  it('several missing: the count is said', async () => {
    await render(<GRNImagesTab images={wh286Images} missingCount={3} />);
    expect(line()).toHaveTextContent('3 photos taken with this GRN could not be sent.');
  });

  it('is one screen-reader stop with the sentence as its label, not a live region, with nothing to press', async () => {
    await render(<GRNImagesTab images={wh286Images} missingCount={1} />);
    expect(line()).toHaveAccessibleName(one);
    expect(line().props.accessible).toBe(true);
    expect(line().props.accessibilityLiveRegion).toBeUndefined();
    expect(line().props.onPress).toBeUndefined();
    expect(screen.queryByRole('button', { name: /could not be sent/ })).not.toBeOnTheScreen();
  });

  it('stays while another filter is chosen', async () => {
    await render(<GRNImagesTab images={wh286Images} missingCount={1} />);
    await userEvent.press(screen.getByRole('button', { name: /^Items/ }));
    expect(line()).toHaveTextContent(one);
  });

  it('no photo arrived: the empty state says the sentence instead of "no photos", and an editor can still add one', async () => {
    const onUpload = jest.fn();
    await render(<GRNImagesTab images={[]} missingCount={2} onUpload={onUpload} />);
    expect(line()).toHaveTextContent('2 photos taken with this GRN could not be sent.');
    expect(screen.queryByText(en.grn.images.emptyTitle)).not.toBeOnTheScreen();
    expect(screen.queryByText(en.grn.images.emptyCanAdd)).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Add image' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['0', 0],
    ['absent', undefined],
  ])('missingCount %s: no line, with photos and without', async (_what, missingCount) => {
    await render(<GRNImagesTab images={wh286Images} missingCount={missingCount} />);
    expect(screen.queryByTestId('grn-photos-missing')).not.toBeOnTheScreen();
    await screen.rerender(<GRNImagesTab images={[]} missingCount={missingCount} />);
    expect(screen.queryByTestId('grn-photos-missing')).not.toBeOnTheScreen();
    expect(screen.getByText(en.grn.images.emptyTitle)).toBeOnTheScreen();
  });

  it.each([
    [1, 'આ આવક પાવતી સાથે લીધેલો ૧ ફોટો મોકલી શકાયો નથી.'],
    [12, 'આ આવક પાવતી સાથે લીધેલા ૧૨ ફોટા મોકલી શકાયા નથી.'],
  ])('Gujarati, %s: the Gujarati sentence with Gujarati digits', async (missingCount, sentence) => {
    await setLanguage('gu');
    await render(<GRNImagesTab images={wh286Images} missingCount={missingCount} />);
    expect(line()).toHaveTextContent(sentence);
    expect(line()).toHaveAccessibleName(sentence);
  });
});
