/**
 * WH-303 DQ13 and DQ14 (Design offline-capture.md 2.5): on an Edit GRN form loaded from the phone copy, a saved photo that has
 * no file on the phone is a tile with an icon and "Photo needs a connection" (a tap opens nothing, Remove stays); a tile
 * narrower than 88 times the font scale shows the icon only, and the words stay in its spoken label.
 * Real: the grid and the helper. Stand-ins: the icon font, the image view, the theme store, the font scale.
 */
import React from 'react';
import * as ReactNative from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ImagePreviewGrid } from '../ImagePreviewGrid';
import { PHOTO_TILE_WORDS_MIN_WIDTH, photoTileShowsWords } from '../../utils/photoTile';
import { space } from '@/theme/tokens';
import type { GRNImageData } from '@/store/slices/grnFormSlice';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/config/supabaseConfig', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../../services/imageUploadService', () => ({ deleteGRNImage: jest.fn(async () => ({ success: true })) }));

const SAVED_ID = 'aaaaaaaa-2222-4333-8444-555555555555';
const notOnPhone: GRNImageData = { id: SAVED_ID, fileName: 'book.webp', imageUrl: '', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' };

// useWindowDimensions reads the window from Dimensions: only the font scale of it is changed.
const realWindow = ReactNative.Dimensions.get('window');
const withFontScale = (fontScale: number) => {
  jest.spyOn(ReactNative.Dimensions, 'get').mockImplementation(() => ({ ...realWindow, fontScale }));
};
afterEach(() => jest.restoreAllMocks());

describe('photoTileShowsWords', () => {
  it('has room for the words from 88 at font scale 1, and needs more as the text grows', () => {
    expect(PHOTO_TILE_WORDS_MIN_WIDTH).toBe(88);
    expect(photoTileShowsWords(88, 1)).toBe(true);
    expect(photoTileShowsWords(87, 1)).toBe(false);
    expect(photoTileShowsWords(100, 1.3)).toBe(false);
    expect(photoTileShowsWords(115, 1.3)).toBe(true);
  });
});

describe('a saved photo that is not on the phone', () => {
  it('is a tile with the icon and the words, not a picture, and nothing opens from it', async () => {
    withFontScale(1);
    const onImagePress = jest.fn();
    await render(<ImagePreviewGrid imageData={[notOnPhone]} onImagePress={onImagePress} />);
    const tile = screen.getByTestId(`photo-needs-connection-${SAVED_ID}`);
    expect(tile).toHaveTextContent('Photo needs a connection');
    expect(screen.queryByRole('imagebutton')).not.toBeOnTheScreen();
    expect(onImagePress).not.toHaveBeenCalled();
    // Remove stays, so the person can take the photo off the GRN without seeing it.
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeOnTheScreen();
  });

  it('says the words to a screen reader as well as showing them', async () => {
    withFontScale(1);
    await render(<ImagePreviewGrid imageData={[notOnPhone]} />);
    expect(screen.getByLabelText(/book\.webp, Photo needs a connection$/)).toBeOnTheScreen();
  });

  it('a photo with no file and no saved id (a failed new upload) is not shown as this tile', async () => {
    withFontScale(1);
    await render(<ImagePreviewGrid imageData={[{ ...notOnPhone, id: '', uploadStatus: 'failed' }]} />);
    expect(screen.queryByTestId(/^photo-needs-connection-/)).not.toBeOnTheScreen();
  });

  // The grid's own sum: the tile width for a number of columns on the test screen. WIDE is the most columns that still give
  // a tile of 88 or more; NARROW is one more, which gives a tile under 88.
  const tileWidth = (columns: number) =>
    Math.floor((ReactNative.Dimensions.get('window').width - 2 * space.lg - (columns - 1) * space.xs) / columns);
  const WIDE = Array.from({ length: 12 }, (_, n) => n + 1).filter((c) => tileWidth(c) >= 88).pop() as number;
  const NARROW = WIDE + 1;

  it('the two widths straddle the cut-off, so the cases below mean what they say', () => {
    expect(tileWidth(WIDE)).toBeGreaterThanOrEqual(88);
    expect(tileWidth(NARROW)).toBeLessThan(88);
    expect(tileWidth(WIDE)).toBeLessThan(88 * 1.3);
  });

  it.each([
    ['font scale 1, a tile of 88 or more', 1, 'WIDE', true],
    ['font scale 1, a tile under 88', 1, 'NARROW', false],
    ['font scale 1.3, a tile that fitted at 1', 1.3, 'WIDE', false],
    ['font scale 0.8, a tile under 88 that fits at that scale', 0.8, 'NARROW', true],
  ])('%s: the words are shown: %s, and the spoken label always has them', async (_name, fontScale, width, words) => {
    withFontScale(fontScale);
    await render(<ImagePreviewGrid imageData={[notOnPhone]} columns={width === 'WIDE' ? WIDE : NARROW} />);
    const tile = screen.getByTestId(`photo-needs-connection-${SAVED_ID}`);
    if (words) expect(tile).toHaveTextContent('Photo needs a connection');
    else expect(tile).not.toHaveTextContent('Photo needs a connection');
    expect(screen.getByLabelText(/Photo needs a connection$/)).toBeOnTheScreen();
  });
});
