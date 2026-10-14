/**
 * restoreItemImages: "Discard changes" on a saved line of the GRN items step.
 * A photo added to or removed from a saved line reaches the store before the
 * line is checkmarked, and a removed saved photo waits in `removedImages` to
 * be deleted when the GRN is saved. Discarding the correction takes both back.
 */
import reducer, {
  addItemImage,
  loadGRNData,
  removeHeaderImage,
  removeItemImage,
  restoreItemImages,
  type GRNImageData,
} from '../grnFormSlice';

const LINE = '55555555-2222-4333-8444-555555555555';
const OTHER_LINE = '55555555-2222-4333-8444-666666666666';
const SAVED_HEADER = 'aaaaaaaa-2222-4333-8444-555555555555';
const photo = (id: string): GRNImageData => ({
  id,
  fileName: `${id}.webp`,
  imageUrl: `https://example.invalid/${id}`,
  storagePath: `items/g/l/${id}.webp`,
  uploadStatus: 'completed',
});
const FIRST = photo('bbbbbbbb-2222-4333-8444-000000000001');
const SECOND = photo('bbbbbbbb-2222-4333-8444-000000000002');
const OTHER = photo('bbbbbbbb-2222-4333-8444-000000000003');
const PICKED: GRNImageData = { id: 'temp_1', fileName: 'new.webp', imageUrl: 'file:///cache/new.webp', uploadStatus: 'completed' };

const itemLine = (id: string, images: GRNImageData[]) => ({
  grn_trl_id: id, item_table_id: 'm', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '',
  trl_images: images,
});
const loaded = () =>
  reducer(undefined, loadGRNData({
    grnId: '11111111-2222-4333-8444-555555555555',
    header: {
      gr_no: 'A0010', registration: '', date: '2026-10-01', sender_id: '', sender_name: 'Fictional Sender',
      customer_id: 'c', customer_name: 'Fictional Traders', supervisor_id: 's', supervisor_name: 'Fictional Supervisor',
      note: '', leon: false, pricing_mode: 'MONTHLY',
      gr_images: [{ id: SAVED_HEADER, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' }],
    },
    items: [itemLine(LINE, [FIRST, SECOND]), itemLine(OTHER_LINE, [OTHER])],
  }));

describe('grnForm restoreItemImages', () => {
  it('puts a removed saved photo back and takes it off the list of photos to delete', () => {
    const before = loaded();
    const removed = reducer(before, removeItemImage({ itemId: LINE, imageId: FIRST.id }));
    expect(removed.items[0].trl_images).toEqual([SECOND]);
    expect(removed.removedImages).toEqual([{ id: FIRST.id, storagePath: FIRST.storagePath }]);

    const restored = reducer(removed, restoreItemImages({ itemId: LINE, images: before.items[0].trl_images }));

    expect(restored.items[0].trl_images).toEqual([FIRST, SECOND]);
    expect(restored.removedImages).toEqual([]);
  });

  it('takes a photo picked in the correction out again', () => {
    const before = loaded();
    const added = reducer(before, addItemImage({ itemId: LINE, imageData: PICKED }));
    expect(added.items[0].trl_images).toHaveLength(3);

    const restored = reducer(added, restoreItemImages({ itemId: LINE, images: before.items[0].trl_images }));

    expect(restored.items[0].trl_images).toEqual([FIRST, SECOND]);
    expect(restored.removedImages).toEqual([]);
  });

  it('leaves the removals of other lines and of the header as they are', () => {
    let state = loaded();
    const before = state.items[0].trl_images;
    state = reducer(state, removeHeaderImage(SAVED_HEADER));
    state = reducer(state, removeItemImage({ itemId: OTHER_LINE, imageId: OTHER.id }));
    state = reducer(state, removeItemImage({ itemId: LINE, imageId: SECOND.id }));
    const otherLine = state.items[1];

    const restored = reducer(state, restoreItemImages({ itemId: LINE, images: before }));

    expect(restored.removedImages).toEqual([
      { id: SAVED_HEADER, storagePath: 'headers/g/book.webp' },
      { id: OTHER.id, storagePath: OTHER.storagePath },
    ]);
    expect(restored.items[1]).toBe(otherLine);
    expect(restored.header.gr_images).toEqual([]);
  });

  it('keeps a photo that an earlier, checkmarked correction removed on the list to delete', () => {
    // FIRST was removed and the line saved; the next correction starts from [SECOND].
    const earlier = reducer(loaded(), removeItemImage({ itemId: LINE, imageId: FIRST.id }));
    const baseline = earlier.items[0].trl_images;
    const next = reducer(earlier, removeItemImage({ itemId: LINE, imageId: SECOND.id }));
    expect(next.removedImages).toHaveLength(2);

    const restored = reducer(next, restoreItemImages({ itemId: LINE, images: baseline }));

    expect(restored.items[0].trl_images).toEqual([SECOND]);
    expect(restored.removedImages).toEqual([{ id: FIRST.id, storagePath: FIRST.storagePath }]);
  });

  it('does nothing for a line the form does not hold', () => {
    const state = reducer(loaded(), removeItemImage({ itemId: LINE, imageId: FIRST.id }));

    expect(reducer(state, restoreItemImages({ itemId: 'item-not-stored', images: [FIRST] }))).toBe(state);
  });
});
