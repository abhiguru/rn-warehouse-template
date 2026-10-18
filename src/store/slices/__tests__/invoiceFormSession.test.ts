/**
 * The invoice form's session and number state, and the "changed" selector.
 *
 * - The session number goes up with every reset, so a step 1 that is already
 *   open (under "Create another") sees that a new form began.
 * - The next invoice number is asked for by request; an answer counts only
 *   while its request is the latest.
 * - An invoice opened for editing keeps a baseline; the form is "changed" when
 *   what the person can edit differs from it.
 */
import reducer, {
  loadInvoiceEditData,
  loadInvoiceFormData,
  numberAnswered,
  numberCancelled,
  numberRequested,
  resetForm,
  selectInvoiceFormChanged,
  updateDiscount,
  updateEditedItem,
  updateHeader,
} from '../invoiceFormSlice';
import { editPayload, grnFormAnswer, invoiceLine, IDS } from '@/tests/helpers/invoiceFixtures';

type SliceState = ReturnType<typeof reducer>;
const root = (invoiceForm: SliceState) => ({ invoiceForm });
const fresh = () => reducer(undefined, { type: '@@init' });
const edited = (): SliceState => reducer(fresh(), loadInvoiceEditData(editPayload([invoiceLine({}, 0), invoiceLine({}, 1)])));

describe('the form session', () => {
  it('starts at 0 on step 1 and goes up by one on every reset', () => {
    const initial = fresh();
    expect(initial.formSession).toBe(0);
    expect(initial.currentStep).toBe(1);

    const once = reducer(initial, resetForm());
    const twice = reducer(once, resetForm());

    expect(once.formSession).toBe(1);
    expect(twice.formSession).toBe(2);
    expect(twice.currentStep).toBe(1);
  });

  it('empties the form and forgets the baseline and the number request', () => {
    let state = reducer(edited(), numberRequested(7));
    state = reducer(state, resetForm());

    expect(state.header.inv_no).toBe(0);
    expect(state.items).toEqual([]);
    expect(state.baseline).toBeNull();
    expect(state.numberStatus).toBe('idle');
    expect(state.numberRequestId).toBe(0);
  });
});

describe('the invoice number request', () => {
  it('puts the answer of the latest request in the field, as a suggestion', () => {
    let state = reducer(fresh(), numberRequested(3));
    expect(state.numberStatus).toBe('loading');

    state = reducer(state, numberAnswered({ id: 3, number: 55 }));

    expect(state.header).toMatchObject({ inv_no: 55, inv_no_typed: false });
    expect(state.numberStatus).toBe('idle');
  });

  it('ignores an answer whose request was replaced by a newer one', () => {
    let state = reducer(fresh(), numberRequested(3));
    state = reducer(state, numberRequested(4));

    state = reducer(state, numberAnswered({ id: 3, number: 55 }));

    expect(state.header.inv_no).toBe(0);
    expect(state.numberStatus).toBe('loading');
    state = reducer(state, numberAnswered({ id: 4, number: 56 }));
    expect(state.header.inv_no).toBe(56);
  });

  it('ignores an answer that arrives after a reset', () => {
    let state = reducer(fresh(), numberRequested(3));
    state = reducer(state, resetForm());

    state = reducer(state, numberAnswered({ id: 3, number: 55 }));

    expect(state.header.inv_no).toBe(0);
    expect(state.numberStatus).toBe('idle');
  });

  it('ignores an answer after the request was cancelled (a number was typed)', () => {
    let state = reducer(fresh(), numberRequested(3));
    state = reducer(state, numberCancelled());
    state = reducer(state, updateHeader({ inv_no: 7301, inv_no_typed: true }));

    state = reducer(state, numberAnswered({ id: 3, number: 55 }));

    expect(state.header.inv_no).toBe(7301);
    expect(state.numberStatus).toBe('idle');
  });

  it('empties the field and says it failed when no number came', () => {
    let state = reducer(fresh(), updateHeader({ inv_no: 55 }));
    state = reducer(state, numberRequested(3));

    state = reducer(state, numberAnswered({ id: 3, number: null }));

    expect(state.header.inv_no).toBe(0);
    expect(state.numberStatus).toBe('failed');
  });
});

describe('the baseline and the changed selector of an edit', () => {
  it('keeps the saved number, year and GRN, and is not changed when just loaded', () => {
    const state = edited();

    expect(state.baseline).toMatchObject({ inv_no: 42, inv_fin_year: '2026-27', gr_id: IDS.grn });
    expect(selectInvoiceFormChanged(root(state))).toBe(false);
  });

  it('is changed by a line rate, and not changed again when the rate is put back', () => {
    let state = edited();

    state = reducer(state, updateEditedItem({ temp_id: 'edit_0_0', values: { charge: 6 } }));
    expect(selectInvoiceFormChanged(root(state))).toBe(true);

    state = reducer(state, updateEditedItem({ temp_id: 'edit_0_0', values: { charge: 5 } }));
    expect(selectInvoiceFormChanged(root(state))).toBe(false);
  });

  it('is changed by the date, the number, a discount and a reason', () => {
    const base = edited();

    expect(selectInvoiceFormChanged(root(reducer(base, updateHeader({ inv_date: '2026-10-06' }))))).toBe(true);
    expect(selectInvoiceFormChanged(root(reducer(base, updateHeader({ inv_no: 43 }))))).toBe(true);
    expect(selectInvoiceFormChanged(root(reducer(base, updateDiscount(10))))).toBe(true);
    expect(selectInvoiceFormChanged(root(reducer(base, updateHeader({ zero_charge_reason: 'Sample lot' }))))).toBe(true);
  });

  it('does not count spaces typed in a reason, nor the header totals', () => {
    const base = edited();

    expect(selectInvoiceFormChanged(root(reducer(base, updateHeader({ zero_charge_reason: '   ' }))))).toBe(false);
    expect(selectInvoiceFormChanged(root(reducer(base, updateHeader({ total: 1 }))))).toBe(false);
  });

  it('is changed by choosing another GRN', () => {
    const state = reducer(edited(), loadInvoiceFormData({
      ...grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn }, 5)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }).data,
      grId: IDS.otherGrn,
    }));

    expect(selectInvoiceFormChanged(root(state))).toBe(true);
    expect(state.baseline?.gr_id).toBe(IDS.grn);
  });

  it('is never changed in a new invoice, which has no saved copy', () => {
    const state = reducer(fresh(), updateHeader({ inv_no: 12, inv_date: '2026-10-05' }));

    expect(state.baseline).toBeNull();
    expect(selectInvoiceFormChanged(root(state))).toBe(false);
  });
});
