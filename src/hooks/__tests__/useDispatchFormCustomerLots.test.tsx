/**
 * A dispatch only takes stock of its own customer: a line known to come from
 * another customer's GRN keeps the items and review steps from passing.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import dispatchFormReducer, { loadDispatchData } from '@/store/slices/dispatchFormSlice';
import { createEmptyDispatchHeader, type DispatchItemData } from '@/types/dispatch.types';
import { useDispatchForm, type UseDispatchFormReturn } from '../useDispatchForm';

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

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const CUSTOMER_A = '33333333-2222-4333-8444-555555555555';
const CUSTOMER_B = '88888888-2222-4333-8444-555555555555';

const header = {
  ...createEmptyDispatchHeader(),
  disp_no: 'DD0003',
  disp_date: '2026-10-02T00:00:00.000Z',
  registration: 'GJ01AB1234',
  customer_id: CUSTOMER_A,
  customer_name: 'Fictional Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Fictional Supervisor',
};
const line = (overrides: Partial<DispatchItemData>): DispatchItemData => ({
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
  ...overrides,
} as DispatchItemData);

function makeStore() {
  return configureStore({
    reducer: { dispatchForm: dispatchFormReducer, auth: () => ({ userProfile: null }) },
  });
}

async function validate(items: DispatchItemData[], step: number) {
  mockStore = makeStore();
  mockStore.dispatch(loadDispatchData({ dispatchId: DISPATCH_ID, header, items }));
  const latest: { current: UseDispatchFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useDispatchForm({ mode: 'edit', dispatchIdParam: DISPATCH_ID });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  let result!: { isValid: boolean; errors: Record<string, string> };
  await act(async () => { result = await latest.current!.validateCurrentStep(step); });
  await act(async () => { tree.unmount(); });
  return result;
}

describe("another customer's stock in a dispatch", () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  const foreign = line({
    unique_id: 'line-2',
    grns_gr_no: 'B0007',
    grns_customer_name: 'Fictional Stores',
    grns_customer_id: CUSTOMER_B,
    grnItems_id: '99999999-2222-4333-8444-555555555555',
  });

  it.each([2, 3])('keeps step %i from passing and names the GRN', async (step) => {
    const result = await validate([line({ grns_customer_id: CUSTOMER_A }), foreign], step);

    expect(result.isValid).toBe(false);
    expect(result.errors.items).toMatch(/B0007/);
  });

  it.each([2, 3])("lets step %i pass with the customer's own stock", async (step) => {
    const result = await validate([line({ grns_customer_id: CUSTOMER_A })], step);

    expect(result).toEqual({ isValid: true, errors: {} });
  });

  it('leaves a saved line whose GRN customer is not known to the server', async () => {
    expect((await validate([line({})], 2)).isValid).toBe(true);
  });
});
