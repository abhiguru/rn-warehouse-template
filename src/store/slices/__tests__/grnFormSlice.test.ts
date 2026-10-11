import reducer, {
  addHeaderImage,
  addItem,
  addItemImage,
  adoptSavedLines,
  completeHeaderImageUpload,
  completeItemImageUpload,
  GRNItemData,
  loadGRNData,
  resetForm,
  setSaveUnconfirmed,
  setTakenNumberError,
  updateHeaderImageProgress,
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

describe('grnForm default date', () => {
  afterEach(() => jest.useRealTimers());

  it('is the day the form is reset, not the day the app was started', () => {
    // The app was started on 9 October and left open overnight.
    jest.useFakeTimers({ now: new Date(2026, 9, 9, 18, 0, 0) });
    let slice!: typeof import('../grnFormSlice');
    jest.isolateModules(() => {
      slice = require('../grnFormSlice');
    });
    expect(slice.default(undefined, { type: '@@init' }).header.date).toBe('2026-10-09');

    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));
    const state = slice.default(undefined, slice.resetForm());

    expect(state.header.date).toBe('2026-10-10');
    expect(state.header.gr_no).toBe('');
    expect(state.items).toEqual([]);
  });
});

describe('grnForm removed photos', () => {
  const { removeHeaderImage, removeItemImage, loadGRNData, resetForm, addHeaderImage } =
    jest.requireActual('../grnFormSlice') as typeof import('../grnFormSlice');
  const SAVED_HEADER = 'aaaaaaaa-2222-4333-8444-555555555555';
  const SAVED_ITEM = 'bbbbbbbb-2222-4333-8444-555555555555';
  const LINE = '55555555-2222-4333-8444-555555555555';

  const loaded = () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    return reducer(undefined, loadGRNData({
      grnId: '11111111-2222-4333-8444-555555555555',
      header: {
        gr_no: 'A0010', registration: '', date: '2026-10-01', sender_id: '', sender_name: 'Fictional Sender',
        customer_id: 'c', customer_name: 'Fictional Traders', supervisor_id: 's', supervisor_name: 'Fictional Supervisor',
        note: '', leon: false, pricing_mode: 'MONTHLY',
        gr_images: [{ id: SAVED_HEADER, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' }],
      },
      items: [{
        grn_trl_id: LINE, item_table_id: 'm', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '',
        trl_images: [{ id: SAVED_ITEM, fileName: 'mark.webp', imageUrl: 'https://example.invalid/mark', storagePath: 'items/g/l/mark.webp', uploadStatus: 'completed' }],
      }],
    }));
  };
  afterEach(() => jest.restoreAllMocks());

  it('remembers saved photos removed in the form, for the save to delete', () => {
    let state = loaded();
    state = reducer(state, removeHeaderImage(SAVED_HEADER));
    state = reducer(state, removeItemImage({ itemId: LINE, imageId: SAVED_ITEM }));

    expect(state.header.gr_images).toEqual([]);
    expect(state.items[0].trl_images).toEqual([]);
    expect(state.removedImages).toEqual([
      { id: SAVED_HEADER, storagePath: 'headers/g/book.webp' },
      { id: SAVED_ITEM, storagePath: 'items/g/l/mark.webp' },
    ]);
  });

  it('does not remember a photo that was only picked in this form', () => {
    let state = loaded();
    state = reducer(state, addHeaderImage({ id: 'temp_1', fileName: 'new.webp', imageUrl: 'file:///cache/new.webp', uploadStatus: 'completed' }));
    state = reducer(state, removeHeaderImage('temp_1'));

    expect(state.removedImages).toEqual([]);
  });

  it('forgets the removals when the form is discarded or another GRN is loaded', () => {
    const removed = reducer(loaded(), removeHeaderImage(SAVED_HEADER));
    expect(removed.removedImages).toHaveLength(1);

    expect(reducer(removed, resetForm()).removedImages).toEqual([]);
    expect(reducer(removed, loadGRNData({ grnId: 'other', header: removed.header, items: [] })).removedImages).toEqual([]);
  });
});

// RF-1: Save looks at the status, so a late progress report must not undo "prepared".
describe('grnForm photo status', () => {
  const prepared = { imageId: 'temp_1', imageUrl: 'file:///cache/prepared.webp', fileSize: 1200, mimeType: 'image/webp' };
  const picked = { id: 'temp_1', fileName: 'photo.jpg', imageUrl: 'file:///DCIM/photo.jpg', uploadStatus: 'uploading' as const };

  it('a progress report after the photo was prepared leaves it prepared', () => {
    let state = reducer(undefined, addHeaderImage(picked));
    state = reducer(state, completeHeaderImageUpload(prepared));
    state = reducer(state, updateHeaderImageProgress({ imageId: 'temp_1', progress: 60 }));
    expect(state.header.gr_images[0]).toMatchObject({ uploadStatus: 'completed', uploadProgress: 100, imageUrl: 'file:///cache/prepared.webp' });
  });
});

// RF-3: after an update whose answer was lost.
describe('grnForm lines the server already holds', () => {
  const line = (id: string): GRNItemData => ({
    grn_trl_id: id, item_table_id: 'master-1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 100, stock: 100, weight: 10, rack: '', package_mark: '', trl_images: [],
  });

  it('gives an adopted line its saved id and keeps everything else of it', () => {
    let state = reducer(undefined, addItem(line('55555555-2222-4333-8444-555555555555')));
    state = reducer(state, addItem({ ...line('item-new'), qty: 7 }));
    state = reducer(state, setSaveUnconfirmed(true));
    state = reducer(state, adoptSavedLines({ 'item-new': '99999999-2222-4333-8444-555555555555' }));
    expect(state.items.map((item) => [item.grn_trl_id, item.qty])).toEqual([
      ['55555555-2222-4333-8444-555555555555', 100],
      ['99999999-2222-4333-8444-555555555555', 7],
    ]);
    expect(state.saveUnconfirmed).toBe(true);
  });

  it('a freshly loaded or reset form is not marked', () => {
    let state = reducer(undefined, setSaveUnconfirmed(true));
    state = reducer(state, setTakenNumberError('taken'));
    state = reducer(state, loadGRNData({ header: state.header, items: [], grnId: 'g1' }));
    expect(state).toMatchObject({ saveUnconfirmed: false, takenNumberError: null });
    state = reducer(reducer(state, setSaveUnconfirmed(true)), resetForm());
    expect(state).toMatchObject({ saveUnconfirmed: false, takenNumberError: null });
  });
});
