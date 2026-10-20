/**
 * Creating and saving a dispatch through the form hook (review 2026-10-20):
 * - a new form is dated the day it opens, unless a date was picked (A1);
 * - the form has an id that is kept while it is sent again and is new for another form (A3);
 * - an answer that was lost locks the form while the server is asked what became of the request, and stops when the
 *   form is reset (owner rule D22);
 * - another dispatch holding the number is told with the next free number, which a number the form fetched is
 *   replaced by and a number the person typed is not (M4);
 * - a form that made its dispatch is emptied when its screen is left (M5);
 * - an edit goes by the dispatch of its route and refuses a form that holds another one (A2).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import dispatchFormReducer, {
  loadDispatchData,
  markDispNoTyped,
  refreshDefaultDate,
  resetForm,
  updateHeader,
} from '@/store/slices/dispatchFormSlice';
import { createEmptyDispatchHeader, type DispatchItemData } from '@/types/dispatch.types';
import { createDispatch, updateDispatch } from '@/features/dispatch/services/dispatchFormService';
import { showAlert } from '@/utils/alert';
import { toLocalISODate } from '@/utils/formatters';
import { useDispatchForm, type DispatchFormMode, type UseDispatchFormReturn } from '../useDispatchForm';

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
  loadDispatchData: jest.fn(),
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
const OTHER_ID = '99999999-2222-4333-8444-555555555555';

const header = {
  ...createEmptyDispatchHeader(),
  disp_no: 'DD0003',
  disp_date: '2026-10-02T00:00:00.000Z',
  registration: 'GJ01AB1234',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Fictional Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Fictional Supervisor',
};
const line = {
  unique_id: 'line-1',
  grns_id: '55555555-2222-4333-8444-555555555555',
  grns_gr_no: 'A0010',
  grns_date: '2026-10-01T00:00:00.000Z',
  grns_customer_name: 'Fictional Traders',
  grnItems_id: '66666666-2222-4333-8444-555555555555',
  grnItems_item_id: '77777777-2222-4333-8444-555555555555',
  grnItems_item_name: 'Example Potatoes',
  grnItems_quantity: 100,
  grnItems_stock: 90,
  grnItems_package_mark: '',
  grnItems_rack: '',
  grnItems_weight: 50,
  disp_quantity: 10,
} as DispatchItemData;

function makeStore() {
  return configureStore({
    reducer: { dispatchForm: dispatchFormReducer, auth: () => ({ userProfile: null }) },
  });
}
const fill = (store: ReturnType<typeof makeStore>, id = OWN_ID) =>
  store.dispatch(loadDispatchData({ dispatchId: id, header, items: [line] }));

async function mount(mode: DispatchFormMode, store: ReturnType<typeof makeStore>, dispatchIdParam?: string) {
  const latest: { current: UseDispatchFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useDispatchForm({ mode, dispatchIdParam });
    return null;
  };
  mockStore = store;
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}
async function submit(form: () => UseDispatchFormReturn) {
  let result!: Awaited<ReturnType<UseDispatchFormReturn['submitForm']>>;
  await act(async () => { result = await form().submitForm(); });
  return result;
}

const create_ = jest.mocked(createDispatch);
const update_ = jest.mocked(updateDispatch);

beforeEach(() => {
  jest.clearAllMocks();
  create_.mockReset();
  update_.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the date of a new form', () => {
  it('is the day the form opens, when the form is older than that', async () => {
    const store = makeStore();
    fill(store);
    store.dispatch(refreshDefaultDate('2020-01-01'));
    expect(store.getState().dispatchForm.header.disp_date).toBe('2020-01-01');

    const { unmount } = await mount('create', store);

    expect(store.getState().dispatchForm.header.disp_date).toBe(toLocalISODate(new Date()));
    await unmount();
  });

  it('is left alone when the person picked it', async () => {
    const store = makeStore();
    fill(store);
    store.dispatch(updateHeader({ disp_date: '2020-01-01' }));

    const { unmount } = await mount('create', store);

    expect(store.getState().dispatchForm.header.disp_date).toBe('2020-01-01');
    await unmount();
  });
});

describe('the id of a form', () => {
  it('is the same while the form is sent again, new for another form, and not kept after a save', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue({ success: false, error: 'Insufficient stock for one or more items' });

    await submit(form);
    await submit(form);
    const [first, second] = create_.mock.calls.map(([sent]) => sent.submissionNonce);
    expect(first).toEqual(expect.any(String));
    expect(first!.length).toBeGreaterThan(20);
    expect(second).toBe(first);

    // Another form with the same fields.
    await act(async () => { store.dispatch(resetForm()); fill(store); });
    await submit(form);
    const third = create_.mock.calls[2][0].submissionNonce;
    expect(third).toEqual(expect.any(String));
    expect(third).not.toBe(first);

    // A save: the id goes with it.
    create_.mockResolvedValue({ success: true, dispatch_id: 'saved-1', failed_photos: [] });
    await submit(form);
    expect(create_.mock.calls[3][0].submissionNonce).toBe(third);
    expect(store.getState().dispatchForm.submissionNonce).toBeNull();
    await unmount();
  });
});

describe('an answer that was lost (owner rule D22)', () => {
  it('locks the form while the server is asked, and opens it when the answer is known', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    let lockedWhileAsking: boolean | undefined;
    create_.mockImplementation(async (_payload, options) => {
      options!.onLostAnswer!();
      lockedWhileAsking = store.getState().dispatchForm.checkingAnswer;
      return { success: true, dispatch_id: 'saved-1', failed_photos: [] };
    });

    const result = await submit(form);

    expect(lockedWhileAsking).toBe(true);
    expect(result.success).toBe(true);
    expect(store.getState().dispatchForm.checkingAnswer).toBe(false);
    expect(form().isCheckingAnswer).toBe(false);
    await unmount();
  });

  it('shows the lock through the hook while it lasts', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    let finish!: () => void;
    create_.mockImplementation(async (_payload, options) => {
      options!.onLostAnswer!();
      await new Promise<void>((resolve) => { finish = resolve; });
      return { success: true, dispatch_id: 'saved-1', failed_photos: [] };
    });

    let pending!: Promise<unknown>;
    await act(async () => { pending = form().submitForm(); });
    expect(form().isCheckingAnswer).toBe(true);

    await act(async () => { finish(); await pending; });
    expect(form().isCheckingAnswer).toBe(false);
    await unmount();
  });

  it('hands the service the form id and the way to stop the check', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue({ success: true, dispatch_id: 'saved-1', failed_photos: [] });

    await submit(form);

    const sent = create_.mock.calls[0][0];
    expect(sent.items).toHaveLength(1);
    expect(sent.submissionNonce).toEqual(expect.any(String));
    // The options carry the way to stop the check
    expect(create_.mock.calls[0][1]!.signal).toBeInstanceOf(AbortSignal);
    await unmount();
  });

  it('stops the check, and says nothing, when the form is reset (the X) meanwhile', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    let signal!: AbortSignal;
    let finish!: () => void;
    create_.mockImplementation(async (_payload, options) => {
      signal = options!.signal!;
      options!.onLostAnswer!();
      await new Promise<void>((resolve) => { finish = resolve; });
      return { success: false, aborted: true, error: '' };
    });

    let pending!: Promise<Awaited<ReturnType<UseDispatchFormReturn['submitForm']>>>;
    await act(async () => { pending = form().submitForm(); });
    expect(signal.aborted).toBe(false);

    await act(async () => { form().resetFormState(); });
    expect(signal.aborted).toBe(true);
    expect(store.getState().dispatchForm.checkingAnswer).toBe(false);

    let result!: Awaited<ReturnType<UseDispatchFormReturn['submitForm']>>;
    await act(async () => { finish(); result = await pending; });
    expect(result).toEqual({ success: false, aborted: true });
    expect(showAlert).not.toHaveBeenCalled();
    await unmount();
  });

  it('stops the check when the screen goes', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    let signal!: AbortSignal;
    create_.mockImplementation(async (_payload, options) => {
      signal = options!.signal!;
      return { success: true, dispatch_id: 'saved-1', failed_photos: [] };
    });
    await submit(form);

    await unmount();

    expect(signal.aborted).toBe(true);
  });

  it('a save of an edit is asked about the same way', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('edit', store, OWN_ID);
    update_.mockImplementation(async (_id, _payload, options) => {
      options!.onLostAnswer!();
      return { success: true, dispatch_id: OWN_ID };
    });

    const result = await submit(form);

    expect(result.success).toBe(true);
    expect(update_.mock.calls[0][2]!.signal).toBeInstanceOf(AbortSignal);
    expect(store.getState().dispatchForm.checkingAnswer).toBe(false);
    await unmount();
  });

  it('is told, as any failure is, when the resent request is refused', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue({ success: false, error: 'Insufficient stock for one or more items' });

    const result = await submit(form);

    expect(result.success).toBe(false);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(store.getState().dispatchForm.items).toHaveLength(1);
    await unmount();
  });
});

describe('when another dispatch holds the number', () => {
  const refused = { success: false, reason: 'NUMBER_TAKEN' as const, number: 'DD0003', error: 'Duplicate dispatch detected' };

  it('a number the form fetched itself is replaced by the next free one, and the caller is told', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue(refused);

    const result = await submit(form);

    const message = 'Dispatch number DD0003 is already used. The next free number is DD0099.';
    expect(result).toMatchObject({ success: false, numberTaken: { message } });
    expect(showAlert).toHaveBeenCalledWith('Error', message);
    expect(store.getState().dispatchForm.header.disp_no).toBe('DD0099');
    expect(store.getState().dispatchForm.takenNumberError).toBeNull();
    await unmount();
  });

  it('a number the person typed is kept, and flagged until it is changed', async () => {
    const store = makeStore();
    fill(store);
    store.dispatch(markDispNoTyped());
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue(refused);

    const result = await submit(form);

    const message = 'Dispatch number DD0003 is already used. The next free number is DD0099.';
    expect(result.numberTaken?.message).toBe(message);
    expect(store.getState().dispatchForm.header.disp_no).toBe('DD0003');
    expect(store.getState().dispatchForm.takenNumberError).toBe(message);
    // Step 1 does not pass with it.
    let validation!: { isValid: boolean; errors: Record<string, string> };
    await act(async () => { validation = await form().validateCurrentStep(1); });
    expect(validation.errors.disp_no).toBe(message);
    await unmount();
  });

  it('in an edit the number is never replaced, and is flagged', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('edit', store, OWN_ID);
    update_.mockResolvedValue(refused);

    const result = await submit(form);

    expect(result.numberTaken).toBeDefined();
    expect(store.getState().dispatchForm.header.disp_no).toBe('DD0003');
    expect(store.getState().dispatchForm.takenNumberError).toMatch(/DD0003/);
    await unmount();
  });
});

describe('a form that made its dispatch', () => {
  it('is emptied when its screen is left, however it is left', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue({ success: true, dispatch_id: 'saved-1', order_lines_left: 2, failed_photos: [] });

    const result = await submit(form);

    expect(result).toMatchObject({ success: true, dispatchId: 'saved-1', orderLinesLeft: 2 });
    // Still there for the dialogs that follow the save.
    expect(store.getState().dispatchForm.savedDispatchId).toBe('saved-1');
    expect(store.getState().dispatchForm.header.disp_no).toBe('DD0003');

    await unmount();

    const form_ = store.getState().dispatchForm;
    expect(form_.savedDispatchId).toBeNull();
    expect(form_.items).toEqual([]);
    expect(form_.header.disp_no).toBe('');
  });

  it('leaves a new form alone when a way out has already emptied it (Create another)', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('create', store);
    create_.mockResolvedValue({ success: true, dispatch_id: 'saved-1', failed_photos: [] });
    await submit(form);

    await act(async () => { form().resetFormState(); });
    // The next form begins before the screen of the last one is gone.
    store.dispatch(updateHeader({ disp_no: 'DD0100' }));
    await unmount();

    expect(store.getState().dispatchForm.header.disp_no).toBe('DD0100');
  });

  it('an unsaved form is not touched when its screen is left', async () => {
    const store = makeStore();
    fill(store);
    const { unmount } = await mount('create', store);

    await unmount();

    expect(store.getState().dispatchForm.items).toHaveLength(1);
  });
});

describe('an edit goes by the dispatch of its route', () => {
  it('saves the dispatch of the route', async () => {
    const store = makeStore();
    fill(store);
    const { form, unmount } = await mount('edit', store, OWN_ID);
    update_.mockResolvedValue({ success: true, dispatch_id: OWN_ID });

    const result = await submit(form);

    expect(result.success).toBe(true);
    expect(update_).toHaveBeenCalledTimes(1);
    expect(update_.mock.calls[0][0]).toBe(OWN_ID);
    await unmount();
  });

  it('refuses to save when the form holds another dispatch', async () => {
    const store = makeStore();
    fill(store, OTHER_ID);
    const { form, unmount } = await mount('edit', store, OWN_ID);

    const result = await submit(form);

    expect(result.success).toBe(false);
    expect(update_).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error', 'This form belongs to a different dispatch. Go back and open the dispatch again.');
    await unmount();
  });

  it('refuses to go to a step when the form holds another dispatch, or none', async () => {
    const store = makeStore();
    fill(store, OTHER_ID);
    const { form, unmount } = await mount('edit', store, OWN_ID);

    let went = true;
    await act(async () => { went = await form().navigateToStep(2); });

    expect(went).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Error', 'This form belongs to a different dispatch. Go back and open the dispatch again.');

    await act(async () => { store.dispatch(resetForm()); });
    await act(async () => { went = await form().navigateToStep(2); });
    expect(went).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    await unmount();
  });
});
