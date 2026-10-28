/**
 * The date of a new dispatch moves to another financial year (1 April): under a financial-year numbering rule the
 * suggested number is asked again for the new date; a number the person typed is never replaced; under another rule
 * nothing changes (WS-8, backend migration 127).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import dispatchFormReducer, {
  loadDispatchData,
  loadFromOrder,
  updateItem,
  markDispNoTyped,
  refreshDefaultDate,
  resetForm,
  setIsSaving,
  updateHeader,
} from '@/store/slices/dispatchFormSlice';
import { createEmptyDispatchHeader, type DispatchItemData } from '@/types/dispatch.types';
import { getNextDispatchNumber } from '@/features/dispatch/services/dispatchFormService';
import { numberForNewDate } from '@/services/documentNumberingService';
import { OrderService } from '@/services/order-service';
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
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));
jest.mock('@/services/documentNumberingService', () => ({ numberForNewDate: jest.fn() }));
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
    expect(numberForNewDate).toHaveBeenCalledWith('dispatch', '2027-04-02');
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
    expect(getNextDispatchNumber).toHaveBeenCalledWith('2027-03-30');
    await unmount();
  });
});
