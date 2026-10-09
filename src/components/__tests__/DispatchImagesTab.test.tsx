import React from 'react';
import { act, create } from 'react-test-renderer';
import { DispatchImagesTab } from '../dispatch-details/DispatchImagesTab';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => require('@/theme/listColors').listColors }));

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
