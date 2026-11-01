import React from 'react';
import { act, create } from 'react-test-renderer';
import { GRNImagesTab } from '../GRNImagesTab';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

it('says "Photo missing" on a tile whose file fails to load', async () => {
  const images = [{ id: 'p1', image_url: 'https://example.invalid/p1.jpg', category: 'header' as const }];
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<GRNImagesTab images={images} />); });
  const missing = () => tree.root.findAll(node => node.props.testID === 'photo-missing' && node.props.children === 'Photo missing');
  expect(missing()).toHaveLength(0);
  await act(async () => { tree.root.findByType('Image' as never).props.onError({}); });
  expect(missing().length).toBeGreaterThan(0);
  await act(async () => { tree.unmount(); });
});
