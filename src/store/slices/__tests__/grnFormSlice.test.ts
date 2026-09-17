import reducer, {
  addItem,
  addItemImage,
  completeItemImageUpload,
  GRNItemData,
} from '../grnFormSlice';

describe('grnForm item image uploads', () => {
  it('replaces the temporary image id with the persisted id and storage path', () => {
    const item: GRNItemData = {
      grn_trl_id: 'item-1',
      item_table_id: 'master-1',
      item_name: 'Example Potatoes',
      packaging: 'Bag',
      qty: 100,
      stock: 100,
      weight: 10,
      rack: 'HOFF3/F2/C2',
      package_mark: 'MARKG4',
      trl_images: [],
    };

    let state = reducer(undefined, addItem(item));
    state = reducer(state, addItemImage({
      itemId: item.grn_trl_id,
      imageData: {
        id: 'temp_123',
        fileName: 'fixture.webp',
        imageUrl: 'file:///fixture.webp',
        uploadStatus: 'uploading',
      },
    }));

    state = reducer(state, completeItemImageUpload({
      itemId: item.grn_trl_id,
      imageId: 'temp_123',
      persistedImageId: '11111111-2222-4333-8444-555555555555',
      imageUrl: 'http://localhost/signed/fixture.webp',
      storagePath: 'items/grn/item/fixture.webp',
      fileSize: 3482,
      mimeType: 'image/webp',
    }));

    expect(state.items[0].trl_images).toEqual([
      expect.objectContaining({
        id: '11111111-2222-4333-8444-555555555555',
        storagePath: 'items/grn/item/fixture.webp',
        uploadStatus: 'completed',
        uploadProgress: 100,
      }),
    ]);
  });
});
