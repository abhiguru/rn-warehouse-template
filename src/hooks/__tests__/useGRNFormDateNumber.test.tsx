/**
 * The date of a new GRN moves to another financial year (1 April): under a financial-year numbering rule the suggested
 * number is asked again for the new date; a number the person typed is never replaced; under another rule nothing is
 * asked (WS-8, backend migration 127).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import grnFormReducer, { updateHeader, setGrNoTyped } from '@/store/slices/grnFormSlice';
import { getNextGRNNumber } from '@/features/grn/services/grnFormService';
import { numberForNewDate } from '@/services/documentNumberingService';
import { useGRNForm, type UseGRNFormReturn, type GRNFormMode } from '../useGRNForm';

let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/grn/services/grnFormService', () => ({
  checkGrnExists: jest.fn(),
  loadGRNData: jest.fn(),
  getNextGRNNumber: jest.fn(async () => 'A0099'),
  createGRN: jest.fn(),
  updateGRN: jest.fn(),
}));
jest.mock('@/services/documentNumberingService', () => ({ numberForNewDate: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ generateTempGRNId: () => 'temp_grn_fixture' }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const makeStore = () => configureStore({ reducer: { grnForm: grnFormReducer, auth: () => ({ userProfile: null }) } });

async function mount(mode: GRNFormMode, store: ReturnType<typeof makeStore>) {
  const latest: { current: UseGRNFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useGRNForm({ mode, grnIdParam: undefined });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  mockStore = store;
  await act(async () => { tree = create(<Harness />); });
  return { form: () => latest.current!, unmount: () => act(async () => { tree.unmount(); }) };
}
/** A new form that holds a suggested number for 30 March 2027. */
const newForm = (typed = false) => {
  const store = makeStore();
  store.dispatch(updateHeader({ gr_no: 'GRN/26-27/0042', date: '2027-03-30' }));
  if (typed) store.dispatch(setGrNoTyped(true));
  return store;
};
const setDate = async (form: () => UseGRNFormReturn, date: string) => { await act(async () => { form().updateHeaderField('date', date); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('a financial-year rule', () => {
  beforeEach(() => jest.mocked(numberForNewDate).mockResolvedValue('GRN/27-28/0001'));

  it('asks again for the new date when it crosses 1 April, and puts the new number in', async () => {
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(numberForNewDate).toHaveBeenCalledWith('grn', '2027-04-02', expect.any(Function));
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/27-28/0001');
    expect(store.getState().grnForm.header.date).toBe('2027-04-02');
    await unmount();
  });

  it('asks again when the date goes back across 1 April too', async () => {
    const store = makeStore();
    store.dispatch(updateHeader({ gr_no: 'GRN/27-28/0001', date: '2027-04-02' }));
    const { form, unmount } = await mount('create', store);
    jest.mocked(numberForNewDate).mockResolvedValue('GRN/26-27/0042');
    await setDate(form, '2027-03-30');
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await unmount();
  });

  it('does not ask for a date in the same financial year', async () => {
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-02-10');
    expect(numberForNewDate).not.toHaveBeenCalled();
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await unmount();
  });

  it('never replaces a number the person typed', async () => {
    const store = newForm(true);
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).not.toHaveBeenCalled();
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await unmount();
  });

  it('drops the answer when the person types the number meanwhile', async () => {
    let answer!: (value: string) => void;
    jest.mocked(numberForNewDate).mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    await act(async () => { store.dispatch(setGrNoTyped(true)); });
    await act(async () => { answer('GRN/27-28/0001'); });
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await unmount();
  });

  it('does not touch the number of a GRN being edited (its number is locked)', async () => {
    const { form, unmount } = await mount('edit', newForm());
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('another rule (letters, sequence) or an older backend', () => {
  it('asks, but the answer says leave the number (null) and the form keeps it', async () => {
    jest.mocked(numberForNewDate).mockResolvedValue(null);
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    expect(store.getState().grnForm.header.date).toBe('2027-04-02');
    await unmount();
  });

  it('keeps the number when the question fails', async () => {
    jest.mocked(numberForNewDate).mockRejectedValue(new Error('offline'));
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await unmount();
  });
});

describe('the first suggestion', () => {
  it('is asked for the form\'s date', async () => {
    const store = makeStore();
    store.dispatch(updateHeader({ gr_no: '', date: '2027-03-30' }));
    const { unmount } = await mount('create', store);
    expect(getNextGRNNumber).toHaveBeenCalledWith('2027-03-30', expect.any(Function));
    await unmount();
  });
});

describe('answers that arrive late or fail', () => {
  const emptyForm = () => {
    const store = makeStore();
    store.dispatch(updateHeader({ gr_no: '', date: '2027-03-30' }));
    return store;
  };

  it('keeps the number of the newer date when the slow first suggestion arrives after it', async () => {
    let first!: (value: string) => void;
    jest.mocked(getNextGRNNumber).mockReturnValueOnce(new Promise(resolve => { first = resolve; }));
    jest.mocked(numberForNewDate).mockResolvedValue('GRN/27-28/0001');
    const store = emptyForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/27-28/0001');
    await act(async () => { first('GRN/26-27/0042'); });
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/27-28/0001');
    await unmount();
  });

  it('asks again on the next change of the date inside the new year when the first re-ask failed', async () => {
    jest.mocked(numberForNewDate).mockRejectedValueOnce(new Error('offline')).mockResolvedValue('GRN/27-28/0001');
    const store = newForm();
    const { form, unmount } = await mount('create', store);
    await setDate(form, '2027-04-02');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
    await setDate(form, '2027-04-03');
    expect(numberForNewDate).toHaveBeenCalledTimes(2);
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/27-28/0001');
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
    jest.mocked(getNextGRNNumber).mockRejectedValueOnce(new Error('offline'));
    jest.mocked(numberForNewDate).mockResolvedValue('GRN/26-27/0042');
    const store = emptyForm();
    const { form, unmount } = await mount('create', store);
    expect(store.getState().grnForm.header.gr_no).toBe('');
    await setDate(form, '2027-03-31');
    expect(numberForNewDate).toHaveBeenCalledTimes(1);
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/26-27/0042');
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
    await act(async () => { answers[2]('GRN/27-28/0001'); });
    await act(async () => { answers[1]('GRN/25-26/0300'); });
    await act(async () => { answers[0]('GRN/27-28/0777'); });
    expect(store.getState().grnForm.header.gr_no).toBe('GRN/27-28/0001');
    await unmount();
  });
});

describe('what the rule says about the box', () => {
  it('gives the pattern after the first suggestion and, with no number, the reason', async () => {
    jest.mocked(getNextGRNNumber).mockImplementationOnce(async (_date, onOffer) => {
      onOffer?.({ hint: null, reason: 'TYPE_IT' });
      return '';
    });
    const store = makeStore();
    store.dispatch(updateHeader({ gr_no: '', date: '2027-03-30' }));
    const { form, unmount } = await mount('create', store);
    expect(form().numberReason).toBe('TYPE_IT');
    expect(form().numberHint).toBeNull();
    await unmount();
  });

  it('is empty on a backend that does not say (older than migration 127)', async () => {
    const store = makeStore();
    store.dispatch(updateHeader({ gr_no: '', date: '2027-03-30' }));
    const { form, unmount } = await mount('create', store);
    expect(form().numberReason).toBeNull();
    expect(form().numberHint).toBeNull();
    await unmount();
  });

  it('follows the rule again after the date moved to another year', async () => {
    jest.mocked(numberForNewDate).mockImplementation(async (_type, _date, onOffer) => {
      onOffer?.({ hint: 'GRN/27-28/####', reason: null });
      return 'GRN/27-28/0001';
    });
    const { form, unmount } = await mount('create', newForm());
    await setDate(form, '2027-04-02');
    expect(form().numberHint).toBe('GRN/27-28/####');
    await unmount();
  });
});
