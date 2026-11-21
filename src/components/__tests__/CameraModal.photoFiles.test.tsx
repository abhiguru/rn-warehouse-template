/**
 * The in-app camera hands over the size of its photo, so preparing it encodes
 * it once (P2F-MEDIA-1), and a shot that is not used is deleted (P2F-MEDIA-3).
 */
import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { CameraModal } from '../CameraModal';
import { ImageUploadButton } from '@/features/grn/components/ImageUploadButton';
import { registerLocalPhoto, releaseLocalPhotos } from '@/utils/localPhotoFiles';
import { showAlert } from '@/utils/alert';

const SHOT = 'file:///data/user/0/org.example.warehouse/cache/Camera/shot-1.jpg';
const PREPARED = 'file:///data/user/0/org.example.warehouse/cache/ImageManipulator/copy-1.webp';
const mockTakePicture = jest.fn();

jest.mock('expo-camera', () => {
  const ReactMock = require('react');
  return {
    CameraView: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactMock.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      return ReactMock.createElement('CameraView', null, props.children);
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
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
jest.mock('react-native-safe-area-context', () => {
  const ReactMock = require('react');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: (props: { children?: React.ReactNode }) => ReactMock.createElement('SafeAreaView', props, props.children),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    async info() {
      return { exists: true, size: 2_400_000 };
    }
  },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (run: () => unknown) => run() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const user = () => userEvent.setup({ delay: 0 });
const press = async (u: ReturnType<typeof user>, name: string) => {
  await u.press(screen.getByRole('button', { name }));
};

// The camera view is the only host named CameraView in the mock; it has no role or text, so it is found in the tree.
type Node = NonNullable<typeof screen.root>;
function findCameraView(): Node {
  const walk = (node: Node): Node | undefined => {
    if (node.type === 'CameraView') return node;
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      const found = walk(child as Node);
      if (found) return found;
    }
    return undefined;
  };
  const found = walk(screen.root as Node);
  if (!found) throw new Error('no camera view on the screen');
  return found;
}

// A shot that has not finished saving: released in afterEach so a failing test cannot leave Jest waiting on it.
let finishShot: ((photo: { uri: string; width: number; height: number }) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockTakePicture.mockResolvedValue({ uri: SHOT, width: 3024, height: 4032 });
  // The failed preparation below is logged on purpose.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  finishShot?.({ uri: SHOT, width: 3024, height: 4032 });
  finishShot = undefined;
  jest.restoreAllMocks();
});

describe('CameraModal', () => {
  it('draws the shutter and the top buttons next to the camera view, not inside it (expo-camera 58 takes no children)', async () => {
    await render(<CameraModal visible onClose={jest.fn()} onCapture={jest.fn()} />);
    // Nothing is drawn inside the camera view, and the controls are on the screen beside it.
    expect(findCameraView().children).toHaveLength(0);
    for (const name of ['Take photo', 'Close camera']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });

  it('hands over the accepted shot with the size the camera reported, and keeps the file', async () => {
    const u = user();
    const onCapture = jest.fn();
    const onClose = jest.fn();
    await render(<CameraModal visible onClose={onClose} onCapture={onCapture} />);

    await press(u, 'Take photo');
    expect(registerLocalPhoto).toHaveBeenCalledWith(SHOT, 'camera', 'capture');
    await press(u, 'Use photo');

    expect(onCapture).toHaveBeenCalledWith(SHOT, { width: 3024, height: 4032 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
  });

  it('deletes a retaken shot', async () => {
    const u = user();
    const onCapture = jest.fn();
    await render(<CameraModal visible onClose={jest.fn()} onCapture={onCapture} />);

    await press(u, 'Take photo');
    await press(u, 'Retake photo');

    expect(releaseLocalPhotos).toHaveBeenCalledWith([SHOT]);
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('closed while the shot is being saved: the late shot is deleted and is not shown on the next opening', async () => {
    const u = user();
    mockTakePicture.mockReturnValue(new Promise((resolve) => { finishShot = resolve; }));
    const onCapture = jest.fn();
    await render(<CameraModal visible onClose={jest.fn()} onCapture={onCapture} />);

    // The shutter is pressed, then X, before the shot is saved.
    await press(u, 'Take photo');
    await press(u, 'Close camera');
    await act(async () => { finishShot?.({ uri: SHOT, width: 3024, height: 4032 }); });
    finishShot = undefined;

    await waitFor(() => expect(releaseLocalPhotos).toHaveBeenCalledWith([SHOT]));
    // No preview: the screen still offers the shutter, not Retake / Use photo.
    expect(screen.queryByRole('button', { name: 'Use photo' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeOnTheScreen();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('does not invent a size the camera did not report', async () => {
    const u = user();
    mockTakePicture.mockResolvedValue({ uri: SHOT, width: 0, height: 0 });
    const onCapture = jest.fn();
    await render(<CameraModal visible onClose={jest.fn()} onCapture={onCapture} />);
    await press(u, 'Take photo');
    await press(u, 'Use photo');
    expect(onCapture).toHaveBeenCalledWith(SHOT, undefined);
  });
});

// The "Add photos" button asks what to add with showAlert (mocked here); the button of that alert that opens the camera is
// pressed the way the alert would press it.
async function openCamera(u: ReturnType<typeof user>) {
  await u.press(screen.getByRole('button', { name: 'Add photos' }));
  const buttons = (showAlert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
  const takePhoto = buttons.find((b) => b.text === 'Take photo');
  await act(async () => { takePhoto?.onPress?.(); });
}

describe('ImageUploadButton with a camera shot', () => {
  it('passes the camera size on to the preparation, and deletes the shot once the prepared copy replaces it', async () => {
    const u = user();
    const upload = jest.fn(async (_asset: { uri: string }, _entityId: string) => ({
      success: true,
      imageUrl: PREPARED,
      metadata: { file_size: 180_000, file_name: 'photo.webp', mime_type: 'image/webp', uploadTimestamp: '2026-10-13T09:00:00.000Z' },
    }));
    const onComplete = jest.fn();
    await render(
      <ImageUploadButton customUploadFunction={upload} grnId="temp_dispatch_1" onImageUploadComplete={onComplete} />
    );
    await openCamera(u);
    await press(u, 'Take photo');
    await press(u, 'Use photo');

    await waitFor(() => expect(releaseLocalPhotos).toHaveBeenCalledWith([SHOT]));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toMatchObject({ uri: SHOT, width: 3024, height: 4032, fileSize: 2_400_000 });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: PREPARED }));
  });

  it('keeps the shot when the preparation fails: the form still shows it', async () => {
    const u = user();
    const upload = jest.fn(async (_asset: { uri: string }, _entityId: string) => ({ success: false, error: 'Failed to process image file' }));
    const onError = jest.fn();
    await render(<ImageUploadButton customUploadFunction={upload} grnId="temp_dispatch_1" onImageUploadError={onError} />);
    await openCamera(u);
    await press(u, 'Take photo');
    await press(u, 'Use photo');
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
  });
});
