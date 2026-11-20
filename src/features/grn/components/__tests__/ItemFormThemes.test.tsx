import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { SavedItemCard } from '../SavedItemCard';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';
import { ImagePreviewGrid } from '../ImagePreviewGrid';
import { ImageUploadButton } from '../ImageUploadButton';
import {
  HeroBanner,
  MarkImageField,
  QuantityWeightFields,
  RackChamberPicker,
} from '../item-form';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

async function renderThemed(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}

type Json = ReturnType<typeof screen.toJSON>;
/**
 * Every colour used on the screen, from host views and texts. A colour is not a role, a label or a text, so the rendered
 * tree (all host nodes) is walked; nothing in the queries reaches a style.
 */
function colours(): string[] {
  const out: string[] = [];
  const walk = (node: NonNullable<Json> | string) => {
    if (typeof node === 'string') return;
    const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined;
    if (style) {
      for (const key of ['color', 'backgroundColor', 'borderColor']) {
        if (typeof style[key] === 'string') out.push(style[key] as string);
      }
    }
    (node.children ?? []).forEach(walk);
  };
  const tree = screen.toJSON();
  (Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk);
  return out;
}

describe.each(THEMES)('GRN item form components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders SavedItemCard with token colours and state tags', async () => {
    await renderThemed(brand, mode, (
      <SavedItemCard
        index={0}
        item={{ name: 'Potatoes', packaging: '50 kg bag', quantity: '1200', weight: 1250.5, rack: 'F1/C4', packageMark: 'M1', images: [image] }}
        isEditing
        lock="quantity"
      />
    ));
    const used = colours();
    expect(used).toContain(t.surface.selected);
    expect(used).toContain(t.status.critical.text);
    expect(used).toContain(t.text.primary);
    for (const text of ['1,200', '1,250.5 kg each', '1', 'Editing', 'Quantity locked']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('1,250.5 kg')).not.toBeOnTheScreen();
  });

  it('renders the item entry strip and its parts', async () => {
    const noop = jest.fn();
    await renderThemed(brand, mode, (
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
        <QuantityWeightFields qty="1" weight="2" onQtyChange={noop} onWeightChange={noop} qtyError="Enter a quantity." />
        <RackChamberPicker value="20B/F1/C4" onChange={noop} error="Enter a rack." />
        <MarkImageField value="" onChange={noop} images={[image]} onImagePick={noop} onImageRemove={noop} />
        <ImagePreviewGrid imageData={[image, { ...image, id: 'img-2', uploadStatus: 'failed' }]} onRemoveImage={noop} />
        <ImageUploadButton currentImages={['a']} />
      </>
    ));
    const used = colours();
    expect(used).toContain(t.brand.fill);
    expect(used).toContain(t.surface.field);
    expect(used).toContain(t.status.negative.text);
    expect(used).toContain(t.brand.subtle);
    expect(used).toContain(t.surface.fieldReadOnly);
    expect(used).toContain(t.overlay.scrim);
    const selected = screen.getAllByRole('radio', { selected: true });
    expect(selected.length).toBeGreaterThanOrEqual(4);
  });
});
