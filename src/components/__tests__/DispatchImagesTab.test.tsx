import React from 'react';
import { act, create } from 'react-test-renderer';
import { DispatchImagesTab } from '../dispatch-details/DispatchImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

const addButtons = (tree: ReturnType<typeof create>) =>
  tree.root.findAll(node => node.props.accessibilityLabel === 'Add dispatch photo' && typeof node.props.onPress === 'function');

// testvm2 known issue 4: a submitted dispatch had no way to receive a photo.
it('offers Add Photo on an empty or filled dispatch only when the screen allows uploads', async () => {
  const onUpload = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DispatchImagesTab images={[]} />); });
  expect(addButtons(tree)).toHaveLength(0);

  await act(async () => { tree.update(<DispatchImagesTab images={[]} onUpload={onUpload} />); });
  await act(async () => { addButtons(tree)[0].props.onPress(); });
  expect(onUpload).toHaveBeenCalledTimes(1);

  const images = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  await act(async () => { tree.update(<DispatchImagesTab images={images} onUpload={onUpload} isUploading />); });
  const [inHeader] = addButtons(tree);
  expect(inHeader.props.disabled).toBe(true);
  await act(async () => { tree.unmount(); });
});

it('says "Photo missing" on a tile whose file fails to load', async () => {
  const images = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DispatchImagesTab images={images} />); });
  const missing = () => tree.root.findAll(node => node.props.testID === 'photo-missing' && node.props.children === 'Photo missing');
  expect(missing()).toHaveLength(0);
  await act(async () => { tree.root.findByType('Image' as never).props.onError({}); });
  expect(missing().length).toBeGreaterThan(0);
  await act(async () => { tree.unmount(); });
});

it('offers a delete per photo, the only one included, only when the screen allows it; it waits while a delete or an upload runs', async () => {
  const onDelete = jest.fn();
  const one = [{ id: 'photo-1', image_url: 'https://example.invalid/photo-1.jpg' }];
  const two = [...one, { id: 'photo-2', image_url: 'https://example.invalid/photo-2.jpg' }];
  const deleteButtons = (tree: ReturnType<typeof create>) =>
    tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Delete dispatch photo') && typeof node.props.onPress === 'function');
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<DispatchImagesTab images={two} />); });
  expect(deleteButtons(tree)).toHaveLength(0);

  await act(async () => { tree.update(<DispatchImagesTab images={two} onDelete={onDelete} />); });
  expect(deleteButtons(tree).map(n => n.props.accessibilityLabel)).toEqual(['Delete dispatch photo 1 of 2', 'Delete dispatch photo 2 of 2']);
  await act(async () => { deleteButtons(tree)[1].props.onPress(); });
  expect(onDelete).toHaveBeenCalledWith(two[1]);

  // The last photo can be deleted too.
  await act(async () => { tree.update(<DispatchImagesTab images={one} onDelete={onDelete} />); });
  expect(deleteButtons(tree)).toHaveLength(1);
  expect(deleteButtons(tree)[0].props.disabled).toBe(false);

  await act(async () => { tree.update(<DispatchImagesTab images={one} onDelete={onDelete} isDeleting />); });
  expect(deleteButtons(tree)[0].props.disabled).toBe(true);
  await act(async () => { tree.update(<DispatchImagesTab images={one} onDelete={onDelete} isUploading />); });
  expect(deleteButtons(tree)[0].props.disabled).toBe(true);
  await act(async () => { tree.unmount(); });
});
