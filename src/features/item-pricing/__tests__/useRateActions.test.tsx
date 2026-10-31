/**
 * Undo stop and Cancel new rate: the rates are read again after every undo, and an answer that did not come through says
 * the change could not be confirmed (not "Couldn't save the rate").
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { undoRateChange } from '@/services/item-pricing-service';
import { showAlert } from '@/utils/alert';
import { notifyRatesChanged } from '../contract';
import { useRateActions, type RateScope } from '../useRateActions';

jest.mock('@/services/item-pricing-service', () => ({ undoRateChange: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('../contract', () => ({ notifyRatesChanged: jest.fn(), stopPath: jest.fn() }));

const scope = { priceType: 'monthly', customerId: null, bands: [], upcoming: null, stopsAfter: '2026-12-31', seenRows: ['r1'] } as unknown as RateScope;
let actions!: ReturnType<typeof useRateActions>;
let tree: ReactTestRenderer | undefined;
const Probe = () => {
  actions = useRateActions({ id: 'item-1', name: 'Potatoes' });
  return null;
};
const UNCONFIRMED = "We couldn't confirm the change. Check the rates on this page before you try again.";

beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => { tree = create(<Probe />); });
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

it('an undo whose answer did not come through says so, and the rates are read again', async () => {
  jest.mocked(undoRateChange).mockResolvedValue({ success: false, errorCode: 'UNKNOWN', outcomeUnknown: true, message: UNCONFIRMED });
  await act(async () => { await actions.undoStop(scope); });
  expect(notifyRatesChanged).toHaveBeenCalledWith('item-1');
  expect(showAlert).toHaveBeenCalledWith(expect.any(String), UNCONFIRMED);
});

it('a real refusal keeps its own text', async () => {
  jest.mocked(undoRateChange).mockResolvedValue({ success: false, errorCode: 'NOTHING_TO_UNDO', message: 'There is nothing to undo.' });
  await act(async () => { await actions.undoStop(scope); });
  expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'There is nothing to undo.');
});
