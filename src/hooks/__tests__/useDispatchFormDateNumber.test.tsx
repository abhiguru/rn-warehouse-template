/**
 * The date of a new dispatch moves to another financial year (1 April): under a financial-year numbering rule the
 * suggested number is asked again for the new date; a number the person typed is never replaced; under another rule
 * nothing changes (WS-8, backend migration 127).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import dispatchFormReducer, {
  loadDispatchData,
  markDispNoTyped,
  resetForm,
  updateHeader,
} from '@/store/slices/dispatchFormSlice';
import { createEmptyDispatchHeader, type DispatchItemData } from '@/types/dispatch.types';
import { getNextDispatchNumber } from '@/features/dispatch/services/dispatchFormService';
import { numberForNewDate } from '@/services/documentNumberingService';
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
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));
jest.mock('@/services/documentNumberingService', () => ({ numberForNewDate: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  LOCAL_PHOTO_OWNERS: { camera: 'camera', grnForm: 'grn-form', dispatchForm: 'dispatch-form' },
  releaseLocalPhotos: jest.fn(async () => 0),
  releaseLocalPhotosOwnedBy: jest.fn(async () => 0),
}));

const OWN_ID = '11111111-2222-4333-8444-555555555555';

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
const newForm = (typed = false, mode: DispatchFormMode = 'create') => {
  const store = makeStore();
  store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header: { ...header, disp_no: 'D/26-27/0042', disp_date: '2027-03-30' }, items: [line] }));
  if (mode === 'create') store.dispatch(resetForm());
  store.dispatch(updateHeader({ disp_no: 'D/26-27/0042', disp_date: '2027-03-30' }));
  if (typed) store.dispatch(markDispNoTyped());
  return store;
};
const setDate = async (form: () => UseDispatchFormReturn, date: string) => { await act(async () => { form().updateHeaderField('disp_date', date); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(numberForNewDate).mockResolvedValue('D/27-28/0001');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('under a financial-year rule', () => {
  it('asks again for the new date when it crosses 1 April, and puts the new number in', async () => {
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(numberForNewDate).toHaveBeenCalledWith('dispatch', '2027-04-02', expect.any(Function));
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/27-28/0001');
    await unmount();
  });

  it('does not ask for a date in the same financial year', async () => {
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-01-15');
    expect(numberForNewDate).not.toHaveBeenCalled();
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await unmount();
  });

  it('never replaces a number the person typed', async () => {
    const store = newForm(true);
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).not.toHaveBeenCalled();
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await unmount();
  });

  it('drops the answer when the person types the number meanwhile', async () => {
    let answer!: (value: string) => void;
    jest.mocked(numberForNewDate).mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    await act(async () => { store.dispatch(markDispNoTyped()); });
    await act(async () => { answer('D/27-28/0001'); });
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await unmount();
  });

  it('does not touch the number of a dispatch being edited', async () => {
    const store = makeStore();
    store.dispatch(loadDispatchData({ dispatchId: OWN_ID, header: { ...header, disp_no: 'D/26-27/0042', disp_date: '2027-03-30' }, items: [line] }));
    const { form, unmount } = await mount('edit', store, OWN_ID);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('under another rule or an older backend', () => {
  it('the answer says leave the number (null), and the form keeps it with the new date', async () => {
    jest.mocked(numberForNewDate).mockResolvedValue(null);
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    expect(store.getState().dispatchForm.header.disp_date).toBe('2027-04-02');
    await unmount();
  });

  it('keeps the number when the question fails', async () => {
    jest.mocked(numberForNewDate).mockRejectedValue(new Error('offline'));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await unmount();
  });
});

describe('the suggestion of a form with no number', () => {
  it('is asked for the form\'s date', async () => {
    const store = makeStore();
    store.dispatch(updateHeader({ disp_no: '', disp_date: '2027-03-30' }));
    const { unmount } = await mount('create', store);
    expect(getNextDispatchNumber).toHaveBeenCalledWith('2027-03-30', expect.any(Function));
    await unmount();
  });
});

describe('answers that arrive late or fail', () => {
  it('keeps the number of the newer date when the slow first suggestion arrives after it', async () => {
    let first!: (value: string) => void;
    jest.mocked(getNextDispatchNumber).mockReturnValueOnce(new Promise(resolve => { first = resolve; }));
    const store = emptyHeaderStore();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/27-28/0001');
    await act(async () => { first('D/26-27/0042'); });
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/27-28/0001');
    await unmount();
  });

  it('asks again on the next change of the date inside the new year when the first re-ask failed', async () => {
    jest.mocked(numberForNewDate).mockRejectedValueOnce(new Error('offline'));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await setDate(form, '2027-04-03');
    expect(numberForNewDate).toHaveBeenCalledTimes(2);
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/27-28/0001');
    await unmount();
  });

  it('does not ask again inside the new year once the number was fetched for it', async () => {
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    await setDate(form, '2027-04-03');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('asks again when the first suggestion failed and the date then changes inside the same year', async () => {
    jest.mocked(getNextDispatchNumber).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(numberForNewDate).mockResolvedValue('D/26-27/0042');
    const store = emptyHeaderStore();
    const { form, unmount } = await mount('create', store);
    expect(store.getState().dispatchForm.header.disp_no).toBe('');
    await setDate(form, '2027-03-31');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/26-27/0042');
    await unmount();
  });

  it('keeps the answer of the newer of two quick date changes, whichever arrives first', async () => {
    const answers: Array<(value: string | null) => void> = [];
    jest.mocked(numberForNewDate).mockImplementation(() => new Promise(resolve => { answers.push(resolve); }));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    await setDate(form, '2026-03-30');
    await setDate(form, '2027-04-05');
    expect(answers).toHaveLength(3);
    await act(async () => { answers[2]('D/27-28/0001'); });
    await act(async () => { answers[1]('D/25-26/0300'); });
    await act(async () => { answers[0]('D/27-28/0777'); });
    expect(store.getState().dispatchForm.header.disp_no).toBe('D/27-28/0001');
    await unmount();
  });
});

describe('what the rule says about the box', () => {
  it('gives the reason after a first suggestion with no number', async () => {
    jest.mocked(getNextDispatchNumber).mockImplementationOnce(async (_date, onOffer) => {
      onOffer?.({ hint: null, reason: 'SERIES_FULL' });
      return '';
    });
    const { form, unmount } = await mount('create', emptyHeaderStore());
    expect(form().numberReason).toBe('SERIES_FULL');
    expect(form().numberHint).toBeNull();
    await unmount();
  });

  it('gives the pattern after a first suggestion', async () => {
    jest.mocked(getNextDispatchNumber).mockImplementationOnce(async (_date, onOffer) => {
      onOffer?.({ hint: 'D/26-27/####', reason: null });
      return 'D/26-27/0042';
    });
    const { form, unmount } = await mount('create', emptyHeaderStore());
    expect(form().numberHint).toBe('D/26-27/####');
    expect(form().numberReason).toBeNull();
    await unmount();
  });

  it('is empty on a backend that does not say (older than migration 127)', async () => {
    const { form, unmount } = await mount('create', emptyHeaderStore());
    expect(form().numberHint).toBeNull();
    expect(form().numberReason).toBeNull();
    await unmount();
  });

  it('follows the rule again after the date moved to another year', async () => {
    jest.mocked(numberForNewDate).mockImplementation(async (_type, _date, onOffer) => {
      onOffer?.({ hint: 'D/27-28/####', reason: null });
      return 'D/27-28/0001';
    });
    const { form, unmount } = await mount('create', newForm());
    await setDate(form, '2027-04-02');
    expect(form().numberHint).toBe('D/27-28/####');
    await unmount();
  });
});

function emptyHeaderStore() {
  const store = makeStore();
  store.dispatch(updateHeader({ disp_no: '', disp_date: '2027-03-30' }));
  return store;
}
