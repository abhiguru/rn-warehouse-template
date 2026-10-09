import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { SavedItemCard } from '../SavedItemCard';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';
import { ImagePreviewGrid } from '../ImagePreviewGrid';
import { ImageUploadButton } from '../ImageUploadButton';
import {
  HeroBanner,
  ItemSearchField,
  MarkImageField,
  QuantityWeightFields,
  RackChamberPicker,
} from '../item-form';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: () => null }));
jest.mock('@/components/CameraModal', () => ({ CameraModal: () => null }));
jest.mock('@/components/FioriLinearProgress', () => ({ FioriLinearProgress: () => null }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/config/nativeHandoff', () => ({ withNativeHandoff: (fn: () => unknown) => fn() }));
jest.mock('@/config/supabaseConfig', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({
  deleteGRNImage: jest.fn(),
  uploadGRNHeaderImage: jest.fn(),
  uploadGRNItemImage: jest.fn(),
  validateImageFile: jest.fn(() => ({ valid: true })),
  generateTempGRNId: () => 'temp',
}));

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

const image = { id: 'img-1', imageUrl: 'file:///photo.jpg', fileName: 'photo.jpg', uploadStatus: 'completed' as const };

const item: ItemFormData = {
  grn_trl_id: '',
  item_table_id: 'item-1',
  item_name: 'Potatoes',
  packaging: '50 kg bag',
  qty: '120',
  weight: '1250.5',
  rack: '20B/F1/C4',
  package_mark: 'MARK001',
  trl_images: [image],
  errors: { qty: 'Enter a quantity.' },
};

function render(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Every colour used in a rendered tree, from host views and texts. */
function colours(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  tree.root.findAll(node => typeof node.type === 'string').forEach(node => {
    const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined;
    if (!style) return;
    for (const key of ['color', 'backgroundColor', 'borderColor']) {
      if (typeof style[key] === 'string') out.push(style[key] as string);
    }
  });
  return out;
}

describe.each(THEMES)('GRN item form components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders SavedItemCard with token colours and state tags', () => {
    const tree = render(brand, mode, (
      <SavedItemCard
        index={0}
        item={{ name: 'Potatoes', packaging: '50 kg bag', quantity: '1200', weight: 1250.5, rack: 'F1/C4', packageMark: 'M1', images: [image] }}
        isEditing
        isProtected
      />
    ));
    const used = colours(tree);
    expect(used).toContain(t.surface.selected);
    expect(used).toContain(t.status.critical.text);
    expect(used).toContain(t.text.primary);
    const texts = tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
    expect(texts).toEqual(expect.arrayContaining(['1,200', '1,250.5 kg', '1 photo', 'Editing', 'Quantity locked']));
  });

  it('renders the item entry strip and its parts', () => {
    const noop = jest.fn();
    const tree = render(brand, mode, (
      <>
        <HorizontalItemForm
          currentItem={item}
          onFieldChange={noop}
          onImagePick={noop}
          onImageRemove={noop}
          onSaveItem={noop}
          onViewAll={noop}
          isQtyLocked
          isValid
          isEditing={false}
          editingItemNumber={0}
          savedItemsCount={2}
        />
        <HeroBanner isEditing editingItemNumber={2} savedItemsCount={3} packaging="Bag" isValid={false} onSave={noop} />
        <ItemSearchField value="" onSelect={noop} error="Choose an item." />
        <QuantityWeightFields qty="1" weight="2" onQtyChange={noop} onWeightChange={noop} qtyError="Enter a quantity." />
        <RackChamberPicker value="20B/F1/C4" onChange={noop} error="Enter a rack." />
        <MarkImageField value="" onChange={noop} images={[image]} onImagePick={noop} onImageRemove={noop} />
        <ImagePreviewGrid imageData={[image, { ...image, id: 'img-2', uploadStatus: 'failed' }]} onRemoveImage={noop} />
        <ImageUploadButton currentImages={['a']} />
      </>
    ));
    const used = colours(tree);
    expect(used).toContain(t.brand.fill);
    expect(used).toContain(t.surface.field);
    expect(used).toContain(t.status.negative.text);
    expect(used).toContain(t.brand.subtle);
    expect(used).toContain(t.surface.fieldReadOnly);
    expect(used).toContain(t.overlay.scrim);
    const selected = tree.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityRole === 'radio' && n.props.accessibilityState?.selected);
    expect(selected.length).toBeGreaterThanOrEqual(4);
  });
});
