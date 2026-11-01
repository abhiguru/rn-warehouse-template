/**
 * "Scan document" in the photo menu of the GRN and dispatch header photos: first in the menu, only where the phone has a
 * document scanner; each scanned page is one photo; pages beyond the limit are released and said so.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ImageUploadButton } from '../ImageUploadButton';
import { showAlert } from '@/utils/alert';
import { registerLocalPhoto, releaseLocalPhotos } from '@/utils/localPhotoFiles';

const mockScan = jest.fn();
let mockScannerAvailable = true;

jest.mock('expo-camera', () => {
  const ReactMock = require('react');
  const CameraView = ReactMock.forwardRef(() => null);
  Object.defineProperty(CameraView, 'isDocumentScannerAvailable', { get: () => mockScannerAvailable });
  (CameraView as unknown as { scanDocumentAsync: unknown }).scanDocumentAsync = (...args: unknown[]) => mockScan(...args);
  return { CameraView, useCameraPermissions: () => [{ granted: true }, jest.fn()] };
});
jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { camera: 'camera', grnForm: 'grn-form', dispatchForm: 'dispatch-form' },
  registerLocalPhoto: jest.fn(async () => true),
  releaseLocalPhotos: jest.fn(async () => 1),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-file-system', () => ({ File: class { uri: string; constructor(p: string) { this.uri = p; } async info() { return { exists: true, size: 1000 }; } } }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const upload = jest.fn(async (asset: { uri: string }) => ({
  success: true,
  imageUrl: `${asset.uri}.prepared.webp`,
  metadata: { file_size: 1000, file_name: 'p.webp', mime_type: 'image/webp', uploadTimestamp: '2026-10-31T09:00:00.000Z' },
}));

function render(props: Partial<React.ComponentProps<typeof ImageUploadButton>> = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ImageUploadButton customUploadFunction={upload} grnId="temp_1" documentScan onImageUploadComplete={jest.fn()} {...props} />);
  });
  return tree;
}
const openMenu = (tree: ReactTestRenderer) => {
  act(() => { tree.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').props.onPress(); });
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls.at(-1)!;
  return { title, message, buttons: buttons as { text: string; onPress?: () => void }[] };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockScannerAvailable = true;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('offers Scan document first where the scanner is available', () => {
  const { buttons, message } = openMenu(render());
  expect(buttons.map((b) => b.text)).toEqual(['Scan document', 'Take photo', 'Choose from library', 'Cancel']);
  expect(message).toBe('Scan the document, take a new photo or choose one from your library.');
});

it('leaves the menu as it was where there is no scanner, or for photos that are not documents', () => {
  mockScannerAvailable = false;
  expect(openMenu(render()).buttons.map((b) => b.text)).toEqual(['Take photo', 'Choose from library', 'Cancel']);
  mockScannerAvailable = true;
  expect(openMenu(render({ documentScan: false })).buttons.map((b) => b.text)).toEqual(['Take photo', 'Choose from library', 'Cancel']);
});

it('adds each scanned page as one photo', async () => {
  mockScan.mockResolvedValueOnce({ pages: ['file:///cache/s1.jpg', 'file:///cache/s2.jpg'] });
  const { buttons } = openMenu(render());
  await act(async () => { await buttons[0].onPress!(); });
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls.map((c) => c[0].uri)).toEqual(['file:///cache/s1.jpg', 'file:///cache/s2.jpg']);
  expect(registerLocalPhoto).toHaveBeenCalledWith('file:///cache/s1.jpg', 'camera', 'capture');
});

it('adds nothing when the scan is cancelled', async () => {
  mockScan.mockResolvedValueOnce(null);
  const { buttons } = openMenu(render());
  await act(async () => { await buttons[0].onPress!(); });
  expect(upload).not.toHaveBeenCalled();
});

it('releases the pages beyond the limit and says how many were added', async () => {
  mockScan.mockResolvedValueOnce({ pages: ['file:///cache/s1.jpg', 'file:///cache/s2.jpg', 'file:///cache/s3.jpg'] });
  const { buttons } = openMenu(render({ maxImages: 2 }));
  await act(async () => { await buttons[0].onPress!(); });
  expect(upload).toHaveBeenCalledTimes(2);
  expect(releaseLocalPhotos).toHaveBeenCalledWith(['file:///cache/s3.jpg']);
  expect(jest.mocked(showAlert).mock.calls.at(-1)![1]).toBe('Only 2 of 3 pages were added (limit 2 photos).');
});
