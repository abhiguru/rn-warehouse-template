/**
 * P2F-MEDIA-3: resetting the dispatch form releases the photo files the app
 * wrote for it: those still in the form, and every file registered for the
 * dispatch form before the reset (photos removed earlier included). The
 * registry itself keeps a file an upload still holds.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import dispatchFormReducer, { addImage, loadDispatchData } from '@/store/slices/dispatchFormSlice';
import { createEmptyDispatchHeader } from '@/types/dispatch.types';
import { releaseLocalPhotos, releaseLocalPhotosOwnedBy } from '@/utils/localPhotoFiles';
import { useDispatchForm, type UseDispatchFormReturn } from '../useDispatchForm';

// react-redux is not transformed for jest here, so the store is bound by hand.
let mockStore: ReturnType<typeof makeStore>;
jest.mock('react-redux', () => ({ useStore: () => mockStore }));
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/dispatch/services/dispatchFormService', () => ({
  checkDispatchExists: jest.fn(),
  loadDispatchData: jest.fn(async () => ({ success: false })),
  getNextDispatchNumber: jest.fn(async () => 'DD0099'),
  createDispatch: jest.fn(),
  updateDispatch: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { camera: 'camera', grnForm: 'grn-form', dispatchForm: 'dispatch-form' },
  releaseLocalPhotos: jest.fn(async () => 0),
  releaseLocalPhotosOwnedBy: jest.fn(async () => 0),
}));

const OWN_ID = '11111111-2222-4333-8444-555555555555';

function makeStore() {
  return configureStore({
    reducer: { dispatchForm: dispatchFormReducer, auth: () => ({ userProfile: null }) },
  });
}

async function mount(store: ReturnType<typeof makeStore>, dispatchIdParam?: string) {
  const latest: { current: UseDispatchFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useDispatchForm({ mode: 'edit', dispatchIdParam });
    return null;
  };
  mockStore = store;
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Harness />);
  });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}

const photos = [
  { id: 'temp_a', file_name: 'truck.webp', image_url: 'file:///cache/ImageManipulator/truck.webp', upload_status: 'completed' as const },
  { id: 'image-1', file_name: 'gate.webp', image_url: 'https://files.example/gate', upload_status: 'completed' as const, storage_path: 'd1/gate.webp' },
];

describe('dispatch form photo files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('releases the form photos and the files registered for the dispatch form on reset', async () => {
    const store = makeStore();
    store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header: { ...createEmptyDispatchHeader(), disp_no: 'DD0003' }, items: [] }));
    const { form, unmount } = await mount(store, OWN_ID);
    await act(async () => {
      for (const photo of photos) store.dispatch(addImage(photo));
    });
    expect(releaseLocalPhotos).not.toHaveBeenCalled();
    expect(releaseLocalPhotosOwnedBy).not.toHaveBeenCalled();

    const before = Date.now();
    await act(async () => { form().resetFormState(); });

    expect(store.getState().dispatchForm.images).toEqual([]);
    expect(releaseLocalPhotos).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotos).toHaveBeenCalledWith([
      'file:///cache/ImageManipulator/truck.webp',
      'https://files.example/gate',
    ]);
    expect(releaseLocalPhotosOwnedBy).toHaveBeenCalledTimes(1);
    expect(releaseLocalPhotosOwnedBy).toHaveBeenCalledWith('dispatch-form', { createdBefore: expect.any(Number) });
    expect(jest.mocked(releaseLocalPhotosOwnedBy).mock.calls[0][1]!.createdBefore).toBeGreaterThanOrEqual(before);
    await unmount();
  });
});
