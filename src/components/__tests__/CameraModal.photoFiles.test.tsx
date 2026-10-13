/**
 * The in-app camera hands over the size of its photo, so preparing it encodes
 * it once (P2F-MEDIA-1), and a shot that is not used is deleted (P2F-MEDIA-3).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CameraModal } from '../CameraModal';
import { ImageUploadButton } from '@/features/grn/components/ImageUploadButton';
import { registerLocalPhoto, releaseLocalPhotos } from '@/utils/localPhotoFiles';

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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}
const press = async (tree: ReactTestRenderer, label: string) => {
  const target = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => {
    await target.props.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTakePicture.mockResolvedValue({ uri: SHOT, width: 3024, height: 4032 });
  // The failed preparation below is logged on purpose.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('CameraModal', () => {
  it('hands over the accepted shot with the size the camera reported, and keeps the file', async () => {
    const onCapture = jest.fn();
    const onClose = jest.fn();
    const tree = render(<CameraModal visible onClose={onClose} onCapture={onCapture} />);

    await press(tree, 'Take photo');
    expect(registerLocalPhoto).toHaveBeenCalledWith(SHOT, 'camera', 'capture');
    await press(tree, 'Use photo');

    expect(onCapture).toHaveBeenCalledWith(SHOT, { width: 3024, height: 4032 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
  });

  it('deletes a retaken shot', async () => {
    const onCapture = jest.fn();
    const tree = render(<CameraModal visible onClose={jest.fn()} onCapture={onCapture} />);

    await press(tree, 'Take photo');
    await press(tree, 'Retake photo');

    expect(releaseLocalPhotos).toHaveBeenCalledWith([SHOT]);
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('does not invent a size the camera did not report', async () => {
    mockTakePicture.mockResolvedValue({ uri: SHOT, width: 0, height: 0 });
    const onCapture = jest.fn();
    const tree = render(<CameraModal visible onClose={jest.fn()} onCapture={onCapture} />);
    await press(tree, 'Take photo');
    await press(tree, 'Use photo');
    expect(onCapture).toHaveBeenCalledWith(SHOT, undefined);
  });
});

describe('ImageUploadButton with a camera shot', () => {
  it('passes the camera size on to the preparation, and deletes the shot once the prepared copy replaces it', async () => {
    const upload = jest.fn(async (_asset: { uri: string }, _entityId: string) => ({
      success: true,
      imageUrl: PREPARED,
      metadata: { file_size: 180_000, file_name: 'photo.webp', mime_type: 'image/webp', uploadTimestamp: '2026-10-13T09:00:00.000Z' },
    }));
    const onComplete = jest.fn();
    const tree = render(
      <ImageUploadButton customUploadFunction={upload} grnId="temp_dispatch_1" onImageUploadComplete={onComplete} />
    );
    const camera = tree.root.findByType(CameraModal);

    await act(async () => {
      await camera.props.onCapture(SHOT, { width: 3024, height: 4032 });
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toMatchObject({ uri: SHOT, width: 3024, height: 4032, fileSize: 2_400_000 });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: PREPARED }));
    expect(releaseLocalPhotos).toHaveBeenCalledWith([SHOT]);
  });

  it('keeps the shot when the preparation fails: the form still shows it', async () => {
    const upload = jest.fn(async (_asset: { uri: string }, _entityId: string) => ({ success: false, error: 'Failed to process image file' }));
    const tree = render(<ImageUploadButton customUploadFunction={upload} grnId="temp_dispatch_1" onImageUploadError={jest.fn()} />);
    await act(async () => {
      await tree.root.findByType(CameraModal).props.onCapture(SHOT, { width: 3024, height: 4032 });
    });
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
  });
});
